from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional
from zipfile import BadZipFile
from xml.etree import ElementTree

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from starlette.concurrency import run_in_threadpool

from . import models, schemas
from .auth import create_access_token, token_from_request, verify_password
from .config import get_settings
from .database import Base, SessionLocal, engine, get_db
from .material_parser import MAX_IMAGE_FRAMES, MAX_PDF_PAGES, extract_material_text, extract_xlsx_records
from .personality_engine import analyze_personality_signals
from .seed import import_questionnaire_records, seed_demo
from .services import analyze_interview, counts_by_status, review_evidence
from .providers import get_ai_provider
from .research import router as research_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_demo(db)
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(research_router)


@app.middleware("http")
async def require_authentication(request: Request, call_next):
    public_paths = {"/health", "/api/auth/login", "/docs", "/openapi.json", "/redoc"}
    if request.method != "OPTIONS" and request.url.path.startswith("/api/") and request.url.path not in public_paths:
        try:
            request.state.auth = token_from_request(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={
                "code": f"HTTP_{exc.status_code}", "message": str(exc.detail), "detail": {},
            })
    return await call_next(request)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={
        "code": f"HTTP_{exc.status_code}", "message": str(exc.detail), "detail": {},
    })


@app.get("/health")
def health():
    return {"status": "ok", "service": "robot-team-api"}


@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(models.User).where(models.User.username == payload.username))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    return schemas.TokenResponse(access_token=create_access_token(user.id, user.role), user=user)


@app.get("/api/auth/me", response_model=schemas.UserRead)
def me(request: Request, db: Session = Depends(get_db)):
    user = db.get(models.User, request.state.auth["sub"])
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


@app.get("/api/dashboard", response_model=schemas.DashboardRead)
def dashboard(db: Session = Depends(get_db)):
    recent = db.scalars(select(models.Member).where(
        models.Member.is_deleted.is_(False), models.Member.lifecycle_stage == "member").order_by(
        models.Member.created_at.desc()).limit(5)).all()
    return schemas.DashboardRead(
        members=db.scalar(select(func.count()).select_from(models.Member).where(
            models.Member.is_deleted.is_(False), models.Member.lifecycle_stage == "member")) or 0,
        pending_interviews=db.scalar(select(func.count()).select_from(models.Interview).where(
            models.Interview.status.in_(["scheduled", "ready"]))) or 0,
        pending_evidence=counts_by_status(db, models.EvidenceStatus.pending),
        accepted_evidence=counts_by_status(db, models.EvidenceStatus.accepted),
        questionnaire_rows=db.scalar(select(func.count()).select_from(models.ApplicationArchive)) or 0,
        recent_members=recent,
    )


def application_summary(archive: models.ApplicationArchive) -> schemas.ApplicationSummary:
    submissions = archive.raw_answers.get("submissions", []) if isinstance(archive.raw_answers, dict) else []
    member = archive.member
    return schemas.ApplicationSummary(
        id=archive.id, member_id=member.id, application_no=archive.application_no,
        name=member.name, student_id=member.student_id, major=member.major, grade=member.grade,
        desired_department=member.desired_department, status=member.status, interests=member.interests,
        personality_profile=member.personality_profile,
        applied_at=archive.applied_at, profile_completion=archive.profile_completion,
        data_quality=archive.data_quality, source_type=archive.source_type, source_name=archive.source_name,
        submission_count=len(submissions),
    )


@app.get("/api/applications", response_model=list[schemas.ApplicationSummary])
def list_applications(db: Session = Depends(get_db)):
    rows = db.scalars(select(models.ApplicationArchive).options(
        selectinload(models.ApplicationArchive.member)
    ).order_by(models.ApplicationArchive.applied_at.desc())).all()
    return [application_summary(row) for row in rows if not row.member.is_deleted]


@app.post("/api/applications", response_model=schemas.ApplicationSummary, status_code=201)
def create_application(payload: schemas.ApplicationCreate, db: Session = Depends(get_db)):
    if db.scalar(select(models.Member.id).where(models.Member.student_id == payload.student_id)):
        raise HTTPException(status_code=409, detail="该学号已存在，请进入已有档案补充资料")
    member = models.Member(
        name=payload.name, student_id=payload.student_id, major=payload.major, grade=payload.grade,
        phone=payload.phone, desired_department=payload.desired_department, status="待面试",
        interests=payload.interests, weekly_commitment=payload.weekly_commitment,
        lifecycle_stage="applicant",
    )
    db.add(member)
    db.flush()
    archive = models.ApplicationArchive(
        member_id=member.id, application_no=f"APP-MANUAL-{member.id:04d}",
        recruitment_cycle=payload.recruitment_cycle, source_type="manual", source_name="人工建档",
        motivation=payload.motivation, prior_experience=payload.prior_experience,
        available_time=payload.weekly_commitment,
        raw_answers={"submissions": [], "note": "由管理员人工建立"},
        profile_completion=0.85, data_quality="ready",
    )
    member.personality_profile = analyze_personality_signals(
        motivation=payload.motivation, prior_experience=payload.prior_experience,
        available_time=payload.weekly_commitment,
    )
    db.add(archive)
    db.add(models.AuditLog(actor="开发管理员", action="application.create", resource_type="application",
                           resource_id=archive.application_no, detail={"name": member.name}))
    db.commit()
    db.refresh(archive)
    archive.member = member
    return application_summary(archive)


@app.post("/api/applications/import", response_model=schemas.ApplicationImportResult, status_code=201)
async def import_applications(file: UploadFile = File(...), db: Session = Depends(get_db)):
    filename = (file.filename or "纳新问卷.xlsx").replace("\\", "/").rsplit("/", 1)[-1][:240]
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=415, detail="请选择 XLSX 格式的纳新问卷")
    content = await file.read(15 * 1024 * 1024 + 1)
    if not content:
        raise HTTPException(status_code=422, detail="上传的问卷为空")
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="问卷文件不能超过 15 MB")
    try:
        records = await run_in_threadpool(extract_xlsx_records, content)
        result = import_questionnaire_records(db, records, filename)
    except (BadZipFile, ElementTree.ParseError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"无法导入问卷：{exc}") from exc
    db.add(models.AuditLog(
        actor="开发管理员", action="application.import", resource_type="application",
        resource_id=filename, detail=result,
    ))
    db.commit()
    return schemas.ApplicationImportResult(filename=filename, **result)


@app.get("/api/applications/{application_id}", response_model=schemas.ApplicationDetail)
def get_application(application_id: int, db: Session = Depends(get_db)):
    archive = db.scalar(select(models.ApplicationArchive).where(models.ApplicationArchive.id == application_id).options(
        selectinload(models.ApplicationArchive.member).selectinload(models.Member.tags),
        selectinload(models.ApplicationArchive.member).selectinload(models.Member.evidence),
        selectinload(models.ApplicationArchive.member).selectinload(models.Member.material_analyses),
        selectinload(models.ApplicationArchive.member).selectinload(models.Member.interviews).selectinload(models.Interview.utterances),
    ))
    if not archive or archive.member.is_deleted:
        raise HTTPException(status_code=404, detail="纳新档案不存在")
    base = application_summary(archive)
    member = archive.member
    masked = member.phone[:3] + "****" + member.phone[-4:] if len(member.phone) >= 7 else "未填写"
    return schemas.ApplicationDetail(
        **base.model_dump(), phone_masked=masked, motivation=archive.motivation,
        prior_experience=archive.prior_experience, available_time=archive.available_time,
        raw_answers=archive.raw_answers,
        tags=sorted(member.tags, key=lambda item: item.score, reverse=True),
        evidence=sorted(member.evidence, key=lambda item: item.created_at, reverse=True),
        interviews=[interview_summary(row) for row in sorted(member.interviews, key=lambda item: item.scheduled_at, reverse=True)],
        material_analyses=sorted(member.material_analyses, key=lambda item: item.created_at, reverse=True),
    )


@app.get("/api/material-analyses", response_model=list[schemas.MaterialAnalysisRead])
def list_material_analyses(db: Session = Depends(get_db)):
    return db.scalars(select(models.MaterialAnalysis).order_by(models.MaterialAnalysis.created_at.desc()).limit(30)).all()


@app.get("/api/material-analyses/capabilities")
def material_analysis_capabilities():
    return {
        "formats": ["xlsx", "xls", "csv", "pdf", "docx", "pptx", "txt", "md", "json", "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"],
        "ocr_engine": "RapidOCR / ONNX Runtime",
        "pdf_strategy": "优先提取文本层，扫描页自动 OCR",
        "limits": {"files": 10, "file_mb": 15, "package_mb": 40, "pdf_pages": MAX_PDF_PAGES, "image_frames": MAX_IMAGE_FRAMES},
        "privacy": "上传文件仅在内存中解析，不保存原文件。",
    }


@app.post("/api/material-analyses", response_model=schemas.MaterialAnalysisRead, status_code=201)
async def create_material_analysis(
    files: list[UploadFile] = File(...), notes: str = Form(""),
    member_id: Optional[int] = Form(None), db: Session = Depends(get_db),
):
    if not files or len(files) > 10:
        raise HTTPException(status_code=422, detail="请上传 1-10 份资料")
    if member_id:
        member = db.get(models.Member, member_id)
        if not member or member.is_deleted or member.lifecycle_stage != "applicant":
            raise HTTPException(status_code=404, detail="关联的纳新档案不存在")
    allowed = {"xlsx", "xls", "csv", "pdf", "docx", "pptx", "txt", "md", "json", "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"}
    materials: list[dict] = []
    total_size = 0
    for upload in files:
        filename = (upload.filename or "未命名资料").replace("\\", "/").rsplit("/", 1)[-1][:240]
        suffix = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if suffix not in allowed:
            raise HTTPException(status_code=415, detail=f"暂不支持 {filename} 的文件类型")
        chunks: list[bytes] = []
        file_size = 0
        while chunk := await upload.read(1024 * 1024):
            file_size += len(chunk)
            if file_size > 15 * 1024 * 1024 or total_size + file_size > 40 * 1024 * 1024:
                raise HTTPException(status_code=413, detail="资料包超过大小限制")
            chunks.append(chunk)
        content = b"".join(chunks)
        total_size += file_size
        extraction = await run_in_threadpool(extract_material_text, content, suffix)
        materials.append({
            "filename": filename, "suffix": suffix, "size": file_size,
            "text": extraction.text,
            "extraction": extraction.report(filename, suffix, file_size),
        })
    output = get_ai_provider().analyze_materials(materials, notes)
    row = models.MaterialAnalysis(
        member_id=member_id, title=f"资料包分析 {datetime.utcnow().strftime('%m-%d %H:%M')}",
        file_names=[item["filename"] for item in materials], material_types=output.material_types,
        notes=notes, status="review_required", summary=output.summary,
        extracted_facts=output.extracted_facts,
        extraction_report=[item["extraction"] for item in materials],
        uncertainties=output.uncertainties,
        suggested_questions=output.suggested_questions,
    )
    db.add(row)
    db.flush()
    db.add(models.AuditLog(actor="开发管理员", action="material.analyze", resource_type="material_analysis",
                           resource_id=str(row.id), detail={
                               "files": row.file_names, "member_id": member_id,
                               "methods": [item["extraction"]["method"] for item in materials],
                               "ocr_pages": sum(item["extraction"]["ocr_page_count"] for item in materials),
                           }))
    db.commit()
    db.refresh(row)
    return row


@app.get("/api/members", response_model=list[schemas.MemberSummary])
def list_members(db: Session = Depends(get_db)):
    return db.scalars(select(models.Member).where(
        models.Member.is_deleted.is_(False), models.Member.lifecycle_stage == "member").order_by(
        models.Member.created_at.desc())).all()


@app.post("/api/members", response_model=schemas.MemberSummary, status_code=201)
def create_member(payload: schemas.MemberCreate, db: Session = Depends(get_db)):
    if db.scalar(select(models.Member.id).where(models.Member.student_id == payload.student_id)):
        raise HTTPException(status_code=409, detail="该学号已存在")
    member = models.Member(**payload.model_dump(), lifecycle_stage="member", status="在队", joined_at=datetime.utcnow())
    db.add(member)
    db.add(models.AuditLog(actor="开发管理员", action="member.create", resource_type="member",
                           resource_id=payload.student_id, detail={"name": payload.name}))
    db.commit()
    db.refresh(member)
    return member


@app.get("/api/members/{member_id}", response_model=schemas.MemberDetail)
def get_member(member_id: int, db: Session = Depends(get_db)):
    member = db.scalar(select(models.Member).where(models.Member.id == member_id).options(
        selectinload(models.Member.tags), selectinload(models.Member.evidence)))
    if not member or member.is_deleted:
        raise HTTPException(status_code=404, detail="成员不存在")
    events = db.scalars(select(models.ActivityEvent).where(models.ActivityEvent.member_id == member_id).order_by(
        models.ActivityEvent.created_at.desc())).all()
    timeline = [schemas.TimelineItem(type=e.event_type, title=e.title, occurred_at=e.created_at,
                                     source_id=e.source_id) for e in events]
    masked = member.phone[:3] + "****" + member.phone[-4:] if len(member.phone) >= 7 else "未填写"
    return schemas.MemberDetail(
        **schemas.MemberSummary.model_validate(member).model_dump(), phone_masked=masked,
        long_term_goal=member.long_term_goal, weekly_commitment=member.weekly_commitment,
        tags=sorted(member.tags, key=lambda item: item.score, reverse=True),
        evidence=sorted(member.evidence, key=lambda item: item.created_at, reverse=True), timeline=timeline,
    )


def interview_summary(interview: models.Interview) -> schemas.InterviewSummary:
    return schemas.InterviewSummary(
        id=interview.id, member_id=interview.member_id,
        application_id=interview.member.application_archive.id,
        member_name=interview.member.name,
        title=interview.title, status=interview.status, scheduled_at=interview.scheduled_at,
        meeting_provider=interview.meeting_provider,
        consent_complete=interview.informed_consent and interview.recording_consent and interview.ai_consent,
        utterance_count=len(interview.utterances),
    )


@app.get("/api/interviews", response_model=list[schemas.InterviewSummary])
def list_interviews(db: Session = Depends(get_db)):
    rows = db.scalars(select(models.Interview).options(
        selectinload(models.Interview.member).selectinload(models.Member.application_archive),
        selectinload(models.Interview.utterances)
    ).order_by(models.Interview.scheduled_at.desc())).all()
    return [interview_summary(row) for row in rows]


@app.post("/api/interviews", response_model=schemas.InterviewSummary, status_code=201)
def create_interview(payload: schemas.InterviewCreate, db: Session = Depends(get_db)):
    member = db.get(models.Member, payload.member_id)
    if not member or member.is_deleted or member.lifecycle_stage != "applicant":
        raise HTTPException(status_code=404, detail="纳新档案不存在")
    row = models.Interview(
        **payload.model_dump(), status="ready", meeting_id=f"mock-{payload.member_id}-{int(datetime.utcnow().timestamp())}",
    )
    db.add(row)
    db.add(models.AuditLog(actor="开发管理员", action="interview.create", resource_type="interview",
                           resource_id="pending", detail={"member_id": payload.member_id, "title": payload.title}))
    db.commit()
    db.refresh(row)
    row.member = member
    row.utterances = []
    return interview_summary(row)


@app.get("/api/interviews/{interview_id}", response_model=schemas.InterviewDetail)
def get_interview(interview_id: int, db: Session = Depends(get_db)):
    row = db.scalar(select(models.Interview).where(models.Interview.id == interview_id).options(
        selectinload(models.Interview.member).selectinload(models.Member.application_archive),
        selectinload(models.Interview.questions),
        selectinload(models.Interview.utterances)))
    if not row:
        raise HTTPException(status_code=404, detail="面试不存在")
    base = interview_summary(row)
    return schemas.InterviewDetail(
        **base.model_dump(), meeting_id=row.meeting_id, recording_consent=row.recording_consent,
        ai_consent=row.ai_consent, informed_consent=row.informed_consent,
        questions=row.questions, utterances=sorted(row.utterances, key=lambda item: item.start_time),
    )


@app.post("/api/interviews/{interview_id}/questions", response_model=schemas.InterviewQuestionRead, status_code=201)
def create_question(interview_id: int, payload: schemas.InterviewQuestionCreate, db: Session = Depends(get_db)):
    if not db.get(models.Interview, interview_id):
        raise HTTPException(status_code=404, detail="面试不存在")
    row = models.InterviewQuestion(interview_id=interview_id, **payload.model_dump())
    db.add(row)
    db.add(models.AuditLog(actor="开发管理员", action="interview.question.create", resource_type="interview",
                           resource_id=str(interview_id), detail={"title": payload.title}))
    db.commit()
    db.refresh(row)
    return row


@app.post("/api/interviews/{interview_id}/utterances", response_model=schemas.UtteranceRead, status_code=201)
def create_utterance(interview_id: int, payload: schemas.UtteranceCreate, db: Session = Depends(get_db)):
    if not db.get(models.Interview, interview_id):
        raise HTTPException(status_code=404, detail="面试不存在")
    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=422, detail="结束时间必须晚于开始时间")
    if payload.question_id and not db.get(models.InterviewQuestion, payload.question_id):
        raise HTTPException(status_code=404, detail="关联问题不存在")
    row = models.Utterance(interview_id=interview_id, **payload.model_dump())
    db.add(row)
    db.add(models.AuditLog(actor="开发管理员", action="interview.utterance.create", resource_type="interview",
                           resource_id=str(interview_id), detail={"speaker_id": payload.speaker_id}))
    db.commit()
    db.refresh(row)
    return row


@app.patch("/api/interviews/{interview_id}/speakers", response_model=list[schemas.UtteranceRead])
def map_speaker(interview_id: int, payload: schemas.SpeakerMapping, db: Session = Depends(get_db)):
    rows = db.scalars(select(models.Utterance).where(
        models.Utterance.interview_id == interview_id,
        models.Utterance.speaker_id == payload.speaker_id,
    )).all()
    if not rows:
        raise HTTPException(status_code=404, detail="未找到该 Speaker")
    for row in rows:
        row.speaker_name = payload.speaker_name
        row.speaker_role = payload.speaker_role
    db.add(models.AuditLog(actor="开发管理员", action="interview.speaker.map", resource_type="interview",
                           resource_id=str(interview_id), detail=payload.model_dump()))
    db.commit()
    return rows


@app.post("/api/interviews/{interview_id}/analyze", response_model=schemas.InterviewAnalyzeResult)
def analyze(interview_id: int, db: Session = Depends(get_db)):
    row = db.scalar(select(models.Interview).where(models.Interview.id == interview_id).options(
        selectinload(models.Interview.utterances)))
    if not row:
        raise HTTPException(status_code=404, detail="面试不存在")
    event, created = analyze_interview(db, row)
    return schemas.InterviewAnalyzeResult(
        interview_id=row.id, event_id=event.id, created_evidence=created,
        message=f"分析完成，生成 {len(created)} 条待审核 Evidence。",
    )


@app.get("/api/evidence", response_model=list[schemas.EvidenceRead])
def list_evidence(status: Optional[schemas.EvidenceReviewStatus] = None, db: Session = Depends(get_db)):
    query = select(models.Evidence).order_by(models.Evidence.created_at.desc())
    if status:
        query = query.where(models.Evidence.status == models.EvidenceStatus(status))
    return db.scalars(query).all()


@app.patch("/api/evidence/{evidence_id}", response_model=schemas.EvidenceRead)
def patch_evidence(evidence_id: int, payload: schemas.EvidenceReview, db: Session = Depends(get_db)):
    row = db.get(models.Evidence, evidence_id)
    if not row:
        raise HTTPException(status_code=404, detail="Evidence 不存在")
    return review_evidence(db, row, models.EvidenceStatus(payload.status), payload.review_note, payload.reviewed_by)
