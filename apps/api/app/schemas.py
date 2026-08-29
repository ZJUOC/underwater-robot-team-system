from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


EvidenceReviewStatus = Literal["pending", "accepted", "rejected", "modified"]


class LoginRequest(BaseModel):
    username: str
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    display_name: str
    role: str
    department_scope: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 43200
    user: UserRead


class MemberCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    student_id: str = Field(min_length=3, max_length=32)
    major: str = ""
    grade: str = "2026"
    desired_department: str = ""
    interests: list[str] = []
    learning_goals: list[str] = []
    weekly_commitment: str = ""
    role_title: str = ""


class MemberSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    student_id: str
    major: str
    grade: str
    department: str
    desired_department: str
    status: str
    interests: list[str]
    personality_profile: dict = Field(default_factory=dict)
    learning_goals: list[str]
    lifecycle_stage: str
    role_title: str
    joined_at: Optional[datetime]
    created_at: datetime


class EvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    member_id: int
    source_type: str
    source_id: str
    dimension: str
    direction: str
    strength: float
    confidence: float
    description: str
    reasoning_summary: str
    status: EvidenceReviewStatus
    review_note: str
    created_at: datetime


class MemberTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    dimension: str
    score: float
    confidence: float
    trend: str
    evidence_count: int
    updated_at: datetime


class TimelineItem(BaseModel):
    type: str
    title: str
    occurred_at: datetime
    source_id: str


class MemberDetail(MemberSummary):
    phone_masked: str
    long_term_goal: str
    weekly_commitment: str
    tags: list[MemberTagRead]
    evidence: list[EvidenceRead]
    timeline: list[TimelineItem]


class ApplicationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    student_id: str = Field(min_length=3, max_length=32)
    major: str = ""
    grade: str = "2026"
    phone: str = ""
    desired_department: str = ""
    interests: list[str] = []
    weekly_commitment: str = ""
    motivation: str = ""
    prior_experience: str = ""
    recruitment_cycle: str = "2026 秋季纳新"


class ApplicationSummary(BaseModel):
    id: int
    member_id: int
    application_no: str
    name: str
    student_id: str
    major: str
    grade: str
    desired_department: str
    status: str
    interests: list[str]
    personality_profile: dict = Field(default_factory=dict)
    applied_at: datetime
    profile_completion: float
    data_quality: str
    source_type: str
    source_name: str
    submission_count: int


class MaterialAnalysisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    member_id: Optional[int]
    title: str
    file_names: list[str]
    material_types: list[str]
    notes: str
    status: str
    summary: str
    extracted_facts: list[dict]
    uncertainties: list[str]
    suggested_questions: list[str]
    created_at: datetime


class ApplicationDetail(ApplicationSummary):
    phone_masked: str
    motivation: str
    prior_experience: str
    available_time: str
    raw_answers: dict
    tags: list[MemberTagRead]
    evidence: list[EvidenceRead]
    interviews: list["InterviewSummary"]
    material_analyses: list[MaterialAnalysisRead]


class InterviewQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    content: str
    category: str
    difficulty: str
    evaluation_dimensions: list[str]
    reference_points: list[str]
    follow_up_questions: list[str]


class UtteranceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    speaker_id: str
    speaker_name: str
    speaker_role: str
    start_time: float
    end_time: float
    text: str
    question_id: Optional[int]
    confidence: float


class InterviewSummary(BaseModel):
    id: int
    member_id: int
    application_id: int
    member_name: str
    title: str
    status: str
    scheduled_at: datetime
    meeting_provider: str
    consent_complete: bool
    utterance_count: int


class InterviewCreate(BaseModel):
    member_id: int
    title: str = Field(min_length=2, max_length=160)
    meeting_provider: Literal["mock", "tencent"] = "mock"
    informed_consent: bool = False
    recording_consent: bool = False
    ai_consent: bool = False


class InterviewQuestionCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    content: str = Field(min_length=3)
    category: str = "技术题"
    difficulty: str = "基础"
    evaluation_dimensions: list[str] = []
    reference_points: list[str] = []
    follow_up_questions: list[str] = []


class UtteranceCreate(BaseModel):
    speaker_id: str = Field(min_length=1, max_length=64)
    speaker_name: str = Field(min_length=1, max_length=80)
    speaker_role: Literal["candidate", "interviewer", "observer"]
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)
    text: str = Field(min_length=1)
    question_id: Optional[int] = None
    confidence: float = Field(default=1, ge=0, le=1)


class SpeakerMapping(BaseModel):
    speaker_id: str
    speaker_name: str = Field(min_length=1, max_length=80)
    speaker_role: Literal["candidate", "interviewer", "observer"]


class InterviewDetail(InterviewSummary):
    meeting_id: str
    recording_consent: bool
    ai_consent: bool
    informed_consent: bool
    questions: list[InterviewQuestionRead]
    utterances: list[UtteranceRead]


class InterviewAnalyzeResult(BaseModel):
    interview_id: int
    event_id: int
    created_evidence: list[EvidenceRead]
    message: str


class EvidenceReview(BaseModel):
    status: EvidenceReviewStatus
    review_note: str = ""
    reviewed_by: str = "开发管理员"


class DashboardRead(BaseModel):
    members: int
    pending_interviews: int
    pending_evidence: int
    accepted_evidence: int
    questionnaire_rows: int
    recent_members: list[MemberSummary]


class ErrorResponse(BaseModel):
    code: str
    message: str
    detail: dict = {}
