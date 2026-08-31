from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class EvidenceStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    modified = "modified"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(240))
    display_name: Mapped[str] = mapped_column(String(80))
    role: Mapped[str] = mapped_column(String(64), default="member")
    department_scope: Mapped[str] = mapped_column(String(120), default="all")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Member(TimestampMixin, Base):
    __tablename__ = "members"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), index=True)
    student_id: Mapped[str] = mapped_column(String(32), unique=True)
    major: Mapped[str] = mapped_column(String(120), default="")
    grade: Mapped[str] = mapped_column(String(32), default="2026")
    phone: Mapped[str] = mapped_column(String(32), default="")
    department: Mapped[str] = mapped_column(String(80), default="待分配")
    desired_department: Mapped[str] = mapped_column(String(120), default="")
    status: Mapped[str] = mapped_column(String(32), default="报名")
    interests: Mapped[list[str]] = mapped_column(JSON, default=list)
    personality_profile: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    learning_goals: Mapped[list[str]] = mapped_column(JSON, default=list)
    long_term_goal: Mapped[str] = mapped_column(Text, default="")
    weekly_commitment: Mapped[str] = mapped_column(String(32), default="")
    lifecycle_stage: Mapped[str] = mapped_column(String(32), default="applicant", index=True)
    role_title: Mapped[str] = mapped_column(String(120), default="")
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)

    interviews: Mapped[list["Interview"]] = relationship(back_populates="member")
    evidence: Mapped[list["Evidence"]] = relationship(back_populates="member")
    tags: Mapped[list["MemberTag"]] = relationship(back_populates="member")
    application_archive: Mapped[Optional["ApplicationArchive"]] = relationship(back_populates="member", uselist=False)
    material_analyses: Mapped[list["MaterialAnalysis"]] = relationship(back_populates="member")
    research_teams: Mapped[list["CandidateTeamMember"]] = relationship(back_populates="member")


class ApplicationArchive(TimestampMixin, Base):
    __tablename__ = "application_archives"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), unique=True, index=True)
    application_no: Mapped[str] = mapped_column(String(48), unique=True, index=True)
    recruitment_cycle: Mapped[str] = mapped_column(String(64), default="2026 秋季纳新")
    source_type: Mapped[str] = mapped_column(String(64), default="questionnaire")
    source_name: Mapped[str] = mapped_column(String(240), default="")
    applied_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    motivation: Mapped[str] = mapped_column(Text, default="")
    prior_experience: Mapped[str] = mapped_column(Text, default="")
    available_time: Mapped[str] = mapped_column(String(64), default="")
    raw_answers: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    profile_completion: Mapped[float] = mapped_column(Float, default=0)
    data_quality: Mapped[str] = mapped_column(String(32), default="ready")

    member: Mapped[Member] = relationship(back_populates="application_archive")


class MaterialAnalysis(TimestampMixin, Base):
    __tablename__ = "material_analyses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[Optional[int]] = mapped_column(ForeignKey("members.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(180), default="资料分析")
    file_names: Mapped[list[str]] = mapped_column(JSON, default=list)
    material_types: Mapped[list[str]] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="review_required")
    summary: Mapped[str] = mapped_column(Text, default="")
    extracted_facts: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    extraction_report: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    uncertainties: Mapped[list[str]] = mapped_column(JSON, default=list)
    suggested_questions: Mapped[list[str]] = mapped_column(JSON, default=list)

    member: Mapped[Optional[Member]] = relationship(back_populates="material_analyses")


class ResearchTask(TimestampMixin, Base):
    __tablename__ = "research_tasks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(180), default="水下机器人调研")
    description: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    rubric: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    rubric_version: Mapped[str] = mapped_column(String(40), default="rov-research-v1")
    duration_days: Mapped[int] = mapped_column(Integer, default=7)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    teams: Mapped[list["CandidateTeam"]] = relationship(back_populates="task")


class CandidateTeam(TimestampMixin, Base):
    __tablename__ = "candidate_teams"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("research_tasks.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[str] = mapped_column(String(32), default="assigned", index=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    task: Mapped[ResearchTask] = relationship(back_populates="teams")
    members: Mapped[list["CandidateTeamMember"]] = relationship(back_populates="team")
    submissions: Mapped[list["ResearchSubmission"]] = relationship(back_populates="team")
    reviews: Mapped[list["HumanReview"]] = relationship(back_populates="team")
    decisions: Mapped[list["AdmissionDecision"]] = relationship(back_populates="team")


class CandidateTeamMember(TimestampMixin, Base):
    __tablename__ = "candidate_team_members"
    __table_args__ = (UniqueConstraint("team_id", "member_id", name="uq_candidate_team_member"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("candidate_teams.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    role_summary: Mapped[str] = mapped_column(String(240), default="待分工")
    is_leader: Mapped[bool] = mapped_column(Boolean, default=False)

    team: Mapped[CandidateTeam] = relationship(back_populates="members")
    member: Mapped[Member] = relationship(back_populates="research_teams")
    contributions: Mapped[list["IndividualContribution"]] = relationship(back_populates="team_member")


class ResearchSubmission(TimestampMixin, Base):
    __tablename__ = "research_submissions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("candidate_teams.id"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    note: Mapped[str] = mapped_column(Text, default="")
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    team: Mapped[CandidateTeam] = relationship(back_populates="submissions")
    files: Mapped[list["SubmissionFile"]] = relationship(back_populates="submission")
    contributions: Mapped[list["IndividualContribution"]] = relationship(back_populates="submission")
    assessment: Mapped[Optional["TeamAssessment"]] = relationship(back_populates="submission", uselist=False)


class SubmissionFile(TimestampMixin, Base):
    __tablename__ = "submission_files"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("research_submissions.id"), index=True)
    member_id: Mapped[Optional[int]] = mapped_column(ForeignKey("members.id"), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(40), default="team_report")
    original_name: Mapped[str] = mapped_column(String(240))
    stored_name: Mapped[str] = mapped_column(String(240), unique=True)
    suffix: Mapped[str] = mapped_column(String(16), default="")
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    extraction_status: Mapped[str] = mapped_column(String(32), default="pending")
    extracted_text: Mapped[str] = mapped_column(Text, default="")
    extraction_report: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    segments: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    submission: Mapped[ResearchSubmission] = relationship(back_populates="files")
    member: Mapped[Optional[Member]] = relationship()


class IndividualContribution(TimestampMixin, Base):
    __tablename__ = "individual_contributions"
    __table_args__ = (UniqueConstraint("submission_id", "team_member_id", name="uq_submission_contribution"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("research_submissions.id"), index=True)
    team_member_id: Mapped[int] = mapped_column(ForeignKey("candidate_team_members.id"), index=True)
    contribution: Mapped[str] = mapped_column(Text, default="")
    key_findings: Mapped[str] = mapped_column(Text, default="")
    challenges: Mapped[str] = mapped_column(Text, default="")
    source_validation: Mapped[str] = mapped_column(Text, default="")
    preferred_direction: Mapped[str] = mapped_column(String(180), default="")
    peer_confirmation: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)

    submission: Mapped[ResearchSubmission] = relationship(back_populates="contributions")
    team_member: Mapped[CandidateTeamMember] = relationship(back_populates="contributions")


class TeamAssessment(TimestampMixin, Base):
    __tablename__ = "team_assessments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("research_submissions.id"), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="review_required")
    model_version: Mapped[str] = mapped_column(String(80), default="mock-research-v1")
    prompt_version: Mapped[str] = mapped_column(String(40), default="rov-research-v1")
    summary: Mapped[str] = mapped_column(Text, default="")
    team_score: Mapped[float] = mapped_column(Float, default=0)
    criteria: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    conflicts: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    missing_information: Mapped[list[str]] = mapped_column(JSON, default=list)
    suggested_questions: Mapped[list[str]] = mapped_column(JSON, default=list)

    submission: Mapped[ResearchSubmission] = relationship(back_populates="assessment")
    candidates: Mapped[list["CandidateAssessment"]] = relationship(back_populates="team_assessment")


class CandidateAssessment(TimestampMixin, Base):
    __tablename__ = "candidate_assessments"
    __table_args__ = (UniqueConstraint("team_assessment_id", "member_id", name="uq_candidate_assessment"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_assessment_id: Mapped[int] = mapped_column(ForeignKey("team_assessments.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    individual_score: Mapped[float] = mapped_column(Float, default=0)
    total_score: Mapped[float] = mapped_column(Float, default=0)
    contribution_confidence: Mapped[float] = mapped_column(Float, default=0)
    recommendation: Mapped[str] = mapped_column(String(40), default="needs_review")
    summary: Mapped[str] = mapped_column(Text, default="")
    criteria: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    suggested_questions: Mapped[list[str]] = mapped_column(JSON, default=list)

    team_assessment: Mapped[TeamAssessment] = relationship(back_populates="candidates")
    member: Mapped[Member] = relationship()


class HumanReview(TimestampMixin, Base):
    __tablename__ = "human_reviews"
    __table_args__ = (UniqueConstraint("team_id", "member_id", "reviewer_id", name="uq_human_review"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("candidate_teams.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(32), default="draft")
    recommendation: Mapped[str] = mapped_column(String(40), default="needs_review")
    criteria_scores: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    summary: Mapped[str] = mapped_column(Text, default="")
    concerns: Mapped[str] = mapped_column(Text, default="")
    follow_up_questions: Mapped[list[str]] = mapped_column(JSON, default=list)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    team: Mapped[CandidateTeam] = relationship(back_populates="reviews")
    member: Mapped[Member] = relationship()
    reviewer: Mapped[User] = relationship()


class AdmissionDecision(TimestampMixin, Base):
    __tablename__ = "admission_decisions"
    __table_args__ = (UniqueConstraint("team_id", "member_id", name="uq_admission_decision"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("candidate_teams.id"), index=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    status: Mapped[str] = mapped_column(String(40), default="needs_review")
    reason: Mapped[str] = mapped_column(Text, default="")
    decided_by: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    team: Mapped[CandidateTeam] = relationship(back_populates="decisions")
    member: Mapped[Member] = relationship()
    decider: Mapped[User] = relationship()


class Interview(TimestampMixin, Base):
    __tablename__ = "interviews"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    status: Mapped[str] = mapped_column(String(32), default="scheduled")
    scheduled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    meeting_provider: Mapped[str] = mapped_column(String(32), default="mock")
    meeting_id: Mapped[str] = mapped_column(String(120), default="")
    recording_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    informed_consent: Mapped[bool] = mapped_column(Boolean, default=False)

    member: Mapped[Member] = relationship(back_populates="interviews")
    questions: Mapped[list["InterviewQuestion"]] = relationship(back_populates="interview")
    utterances: Mapped[list["Utterance"]] = relationship(back_populates="interview")


class InterviewQuestion(TimestampMixin, Base):
    __tablename__ = "interview_questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"))
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(64), default="技术题")
    difficulty: Mapped[str] = mapped_column(String(32), default="基础")
    evaluation_dimensions: Mapped[list[str]] = mapped_column(JSON, default=list)
    reference_points: Mapped[list[str]] = mapped_column(JSON, default=list)
    follow_up_questions: Mapped[list[str]] = mapped_column(JSON, default=list)

    interview: Mapped[Interview] = relationship(back_populates="questions")


class Utterance(TimestampMixin, Base):
    __tablename__ = "utterances"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    interview_id: Mapped[int] = mapped_column(ForeignKey("interviews.id"), index=True)
    speaker_id: Mapped[str] = mapped_column(String(64))
    speaker_name: Mapped[str] = mapped_column(String(80), default="")
    speaker_role: Mapped[str] = mapped_column(String(32))
    start_time: Mapped[float] = mapped_column(Float, default=0)
    end_time: Mapped[float] = mapped_column(Float, default=0)
    text: Mapped[str] = mapped_column(Text)
    question_id: Mapped[Optional[int]] = mapped_column(ForeignKey("interview_questions.id"), nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=1)

    interview: Mapped[Interview] = relationship(back_populates="utterances")


class ActivityEvent(TimestampMixin, Base):
    __tablename__ = "activity_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    source_type: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(180))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class Evidence(TimestampMixin, Base):
    __tablename__ = "evidence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    activity_event_id: Mapped[int] = mapped_column(ForeignKey("activity_events.id"))
    source_type: Mapped[str] = mapped_column(String(64))
    source_id: Mapped[str] = mapped_column(String(64))
    dimension: Mapped[str] = mapped_column(String(80), index=True)
    direction: Mapped[str] = mapped_column(String(16), default="positive")
    strength: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text)
    reasoning_summary: Mapped[str] = mapped_column(Text)
    status: Mapped[EvidenceStatus] = mapped_column(Enum(EvidenceStatus), default=EvidenceStatus.pending)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    review_note: Mapped[str] = mapped_column(Text, default="")
    reviewed_by: Mapped[str] = mapped_column(String(80), default="")
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    member: Mapped[Member] = relationship(back_populates="evidence")


class MemberTag(TimestampMixin, Base):
    __tablename__ = "member_tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    dimension: Mapped[str] = mapped_column(String(80), index=True)
    score: Mapped[float] = mapped_column(Float)
    confidence: Mapped[float] = mapped_column(Float)
    trend: Mapped[str] = mapped_column(String(16), default="stable")
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)

    member: Mapped[Member] = relationship(back_populates="tags")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(120))
    resource_type: Mapped[str] = mapped_column(String(64))
    resource_id: Mapped[str] = mapped_column(String(64))
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
