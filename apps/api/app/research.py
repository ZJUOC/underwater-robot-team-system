from __future__ import annotations

import csv
import hashlib
import io
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload
from starlette.concurrency import run_in_threadpool

from . import models, schemas
from .config import get_settings
from .database import get_db
from .material_parser import extract_material_text
from .providers import MockAIProvider, ResearchAssessmentOutput, get_ai_provider


router = APIRouter(prefix="/api/research", tags=["research review"])

ALLOWED_SUFFIXES = {
    "xlsx", "xls", "csv", "pdf", "docx", "pptx", "txt", "md", "json",
    "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff",
}
FILE_LIMIT = 15 * 1024 * 1024
PACKAGE_LIMIT = 40 * 1024 * 1024
MATERIAL_KINDS = {"team_report", "architecture", "sources", "process", "other"}

DEFAULT_INSTRUCTIONS = {
    "team_size": 3,
    "duration_days": 7,
    "team_deliverables": [
        "6-10 页水下机器人调研报告",
        "一张系统结构图",
        "至少 3 个典型系统案例对比",
        "包含标题、来源、链接和使用位置的参考资料清单",
        "团队分工表与简要过程记录",
    ],
    "individual_deliverables": [
        "个人实际贡献",
        "关键结论",
        "遇到的困难",
        "资料可靠性验证方式",
        "最感兴趣的技术方向",
    ],
}

DEFAULT_RUBRIC = [
    {"key": "source_quality", "label": "信息准确性与来源质量", "scope": "team", "max_score": 12},
    {"key": "technical_depth", "label": "技术覆盖度与理解深度", "scope": "team", "max_score": 12},
    {"key": "comparison", "label": "案例比较和独立结论", "scope": "team", "max_score": 8},
    {"key": "presentation", "label": "结构、图表与表达质量", "scope": "team", "max_score": 4},
    {"key": "club_relevance", "label": "对社团项目的参考价值", "scope": "team", "max_score": 4},
    {"key": "contribution", "label": "可验证的实际贡献", "scope": "individual", "max_score": 20},
    {"key": "understanding", "label": "对负责内容的理解程度", "scope": "individual", "max_score": 15},
    {"key": "research", "label": "调研和解决问题能力", "scope": "individual", "max_score": 10},
    {"key": "responsibility", "label": "责任意识与按时交付", "scope": "individual", "max_score": 10},
    {"key": "reflection", "label": "复盘和学习意愿", "scope": "individual", "max_score": 5},
]


def _current_user(request: Request, db: Session) -> models.User:
    user = db.get(models.User, int(request.state.auth["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已停用")
    return user


def _require_manager(user: models.User) -> None:
    if user.role not in {"super_admin", "admin", "reviewer"}:
        raise HTTPException(status_code=403, detail="当前账号没有调研审核管理权限")


def _require_editable(team: models.CandidateTeam) -> None:
    if team.status == "decided":
        raise HTTPException(status_code=409, detail="该小队已完成最终决策，当前审核记录只读")


def _team_options():
    return (
        selectinload(models.CandidateTeam.task),
        selectinload(models.CandidateTeam.members).selectinload(models.CandidateTeamMember.member),
        selectinload(models.CandidateTeam.submissions).selectinload(models.ResearchSubmission.files),
        selectinload(models.CandidateTeam.submissions).selectinload(models.ResearchSubmission.contributions).selectinload(models.IndividualContribution.team_member).selectinload(models.CandidateTeamMember.member),
        selectinload(models.CandidateTeam.submissions).selectinload(models.ResearchSubmission.assessment).selectinload(models.TeamAssessment.candidates).selectinload(models.CandidateAssessment.member),
        selectinload(models.CandidateTeam.reviews).selectinload(models.HumanReview.reviewer),
        selectinload(models.CandidateTeam.reviews).selectinload(models.HumanReview.member),
        selectinload(models.CandidateTeam.decisions).selectinload(models.AdmissionDecision.decider),
        selectinload(models.CandidateTeam.decisions).selectinload(models.AdmissionDecision.member),
    )


def _get_team(db: Session, team_id: int) -> models.CandidateTeam:
    team = db.scalar(select(models.CandidateTeam).where(models.CandidateTeam.id == team_id).options(*_team_options()))
    if not team:
        raise HTTPException(status_code=404, detail="调研小队不存在")
    return team


def _latest_submission(team: models.CandidateTeam) -> Optional[models.ResearchSubmission]:
    return max(team.submissions, key=lambda item: item.version) if team.submissions else None


def _ensure_draft_submission(db: Session, team: models.CandidateTeam) -> models.ResearchSubmission:
    current = _latest_submission(team)
    if current and current.status == "draft":
        return current
    version = (current.version + 1) if current else 1
    row = models.ResearchSubmission(team_id=team.id, version=version, status="draft")
    db.add(row)
    db.flush()
    return row


def _member_read(item: models.CandidateTeamMember) -> schemas.CandidateTeamMemberRead:
    return schemas.CandidateTeamMemberRead(
        id=item.id, member_id=item.member_id, name=item.member.name,
        student_id=item.member.student_id, major=item.member.major,
        desired_department=item.member.desired_department,
        role_summary=item.role_summary, is_leader=item.is_leader,
    )


def _candidate_assessment_read(item: models.CandidateAssessment) -> schemas.CandidateAssessmentRead:
    return schemas.CandidateAssessmentRead(
        **schemas.CandidateAssessmentRead.model_validate(item).model_dump(exclude={"member_name"}),
        member_name=item.member.name,
    )


def _assessment_read(item: models.TeamAssessment) -> schemas.TeamAssessmentRead:
    return schemas.TeamAssessmentRead(
        id=item.id, status=item.status, model_version=item.model_version,
        prompt_version=item.prompt_version, summary=item.summary, team_score=item.team_score,
        criteria=item.criteria, evidence=item.evidence, conflicts=item.conflicts,
        missing_information=item.missing_information, suggested_questions=item.suggested_questions,
        candidates=[_candidate_assessment_read(row) for row in item.candidates],
        created_at=item.created_at,
    )


def _review_read(item: models.HumanReview) -> schemas.HumanReviewRead:
    return schemas.HumanReviewRead(
        id=item.id, team_id=item.team_id, member_id=item.member_id, reviewer_id=item.reviewer_id,
        reviewer_name=item.reviewer.display_name, status=item.status,
        recommendation=item.recommendation, criteria_scores=item.criteria_scores,
        summary=item.summary, concerns=item.concerns,
        follow_up_questions=item.follow_up_questions, submitted_at=item.submitted_at,
        updated_at=item.updated_at,
    )


def _decision_read(item: models.AdmissionDecision) -> schemas.AdmissionDecisionRead:
    return schemas.AdmissionDecisionRead(
        id=item.id, team_id=item.team_id, member_id=item.member_id,
        status=item.status, reason=item.reason, decided_by=item.decided_by,
        decider_name=item.decider.display_name, decided_at=item.decided_at,
    )


def _submission_read(item: models.ResearchSubmission) -> schemas.ResearchSubmissionRead:
    contributions = []
    for row in item.contributions:
        contributions.append(schemas.IndividualContributionRead(
            id=row.id, submission_id=row.submission_id, team_member_id=row.team_member_id,
            role_summary=row.team_member.role_summary, contribution=row.contribution,
            key_findings=row.key_findings, challenges=row.challenges,
            source_validation=row.source_validation, preferred_direction=row.preferred_direction,
            peer_confirmation=row.peer_confirmation, updated_at=row.updated_at,
        ))
    return schemas.ResearchSubmissionRead(
        id=item.id, team_id=item.team_id, version=item.version, status=item.status,
        note=item.note, submitted_at=item.submitted_at,
        files=[schemas.SubmissionFileRead.model_validate(row) for row in item.files],
        contributions=contributions,
    )


def _team_summary(team: models.CandidateTeam) -> schemas.CandidateTeamSummary:
    submission = _latest_submission(team)
    assessment = submission.assessment if submission else None
    return schemas.CandidateTeamSummary(
        id=team.id, task_id=team.task_id, task_title=team.task.title, name=team.name,
        status=team.status, due_at=team.task.due_at,
        members=[_member_read(item) for item in team.members],
        file_count=len(submission.files) if submission else 0,
        contribution_count=len(submission.contributions) if submission else 0,
        team_score=assessment.team_score if assessment else None,
        decision_count=len(team.decisions), submitted_at=team.submitted_at,
        updated_at=team.updated_at,
    )


def _team_detail(team: models.CandidateTeam) -> schemas.CandidateTeamDetail:
    summary = _team_summary(team)
    submission = _latest_submission(team)
    assessment = submission.assessment if submission else None
    return schemas.CandidateTeamDetail(
        **summary.model_dump(), task=schemas.ResearchTaskRead.model_validate(team.task),
        submission=_submission_read(submission) if submission else None,
        assessment=_assessment_read(assessment) if assessment else None,
        reviews=[_review_read(row) for row in team.reviews],
        decisions=[_decision_read(row) for row in team.decisions],
    )


@router.get("/tasks", response_model=list[schemas.ResearchTaskRead])
def list_tasks(db: Session = Depends(get_db)):
    return db.scalars(select(models.ResearchTask).order_by(models.ResearchTask.created_at.desc())).all()


@router.post("/tasks", response_model=schemas.ResearchTaskRead, status_code=201)
def create_task(payload: schemas.ResearchTaskCreate, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_manager(user)
    starts_at = payload.starts_at or datetime.utcnow()
    row = models.ResearchTask(
        title=payload.title, description=payload.description,
        instructions=DEFAULT_INSTRUCTIONS, rubric=DEFAULT_RUBRIC,
        duration_days=payload.duration_days, starts_at=starts_at,
        due_at=payload.due_at or starts_at + timedelta(days=payload.duration_days),
    )
    db.add(row)
    db.flush()
    db.add(models.AuditLog(actor=user.display_name, action="research.task.create", resource_type="research_task", resource_id=str(row.id), detail={"title": row.title}))
    db.commit()
    db.refresh(row)
    return row


@router.get("/teams", response_model=list[schemas.CandidateTeamSummary])
def list_teams(db: Session = Depends(get_db)):
    rows = db.scalars(select(models.CandidateTeam).options(*_team_options()).order_by(models.CandidateTeam.updated_at.desc())).all()
    return [_team_summary(row) for row in rows]


@router.post("/teams", response_model=schemas.CandidateTeamDetail, status_code=201)
def create_team(payload: schemas.CandidateTeamCreate, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_manager(user)
    if len(set(payload.member_ids)) != 3:
        raise HTTPException(status_code=422, detail="一个调研小队必须由 3 名不同候选人组成")
    task = db.get(models.ResearchTask, payload.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="调研任务不存在")
    members = db.scalars(select(models.Member).where(models.Member.id.in_(payload.member_ids), models.Member.is_deleted.is_(False))).all()
    if len(members) != 3 or any(item.lifecycle_stage != "applicant" for item in members):
        raise HTTPException(status_code=422, detail="小队成员必须是 3 名有效报名者")
    occupied = db.scalar(select(models.CandidateTeamMember.id).join(models.CandidateTeam).where(
        models.CandidateTeam.task_id == task.id, models.CandidateTeamMember.member_id.in_(payload.member_ids),
    ).limit(1))
    if occupied:
        raise HTTPException(status_code=409, detail="有候选人已被分配到该任务的其他小队")
    row = models.CandidateTeam(task_id=task.id, name=payload.name, status="assigned")
    db.add(row)
    db.flush()
    leader = payload.leader_member_id if payload.leader_member_id in payload.member_ids else payload.member_ids[0]
    for member_id in payload.member_ids:
        db.add(models.CandidateTeamMember(team_id=row.id, member_id=member_id, is_leader=member_id == leader))
    db.add(models.AuditLog(actor=user.display_name, action="research.team.create", resource_type="candidate_team", resource_id=str(row.id), detail={"member_ids": payload.member_ids}))
    db.commit()
    return _team_detail(_get_team(db, row.id))


@router.get("/teams/{team_id}", response_model=schemas.CandidateTeamDetail)
def get_team(team_id: int, db: Session = Depends(get_db)):
    return _team_detail(_get_team(db, team_id))


@router.post("/teams/{team_id}/files", response_model=schemas.ResearchSubmissionRead)
async def upload_files(
    team_id: int, request: Request, files: list[UploadFile] = File(...),
    kind: str = Form("team_report"), member_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    user = _current_user(request, db)
    _require_manager(user)
    team = _get_team(db, team_id)
    _require_editable(team)
    if not files or len(files) > 10:
        raise HTTPException(status_code=422, detail="请上传 1-10 份材料")
    if kind not in MATERIAL_KINDS:
        raise HTTPException(status_code=422, detail="材料类型不受支持")
    if member_id and member_id not in {item.member_id for item in team.members}:
        raise HTTPException(status_code=422, detail="个人材料必须关联到小队成员")
    submission = _ensure_draft_submission(db, team)
    storage_root = Path(get_settings().material_storage_dir).resolve()
    storage_root.mkdir(parents=True, exist_ok=True)
    total_size = sum(item.size for item in submission.files)
    for upload in files:
        filename = (upload.filename or "未命名资料").replace("\\", "/").rsplit("/", 1)[-1][:240]
        suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if suffix not in ALLOWED_SUFFIXES:
            raise HTTPException(status_code=415, detail=f"暂不支持 {filename} 的文件类型")
        chunks: list[bytes] = []
        size = 0
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > FILE_LIMIT or total_size + size > PACKAGE_LIMIT:
                raise HTTPException(status_code=413, detail="单文件最大 15 MB，资料包最大 40 MB")
            chunks.append(chunk)
        content = b"".join(chunks)
        total_size += size
        digest = hashlib.sha256(content).hexdigest()
        stored_name = f"{uuid4().hex}.{suffix}"
        target = storage_root / stored_name
        target.write_bytes(content)
        extraction = await run_in_threadpool(extract_material_text, content, suffix)
        row = models.SubmissionFile(
            submission_id=submission.id, member_id=member_id, kind=kind,
            original_name=filename, stored_name=stored_name, suffix=suffix,
            content_type=upload.content_type or "application/octet-stream",
            size=size, sha256=digest, extraction_status=extraction.status,
            extracted_text=extraction.text, extraction_report=extraction.report(filename, suffix, size),
            segments=extraction.segments,
        )
        db.add(row)
    team.status = "in_progress"
    db.add(models.AuditLog(actor=user.display_name, action="research.files.upload", resource_type="candidate_team", resource_id=str(team.id), detail={"count": len(files), "kind": kind}))
    db.commit()
    return _submission_read(_latest_submission(_get_team(db, team.id)))


@router.put("/teams/{team_id}/contributions/{member_id}", response_model=schemas.IndividualContributionRead)
def save_contribution(
    team_id: int, member_id: int, payload: schemas.IndividualContributionWrite,
    request: Request, db: Session = Depends(get_db),
):
    user = _current_user(request, db)
    _require_manager(user)
    team = _get_team(db, team_id)
    _require_editable(team)
    team_member = next((item for item in team.members if item.member_id == member_id), None)
    if not team_member:
        raise HTTPException(status_code=404, detail="该候选人不在小队中")
    submission = _ensure_draft_submission(db, team)
    row = db.scalar(select(models.IndividualContribution).where(
        models.IndividualContribution.submission_id == submission.id,
        models.IndividualContribution.team_member_id == team_member.id,
    ))
    values = payload.model_dump(exclude={"role_summary"})
    if row:
        for key, value in values.items():
            setattr(row, key, value)
    else:
        row = models.IndividualContribution(submission_id=submission.id, team_member_id=team_member.id, **values)
        db.add(row)
    if payload.role_summary.strip():
        team_member.role_summary = payload.role_summary.strip()
    team.status = "in_progress"
    db.commit()
    db.refresh(row)
    return schemas.IndividualContributionRead(
        id=row.id, submission_id=row.submission_id, team_member_id=row.team_member_id,
        role_summary=team_member.role_summary, contribution=row.contribution,
        key_findings=row.key_findings, challenges=row.challenges,
        source_validation=row.source_validation, preferred_direction=row.preferred_direction,
        peer_confirmation=row.peer_confirmation, updated_at=row.updated_at,
    )


@router.post("/teams/{team_id}/submit", response_model=schemas.CandidateTeamDetail)
def submit_team(team_id: int, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_manager(user)
    team = _get_team(db, team_id)
    _require_editable(team)
    submission = _latest_submission(team)
    if not submission:
        raise HTTPException(status_code=422, detail="请先上传团队调研材料")
    if not any(item.kind == "team_report" for item in submission.files):
        raise HTTPException(status_code=422, detail="至少需要一份团队调研报告")
    if len(submission.contributions) != 3:
        raise HTTPException(status_code=422, detail="三名候选人都必须提交个人贡献说明")
    submission.status = "submitted"
    submission.submitted_at = datetime.utcnow()
    team.status = "submitted"
    team.submitted_at = submission.submitted_at
    db.add(models.AuditLog(actor=user.display_name, action="research.submission.submit", resource_type="candidate_team", resource_id=str(team.id), detail={"submission_id": submission.id}))
    db.commit()
    return _team_detail(_get_team(db, team.id))


def _validated_output(output: ResearchAssessmentOutput, materials: list[dict]) -> ResearchAssessmentOutput:
    sources = {
        (item["filename"], segment.get("locator", "全文")): " ".join(str(segment.get("text", "")).split())
        for item in materials for segment in item.get("segments", [])
    }

    def valid(citation) -> bool:
        haystack = sources.get((citation.filename, citation.locator), "")
        return bool(citation.quote.strip()) and " ".join(citation.quote.split()) in haystack

    for criterion in output.criteria:
        criterion.evidence = [item for item in criterion.evidence if valid(item)]
    output.evidence = [item for item in output.evidence if valid(item)]
    for candidate in output.candidates:
        candidate.evidence = [item for item in candidate.evidence if valid(item)]
        for criterion in candidate.criteria:
            criterion.evidence = [item for item in criterion.evidence if valid(item)]
    return output


@router.post("/teams/{team_id}/analyze", response_model=schemas.TeamAssessmentRead)
def analyze_team(team_id: int, request: Request, db: Session = Depends(get_db)):
    user = _current_user(request, db)
    _require_manager(user)
    team = _get_team(db, team_id)
    _require_editable(team)
    submission = _latest_submission(team)
    if not submission or submission.status not in {"submitted", "analyzed"}:
        raise HTTPException(status_code=422, detail="请先完成团队材料提交")
    materials = [{
        "file_id": item.id, "filename": item.original_name, "suffix": item.suffix,
        "text": item.extracted_text, "segments": item.segments,
        "extraction": item.extraction_report,
    } for item in submission.files]
    contribution_by_member = {item.team_member.member_id: item for item in submission.contributions}
    members = []
    for item in team.members:
        contribution = contribution_by_member.get(item.member_id)
        members.append({
            "member_id": item.member_id, "name": item.member.name,
            "role_summary": item.role_summary,
            "contribution": contribution.contribution if contribution else "",
            "key_findings": contribution.key_findings if contribution else "",
            "challenges": contribution.challenges if contribution else "",
            "source_validation": contribution.source_validation if contribution else "",
            "preferred_direction": contribution.preferred_direction if contribution else "",
            "peer_confirmation": contribution.peer_confirmation if contribution else {},
        })
    output = get_ai_provider().analyze_research_submission(
        materials, members, {"title": team.task.title, "instructions": team.task.instructions, "rubric": team.task.rubric},
    )
    expected_member_ids = {item.member_id for item in team.members}
    returned_member_ids = [item.member_id for item in output.candidates]
    if len(set(returned_member_ids)) != 3 or set(returned_member_ids) != expected_member_ids:
        output = MockAIProvider().analyze_research_submission(
            materials, members, {"title": team.task.title, "instructions": team.task.instructions, "rubric": team.task.rubric},
        )
        output.model_version = "mock-research-v1-invalid-output-fallback"
        output.missing_information.append("远程分析未完整返回三名小队成员，本次已改用本地可复现分析。")
    output = _validated_output(output, materials)
    assessment = submission.assessment
    if assessment:
        db.execute(delete(models.CandidateAssessment).where(models.CandidateAssessment.team_assessment_id == assessment.id))
    else:
        assessment = models.TeamAssessment(submission_id=submission.id)
        db.add(assessment)
        db.flush()
    assessment.status = "review_required"
    assessment.model_version = output.model_version
    assessment.prompt_version = team.task.rubric_version
    assessment.summary = output.summary
    assessment.team_score = output.team_score
    assessment.criteria = [item.model_dump() for item in output.criteria]
    assessment.evidence = [item.model_dump() for item in output.evidence]
    assessment.conflicts = output.conflicts
    assessment.missing_information = output.missing_information
    assessment.suggested_questions = output.suggested_questions
    for candidate in output.candidates:
        db.add(models.CandidateAssessment(
            team_assessment_id=assessment.id, member_id=candidate.member_id,
            individual_score=candidate.individual_score,
            total_score=round(output.team_score + candidate.individual_score, 1),
            contribution_confidence=candidate.contribution_confidence,
            recommendation=candidate.recommendation, summary=candidate.summary,
            criteria=[item.model_dump() for item in candidate.criteria],
            evidence=[item.model_dump() for item in candidate.evidence],
            suggested_questions=candidate.suggested_questions,
        ))
    submission.status = "analyzed"
    team.status = "review_required"
    team.analyzed_at = datetime.utcnow()
    db.add(models.AuditLog(actor=user.display_name, action="research.submission.analyze", resource_type="candidate_team", resource_id=str(team.id), detail={"model_version": output.model_version}))
    db.commit()
    return _assessment_read(_latest_submission(_get_team(db, team.id)).assessment)


@router.put("/teams/{team_id}/reviews/{member_id}", response_model=schemas.HumanReviewRead)
def save_review(
    team_id: int, member_id: int, payload: schemas.HumanReviewWrite,
    request: Request, db: Session = Depends(get_db),
):
    user = _current_user(request, db)
    _require_manager(user)
    team = _get_team(db, team_id)
    _require_editable(team)
    if member_id not in {item.member_id for item in team.members}:
        raise HTTPException(status_code=404, detail="该候选人不在小队中")
    row = db.scalar(select(models.HumanReview).where(
        models.HumanReview.team_id == team_id, models.HumanReview.member_id == member_id,
        models.HumanReview.reviewer_id == user.id,
    ))
    values = payload.model_dump(exclude={"submit"})
    if row:
        for key, value in values.items():
            setattr(row, key, value)
    else:
        row = models.HumanReview(team_id=team_id, member_id=member_id, reviewer_id=user.id, **values)
        db.add(row)
    if payload.submit:
        row.status = "submitted"
        row.submitted_at = datetime.utcnow()
    db.add(models.AuditLog(actor=user.display_name, action="research.review.submit" if payload.submit else "research.review.save", resource_type="candidate_team", resource_id=str(team.id), detail={"member_id": member_id, "recommendation": payload.recommendation}))
    db.commit()
    return _review_read(db.scalar(select(models.HumanReview).where(models.HumanReview.id == row.id).options(selectinload(models.HumanReview.reviewer))))


@router.put("/teams/{team_id}/decisions/{member_id}", response_model=schemas.AdmissionDecisionRead)
def save_decision(
    team_id: int, member_id: int, payload: schemas.AdmissionDecisionWrite,
    request: Request, db: Session = Depends(get_db),
):
    user = _current_user(request, db)
    if user.role not in {"super_admin", "admin"}:
        raise HTTPException(status_code=403, detail="只有负责人可以确认最终结论")
    team = _get_team(db, team_id)
    _require_editable(team)
    member = next((item.member for item in team.members if item.member_id == member_id), None)
    if not member:
        raise HTTPException(status_code=404, detail="该候选人不在小队中")
    row = db.scalar(select(models.AdmissionDecision).where(
        models.AdmissionDecision.team_id == team_id, models.AdmissionDecision.member_id == member_id,
    ))
    if row:
        row.status, row.reason, row.decided_by, row.decided_at = payload.status, payload.reason, user.id, datetime.utcnow()
    else:
        row = models.AdmissionDecision(
            team_id=team_id, member_id=member_id, status=payload.status,
            reason=payload.reason, decided_by=user.id,
        )
        db.add(row)
    labels = {
        "recommend_join": "建议加入", "follow_up": "建议补充问答",
        "insufficient_evidence": "个人贡献证据不足", "not_recommended": "暂不建议",
        "needs_review": "需要复核",
    }
    member.status = labels[payload.status]
    db.flush()
    decision_count = db.scalar(select(func.count()).select_from(models.AdmissionDecision).where(
        models.AdmissionDecision.team_id == team_id,
    )) or 0
    if decision_count >= len(team.members):
        team.status = "decided"
    db.add(models.AuditLog(actor=user.display_name, action="research.decision.confirm", resource_type="candidate_team", resource_id=str(team.id), detail={"member_id": member_id, "status": payload.status}))
    db.commit()
    return _decision_read(db.scalar(select(models.AdmissionDecision).where(models.AdmissionDecision.id == row.id).options(selectinload(models.AdmissionDecision.decider))))


@router.get("/files/{file_id}/content")
def get_file_content(file_id: int, db: Session = Depends(get_db)):
    row = db.get(models.SubmissionFile, file_id)
    if not row:
        raise HTTPException(status_code=404, detail="材料不存在")
    storage_root = Path(get_settings().material_storage_dir).resolve()
    target = (storage_root / row.stored_name).resolve()
    if target.parent != storage_root or not target.is_file():
        raise HTTPException(status_code=404, detail="原始材料文件不存在")
    return FileResponse(target, media_type=row.content_type, filename=row.original_name)


@router.get("/teams/{team_id}/export")
def export_team(team_id: int, db: Session = Depends(get_db)):
    team = _get_team(db, team_id)
    submission = _latest_submission(team)
    assessment = submission.assessment if submission else None
    candidate_map = {row.member_id: row for row in assessment.candidates} if assessment else {}
    decision_map = {row.member_id: row for row in team.decisions}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["小队", "姓名", "学号", "团队得分", "个人得分", "总分", "AI 建议", "人工结论", "决策理由"])
    for item in team.members:
        candidate = candidate_map.get(item.member_id)
        decision = decision_map.get(item.member_id)
        writer.writerow([
            team.name, item.member.name, item.member.student_id,
            assessment.team_score if assessment else "",
            candidate.individual_score if candidate else "",
            candidate.total_score if candidate else "",
            candidate.recommendation if candidate else "",
            decision.status if decision else "", decision.reason if decision else "",
        ])
    payload = "\ufeff" + output.getvalue()
    return Response(
        payload, media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="research-team-{team.id}.csv"'},
    )
