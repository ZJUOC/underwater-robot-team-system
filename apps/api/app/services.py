from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .personality_engine import analyze_personality_signals
from .providers import get_ai_provider


SOURCE_WEIGHTS = {
    "questionnaire": 0.45,
    "interview": 0.68,
    "interviewer_observation": 0.70,
    "observer_record": 0.82,
    "submission": 0.92,
    "git": 0.94,
    "project_leader_review": 0.90,
    "peer_review": 0.72,
}


def analyze_interview(db: Session, interview: models.Interview) -> tuple[models.ActivityEvent, list[models.Evidence]]:
    if not interview.informed_consent or not interview.ai_consent:
        raise HTTPException(status_code=409, detail="候选人尚未完成知情与 AI 分析授权")

    candidate_lines = [u.text for u in interview.utterances if u.speaker_role == "candidate"]
    if not candidate_lines:
        raise HTTPException(status_code=409, detail="未找到候选人逐字稿，请先完成 Speaker 映射")

    transcript = "\n".join(candidate_lines)
    provider_output = get_ai_provider().extract_interview_evidence(transcript)
    event = models.ActivityEvent(
        member_id=interview.member_id,
        event_type="interview_analyzed",
        source_type="interview",
        source_id=str(interview.id),
        title=f"分析面试：{interview.title}",
        payload={"candidate_transcript": transcript, "provider": "mock"},
    )
    db.add(event)
    db.flush()

    created: list[models.Evidence] = []
    for item in provider_output:
        existing = db.scalar(select(models.Evidence).where(
            models.Evidence.activity_event_id == event.id,
            models.Evidence.dimension == item.dimension,
        ))
        if existing:
            continue
        row = models.Evidence(
            member_id=interview.member_id,
            activity_event_id=event.id,
            source_type="interview",
            source_id=str(interview.id),
            dimension=item.dimension,
            direction=item.direction,
            strength=item.strength,
            confidence=item.confidence,
            description=item.description,
            reasoning_summary=item.reasoning_summary,
            raw_payload={
                "dimension": item.dimension,
                "direction": item.direction,
                "strength": item.strength,
                "confidence": item.confidence,
                "description": item.description,
                "reasoning_summary": item.reasoning_summary,
                "quote": item.quote,
            },
        )
        db.add(row)
        created.append(row)

    interview.status = "analyzed"
    db.add(models.AuditLog(
        actor="开发管理员", action="interview.analyze", resource_type="interview",
        resource_id=str(interview.id), detail={"evidence_count": len(created)},
    ))
    db.flush()
    recompute_member_tags(db, interview.member_id)
    refresh_personality_profile(db, interview.member_id)
    db.commit()
    for row in created:
        db.refresh(row)
    return event, created


def refresh_personality_profile(db: Session, member_id: int) -> None:
    member = db.get(models.Member, member_id)
    if not member or not member.application_archive:
        return
    candidate_lines = db.scalars(select(models.Utterance.text).join(models.Interview).where(
        models.Interview.member_id == member_id,
        models.Utterance.speaker_role == "candidate",
    ).order_by(models.Utterance.created_at.asc())).all()
    archive = member.application_archive
    member.personality_profile = analyze_personality_signals(
        motivation=archive.motivation, prior_experience=archive.prior_experience,
        available_time=archive.available_time, interview_text="\n".join(candidate_lines),
    )


def recompute_member_tags(db: Session, member_id: int) -> None:
    dimensions = db.scalars(select(models.Evidence.dimension).where(
        models.Evidence.member_id == member_id,
        models.Evidence.status != models.EvidenceStatus.rejected,
    ).distinct()).all()

    for dimension in dimensions:
        evidence = db.scalars(select(models.Evidence).where(
            models.Evidence.member_id == member_id,
            models.Evidence.dimension == dimension,
            models.Evidence.status != models.EvidenceStatus.rejected,
        ).order_by(models.Evidence.created_at.asc())).all()
        if not evidence:
            continue
        weighted = []
        confidences = []
        for item in evidence:
            source_weight = SOURCE_WEIGHTS.get(item.source_type, 0.60)
            weighted.append(item.strength * item.confidence * source_weight)
            confidences.append(item.confidence * source_weight)
        normalized = sum(weighted) / max(sum(confidences), 0.01)
        score = round(4.0 + normalized * 5.6, 1)
        confidence = round(min(0.96, sum(confidences) / (1.0 + 0.45 * (len(confidences) - 1))), 2)
        trend = "up" if len(evidence) > 1 and evidence[-1].strength >= evidence[0].strength else "stable"
        tag = db.scalar(select(models.MemberTag).where(
            models.MemberTag.member_id == member_id,
            models.MemberTag.dimension == dimension,
        ))
        if not tag:
            tag = models.MemberTag(member_id=member_id, dimension=dimension, score=score, confidence=confidence,
                                   trend=trend, evidence_count=len(evidence))
            db.add(tag)
        else:
            tag.score = score
            tag.confidence = confidence
            tag.trend = trend
            tag.evidence_count = len(evidence)


def review_evidence(db: Session, evidence: models.Evidence, status: models.EvidenceStatus,
                    review_note: str, reviewed_by: str) -> models.Evidence:
    evidence.status = status
    evidence.review_note = review_note
    evidence.reviewed_by = reviewed_by
    evidence.reviewed_at = datetime.utcnow()
    db.add(models.AuditLog(
        actor=reviewed_by, action="evidence.review", resource_type="evidence",
        resource_id=str(evidence.id), detail={"status": status.value, "note": review_note},
    ))
    recompute_member_tags(db, evidence.member_id)
    db.commit()
    db.refresh(evidence)
    return evidence


def counts_by_status(db: Session, status: models.EvidenceStatus) -> int:
    return db.scalar(select(func.count()).select_from(models.Evidence).where(models.Evidence.status == status)) or 0
