from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Text
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
    uncertainties: Mapped[list[str]] = mapped_column(JSON, default=list)
    suggested_questions: Mapped[list[str]] = mapped_column(JSON, default=list)

    member: Mapped[Optional[Member]] = relationship(back_populates="material_analyses")


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
