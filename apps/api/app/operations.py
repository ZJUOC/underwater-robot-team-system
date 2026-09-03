from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import models, schemas
from .config import get_settings
from .database import get_db


router = APIRouter(prefix="/api/operations", tags=["admin operations"])
FILE_LIMIT = 500 * 1024 * 1024
ALLOWED_SUFFIXES = {"pdf", "ppt", "pptx", "doc", "docx", "xls", "xlsx", "zip", "txt", "md", "mp4", "mov", "mkv", "webm"}
ATTENDANCE_STATUSES = {"unmarked", "present", "late", "leave", "absent"}
PROJECT_STAGES = {"application", "midterm", "final"}


def _utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def balanced_member_groups(candidates: list[models.Member], team_size: int) -> list[list[models.Member]]:
    if not candidates:
        return []
    team_count = (len(candidates) + team_size - 1) // team_size
    groups: list[list[models.Member]] = [[] for _ in range(team_count)]
    for index, member in enumerate(candidates):
        groups[index % team_count].append(member)
    return groups


def _current_user(request: Request, db: Session) -> models.User:
    user = db.get(models.User, int(request.state.auth["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已停用")
    return user


def _require_admin(user: models.User) -> None:
    if user.role not in {"super_admin", "admin"}:
        raise HTTPException(status_code=403, detail="当前账号没有管理员权限")


def _audit(db: Session, user: models.User, action: str, resource_type: str, resource_id: str, detail: dict | None = None) -> None:
    db.add(models.AuditLog(actor=user.display_name, action=action, resource_type=resource_type,
                           resource_id=resource_id, detail=detail or {}))


def _member_rows(db: Session) -> list[models.Member]:
    return list(db.scalars(select(models.Member).where(
        models.Member.lifecycle_stage == "member", models.Member.is_deleted.is_(False),
    ).order_by(models.Member.department, models.Member.name)).all())


def _member_options(db: Session) -> list[dict]:
    return [{"id": row.id, "name": row.name, "student_id": row.student_id,
             "department": row.department, "grade": row.grade} for row in _member_rows(db)]


def _task_read(row: models.RoutineTask, members: dict[int, models.Member]) -> dict:
    submissions = [{**item, "member_name": members.get(int(item["member_id"])).name
                    if members.get(int(item["member_id"])) else "未知成员"} for item in row.submissions]
    return {"id": row.id, "title": row.title, "description": row.description, "due_at": row.due_at,
            "status": row.status, "assignee_ids": row.assignee_ids, "submissions": submissions,
            "created_at": row.created_at, "updated_at": row.updated_at}


def _course_read(row: models.CourseSession) -> dict:
    return {"id": row.id, "title": row.title, "starts_at": row.starts_at,
            "duration_minutes": row.duration_minutes, "location": row.location,
            "description": row.description, "status": row.status, "materials": row.materials,
            "attendance": row.attendance, "created_at": row.created_at, "updated_at": row.updated_at}


def _team_read(row: models.SetpTeam, members: dict[int, models.Member]) -> dict:
    return {"id": row.id, "name": row.name, "status": row.status, "member_ids": row.member_ids,
            "leader_member_id": row.leader_member_id,
            "members": [{"id": member_id, "name": members[member_id].name,
                         "department": members[member_id].department, "grade": members[member_id].grade,
                         "is_leader": member_id == row.leader_member_id}
                        for member_id in row.member_ids if member_id in members]}


def _project_read(row: models.SetpProject, teams: dict[int, models.SetpTeam]) -> dict:
    if row.issue_records:
        last_period = datetime.fromisoformat(row.issue_records[-1]["period_start"])
        next_issue_due = last_period + timedelta(days=14)
    else:
        next_issue_due = row.created_at + timedelta(days=14)
    return {"id": row.id, "team_id": row.team_id, "team_name": teams[row.team_id].name if row.team_id in teams else "未分组",
            "title": row.title, "summary": row.summary, "status": row.status,
            "budget_total": row.budget_total, "application": row.application,
            "issue_records": row.issue_records, "midterm": row.midterm, "final": row.final,
            "expenses": row.expenses, "next_issue_due": next_issue_due,
            "issue_overdue": _utcnow() > next_issue_due,
            "created_at": row.created_at, "updated_at": row.updated_at}


async def _store_upload(upload: UploadFile, category: str) -> dict:
    filename = (upload.filename or "未命名文件").replace("\\", "/").rsplit("/", 1)[-1][:240]
    suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail=f"暂不支持 {filename} 的文件类型")
    file_id = uuid4().hex
    storage_root = (Path(get_settings().material_storage_dir).resolve() / "operations")
    storage_root.mkdir(parents=True, exist_ok=True)
    target = storage_root / f"{file_id}.{suffix}"
    size = 0
    digest = hashlib.sha256()
    try:
        with target.open("wb") as output:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > FILE_LIMIT:
                    raise HTTPException(status_code=413, detail="单个资料文件不能超过 500 MB")
                digest.update(chunk)
                output.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return {"id": file_id, "category": category, "original_name": filename,
            "stored_name": target.name, "content_type": upload.content_type or "application/octet-stream",
            "size": size, "sha256": digest.hexdigest(), "uploaded_at": _utcnow().isoformat()}


def _get_or_404(db: Session, model, row_id: int, label: str):
    row = db.get(model, row_id)
    if not row:
        raise HTTPException(status_code=404, detail=f"{label}不存在")
    return row


@router.get("/members")
def list_member_options(db: Session = Depends(get_db)):
    return _member_options(db)


@router.get("/tasks")
def list_tasks(db: Session = Depends(get_db)):
    members = {row.id: row for row in _member_rows(db)}
    return [_task_read(row, members) for row in db.scalars(select(models.RoutineTask).order_by(models.RoutineTask.created_at.desc())).all()]


@router.post("/tasks", status_code=201)
def create_task(payload: schemas.RoutineTaskWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = models.RoutineTask(**payload.model_dump())
    db.add(row)
    db.flush()
    _audit(db, user, "operations.task.create", "routine_task", str(row.id))
    db.commit()
    db.refresh(row)
    return _task_read(row, {item.id: item for item in _member_rows(db)})


@router.put("/tasks/{task_id}")
def update_task(task_id: int, payload: schemas.RoutineTaskWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.RoutineTask, task_id, "任务")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    _audit(db, user, "operations.task.update", "routine_task", str(row.id))
    db.commit()
    db.refresh(row)
    return _task_read(row, {item.id: item for item in _member_rows(db)})


@router.post("/tasks/{task_id}/submissions", status_code=201)
async def register_submission(task_id: int, request: Request, member_id: int = Form(...), summary: str = Form(""),
                              file: Optional[UploadFile] = File(None), db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.RoutineTask, task_id, "任务")
    member = _get_or_404(db, models.Member, member_id, "成员")
    attachment = await _store_upload(file, "task_submission") if file else None
    submission = {"id": uuid4().hex, "member_id": member.id, "summary": summary,
                  "status": "submitted", "feedback": "", "score": None,
                  "submitted_at": _utcnow().isoformat(), "file": attachment}
    row.submissions = [*row.submissions, submission]
    _audit(db, user, "operations.task.submission.register", "routine_task", str(row.id), {"member_id": member.id})
    db.commit()
    return submission


@router.put("/tasks/{task_id}/submissions/{submission_id}")
def review_submission(task_id: int, submission_id: str, payload: schemas.TaskSubmissionReview,
                      request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.RoutineTask, task_id, "任务")
    submissions = list(row.submissions)
    for index, item in enumerate(submissions):
        if item["id"] == submission_id:
            submissions[index] = {**item, **payload.model_dump(), "reviewed_at": _utcnow().isoformat()}
            row.submissions = submissions
            _audit(db, user, "operations.task.submission.review", "routine_task", str(row.id))
            db.commit()
            return submissions[index]
    raise HTTPException(status_code=404, detail="作业提交不存在")


@router.get("/classes")
def list_classes(db: Session = Depends(get_db)):
    return [_course_read(row) for row in db.scalars(select(models.CourseSession).order_by(models.CourseSession.starts_at.desc())).all()]


@router.post("/classes", status_code=201)
def create_class(payload: schemas.CourseSessionWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = models.CourseSession(**payload.model_dump())
    db.add(row)
    db.flush()
    _audit(db, user, "operations.class.create", "course_session", str(row.id))
    db.commit()
    db.refresh(row)
    return _course_read(row)


@router.put("/classes/{session_id}")
def update_class(session_id: int, payload: schemas.CourseSessionWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.CourseSession, session_id, "课时")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    _audit(db, user, "operations.class.update", "course_session", str(row.id))
    db.commit()
    db.refresh(row)
    return _course_read(row)


@router.post("/classes/{session_id}/materials", status_code=201)
async def upload_class_material(session_id: int, request: Request, title: str = Form(...), kind: str = Form("document"),
                                file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.CourseSession, session_id, "课时")
    material = {**await _store_upload(file, f"class_{kind}"), "title": title, "kind": kind}
    row.materials = [*row.materials, material]
    _audit(db, user, "operations.class.material.upload", "course_session", str(row.id), {"file_id": material["id"]})
    db.commit()
    return material


@router.get("/attendance/{session_id}")
def get_attendance(session_id: int, db: Session = Depends(get_db)):
    row = _get_or_404(db, models.CourseSession, session_id, "课时")
    return {"session": _course_read(row), "members": [{**member, **row.attendance.get(str(member["id"]), {"status": "unmarked", "note": ""})}
                                                     for member in _member_options(db)]}


@router.put("/attendance/{session_id}")
def save_attendance(session_id: int, payload: schemas.AttendanceWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    if payload.status not in ATTENDANCE_STATUSES:
        raise HTTPException(status_code=422, detail="考勤状态不受支持")
    row = _get_or_404(db, models.CourseSession, session_id, "课时")
    _get_or_404(db, models.Member, payload.member_id, "成员")
    row.attendance = {**row.attendance, str(payload.member_id): {"status": payload.status, "note": payload.note,
                                                                "checked_at": _utcnow().isoformat()}}
    _audit(db, user, "operations.attendance.update", "course_session", str(row.id), {"member_id": payload.member_id})
    db.commit()
    return row.attendance[str(payload.member_id)]


@router.get("/setp/teams")
def list_setp_teams(db: Session = Depends(get_db)):
    members = {row.id: row for row in _member_rows(db)}
    return [_team_read(row, members) for row in db.scalars(select(models.SetpTeam).order_by(models.SetpTeam.id)).all()]


@router.post("/setp/teams", status_code=201)
def create_setp_team(payload: schemas.SetpTeamWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    valid_ids = {row.id for row in _member_rows(db)}
    if not set(payload.member_ids).issubset(valid_ids):
        raise HTTPException(status_code=422, detail="组员必须是正式成员")
    leader = payload.leader_member_id if payload.leader_member_id in payload.member_ids else (payload.member_ids[0] if payload.member_ids else None)
    row = models.SetpTeam(name=payload.name, member_ids=payload.member_ids, leader_member_id=leader, status=payload.status)
    db.add(row)
    db.flush()
    _audit(db, user, "operations.setp.team.create", "setp_team", str(row.id))
    db.commit()
    db.refresh(row)
    return _team_read(row, {item.id: item for item in _member_rows(db)})


@router.put("/setp/teams/{team_id}")
def update_setp_team(team_id: int, payload: schemas.SetpTeamWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.SetpTeam, team_id, "SETP 小组")
    valid_ids = {item.id for item in _member_rows(db)}
    if not set(payload.member_ids).issubset(valid_ids):
        raise HTTPException(status_code=422, detail="组员必须是正式成员")
    for other in db.scalars(select(models.SetpTeam).where(models.SetpTeam.id != team_id)).all():
        other.member_ids = [member_id for member_id in other.member_ids if member_id not in payload.member_ids]
        if other.leader_member_id not in other.member_ids:
            other.leader_member_id = other.member_ids[0] if other.member_ids else None
    row.name = payload.name
    row.member_ids = payload.member_ids
    row.status = payload.status
    row.leader_member_id = payload.leader_member_id if payload.leader_member_id in payload.member_ids else (payload.member_ids[0] if payload.member_ids else None)
    _audit(db, user, "operations.setp.team.update", "setp_team", str(row.id))
    db.commit()
    db.refresh(row)
    return _team_read(row, {item.id: item for item in _member_rows(db)})


@router.post("/setp/teams/smart", status_code=201)
def smart_setp_teams(payload: schemas.SmartTeamRequest, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    existing_ids = {member_id for row in db.scalars(select(models.SetpTeam)).all() for member_id in row.member_ids}
    candidates = [row for row in _member_rows(db) if row.id not in existing_ids]
    if not candidates:
        raise HTTPException(status_code=409, detail="没有尚未组队的正式成员")
    buckets = balanced_member_groups(candidates, payload.team_size)
    created = []
    for index, bucket in enumerate(buckets, 1):
        row = models.SetpTeam(name=f"{payload.name_prefix} {index}", member_ids=[item.id for item in bucket],
                              leader_member_id=bucket[0].id, status="active")
        db.add(row)
        db.flush()
        created.append(row)
    _audit(db, user, "operations.setp.team.smart", "setp_team", "batch", {"count": len(created)})
    db.commit()
    members = {row.id: row for row in _member_rows(db)}
    return [_team_read(row, members) for row in created]


@router.get("/setp/projects")
def list_projects(db: Session = Depends(get_db)):
    teams = {row.id: row for row in db.scalars(select(models.SetpTeam)).all()}
    return [_project_read(row, teams) for row in db.scalars(select(models.SetpProject).order_by(models.SetpProject.updated_at.desc())).all()]


@router.post("/setp/projects", status_code=201)
def create_project(payload: schemas.SetpProjectWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    if payload.team_id:
        _get_or_404(db, models.SetpTeam, payload.team_id, "SETP 小组")
    row = models.SetpProject(**payload.model_dump(),
        application={"status": "draft", "review_notes": "", "documents": []},
        midterm={"status": "not_started", "review_notes": "", "defense_record": "", "documents": []},
        final={"status": "not_started", "review_notes": "", "defense_record": "", "documents": []})
    db.add(row)
    db.flush()
    _audit(db, user, "operations.setp.project.create", "setp_project", str(row.id))
    db.commit()
    db.refresh(row)
    teams = {item.id: item for item in db.scalars(select(models.SetpTeam)).all()}
    return _project_read(row, teams)


@router.put("/setp/projects/{project_id}")
def update_project(project_id: int, payload: schemas.SetpProjectWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.SetpProject, project_id, "项目")
    if payload.team_id:
        _get_or_404(db, models.SetpTeam, payload.team_id, "SETP 小组")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    _audit(db, user, "operations.setp.project.update", "setp_project", str(row.id))
    db.commit()
    db.refresh(row)
    teams = {item.id: item for item in db.scalars(select(models.SetpTeam)).all()}
    return _project_read(row, teams)


@router.post("/setp/projects/{project_id}/documents/{stage}", status_code=201)
async def upload_project_document(project_id: int, stage: str, request: Request, title: str = Form(...), kind: str = Form("document"),
                                  file: UploadFile = File(...), db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    if stage not in PROJECT_STAGES:
        raise HTTPException(status_code=422, detail="项目材料阶段不受支持")
    row = _get_or_404(db, models.SetpProject, project_id, "项目")
    document = {**await _store_upload(file, f"project_{stage}_{kind}"), "title": title, "kind": kind}
    section = dict(getattr(row, stage) or {})
    section["documents"] = [*section.get("documents", []), document]
    setattr(row, stage, section)
    _audit(db, user, "operations.setp.project.document", "setp_project", str(row.id), {"stage": stage, "file_id": document["id"]})
    db.commit()
    return document


@router.post("/setp/projects/{project_id}/issues", status_code=201)
def add_project_issue(project_id: int, payload: schemas.ProjectIssueWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.SetpProject, project_id, "项目")
    record = {"id": uuid4().hex, **payload.model_dump(mode="json"), "submitted_at": _utcnow().isoformat()}
    row.issue_records = [*row.issue_records, record]
    _audit(db, user, "operations.setp.project.issue", "setp_project", str(row.id))
    db.commit()
    return record


@router.put("/setp/projects/{project_id}/reviews/{stage}")
def save_project_review(project_id: int, stage: str, payload: schemas.ProjectReviewWrite,
                        request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    if stage not in PROJECT_STAGES:
        raise HTTPException(status_code=422, detail="项目审核阶段不受支持")
    row = _get_or_404(db, models.SetpProject, project_id, "项目")
    section = {**(getattr(row, stage) or {}), **payload.model_dump(), "reviewed_at": _utcnow().isoformat()}
    setattr(row, stage, section)
    row.status = payload.status
    _audit(db, user, "operations.setp.project.review", "setp_project", str(row.id), {"stage": stage})
    db.commit()
    return section


@router.post("/setp/projects/{project_id}/expenses", status_code=201)
def add_project_expense(project_id: int, payload: schemas.ProjectExpenseWrite, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_admin(user)
    row = _get_or_404(db, models.SetpProject, project_id, "项目")
    expense = {"id": uuid4().hex, **payload.model_dump(mode="json"), "created_at": _utcnow().isoformat()}
    row.expenses = [*row.expenses, expense]
    _audit(db, user, "operations.setp.project.expense", "setp_project", str(row.id))
    db.commit()
    return expense


@router.get("/files/{file_id}")
def download_file(file_id: str, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    course_files = [material for session in db.scalars(select(models.CourseSession)).all() for material in session.materials]
    metadata = next((item for item in course_files if item.get("id") == file_id), None)
    if not metadata:
        _require_admin(user)
        admin_files: list[dict] = []
        for task in db.scalars(select(models.RoutineTask)).all():
            admin_files.extend(item["file"] for item in task.submissions if item.get("file"))
        for project in db.scalars(select(models.SetpProject)).all():
            for stage in PROJECT_STAGES:
                admin_files.extend((getattr(project, stage) or {}).get("documents", []))
        metadata = next((item for item in admin_files if item.get("id") == file_id), None)
    if not metadata:
        raise HTTPException(status_code=404, detail="资料不存在")
    storage_root = (Path(get_settings().material_storage_dir).resolve() / "operations")
    target = (storage_root / metadata["stored_name"]).resolve()
    if target.parent != storage_root or not target.is_file():
        raise HTTPException(status_code=404, detail="资料文件不存在")
    return FileResponse(target, media_type=metadata["content_type"], filename=metadata["original_name"])
