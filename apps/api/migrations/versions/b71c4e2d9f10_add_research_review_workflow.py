"""add research review workflow

Revision ID: b71c4e2d9f10
Revises: a4d29e73c812
Create Date: 2026-08-30 12:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b71c4e2d9f10"
down_revision: Union[str, None] = "a4d29e73c812"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "research_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("instructions", sa.JSON(), nullable=False),
        sa.Column("rubric", sa.JSON(), nullable=False),
        sa.Column("rubric_version", sa.String(40), nullable=False),
        sa.Column("duration_days", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        *timestamps(),
    )
    op.create_index("ix_research_tasks_status", "research_tasks", ["status"])

    op.create_table(
        "candidate_teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("research_tasks.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("analyzed_at", sa.DateTime(), nullable=True),
        *timestamps(),
    )
    op.create_index("ix_candidate_teams_task_id", "candidate_teams", ["task_id"])
    op.create_index("ix_candidate_teams_status", "candidate_teams", ["status"])

    op.create_table(
        "candidate_team_members",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("candidate_teams.id"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id"), nullable=False),
        sa.Column("role_summary", sa.String(240), nullable=False),
        sa.Column("is_leader", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("team_id", "member_id", name="uq_candidate_team_member"),
    )
    op.create_index("ix_candidate_team_members_team_id", "candidate_team_members", ["team_id"])
    op.create_index("ix_candidate_team_members_member_id", "candidate_team_members", ["member_id"])

    op.create_table(
        "research_submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("candidate_teams.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        *timestamps(),
    )
    op.create_index("ix_research_submissions_team_id", "research_submissions", ["team_id"])
    op.create_index("ix_research_submissions_status", "research_submissions", ["status"])

    op.create_table(
        "submission_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("research_submissions.id"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id"), nullable=True),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("original_name", sa.String(240), nullable=False),
        sa.Column("stored_name", sa.String(240), nullable=False, unique=True),
        sa.Column("suffix", sa.String(16), nullable=False),
        sa.Column("content_type", sa.String(120), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("extraction_status", sa.String(32), nullable=False),
        sa.Column("extracted_text", sa.Text(), nullable=False),
        sa.Column("extraction_report", sa.JSON(), nullable=False),
        sa.Column("segments", sa.JSON(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_submission_files_submission_id", "submission_files", ["submission_id"])
    op.create_index("ix_submission_files_member_id", "submission_files", ["member_id"])
    op.create_index("ix_submission_files_sha256", "submission_files", ["sha256"])

    op.create_table(
        "individual_contributions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("research_submissions.id"), nullable=False),
        sa.Column("team_member_id", sa.Integer(), sa.ForeignKey("candidate_team_members.id"), nullable=False),
        sa.Column("contribution", sa.Text(), nullable=False),
        sa.Column("key_findings", sa.Text(), nullable=False),
        sa.Column("challenges", sa.Text(), nullable=False),
        sa.Column("source_validation", sa.Text(), nullable=False),
        sa.Column("preferred_direction", sa.String(180), nullable=False),
        sa.Column("peer_confirmation", sa.JSON(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("submission_id", "team_member_id", name="uq_submission_contribution"),
    )
    op.create_index("ix_individual_contributions_submission_id", "individual_contributions", ["submission_id"])
    op.create_index("ix_individual_contributions_team_member_id", "individual_contributions", ["team_member_id"])

    op.create_table(
        "team_assessments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("research_submissions.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("model_version", sa.String(80), nullable=False),
        sa.Column("prompt_version", sa.String(40), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("team_score", sa.Float(), nullable=False),
        sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("conflicts", sa.JSON(), nullable=False),
        sa.Column("missing_information", sa.JSON(), nullable=False),
        sa.Column("suggested_questions", sa.JSON(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_team_assessments_submission_id", "team_assessments", ["submission_id"], unique=True)

    op.create_table(
        "candidate_assessments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_assessment_id", sa.Integer(), sa.ForeignKey("team_assessments.id"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id"), nullable=False),
        sa.Column("individual_score", sa.Float(), nullable=False),
        sa.Column("total_score", sa.Float(), nullable=False),
        sa.Column("contribution_confidence", sa.Float(), nullable=False),
        sa.Column("recommendation", sa.String(40), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("criteria", sa.JSON(), nullable=False),
        sa.Column("evidence", sa.JSON(), nullable=False),
        sa.Column("suggested_questions", sa.JSON(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("team_assessment_id", "member_id", name="uq_candidate_assessment"),
    )
    op.create_index("ix_candidate_assessments_team_assessment_id", "candidate_assessments", ["team_assessment_id"])
    op.create_index("ix_candidate_assessments_member_id", "candidate_assessments", ["member_id"])

    op.create_table(
        "human_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("candidate_teams.id"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id"), nullable=False),
        sa.Column("reviewer_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("recommendation", sa.String(40), nullable=False),
        sa.Column("criteria_scores", sa.JSON(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("concerns", sa.Text(), nullable=False),
        sa.Column("follow_up_questions", sa.JSON(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        *timestamps(),
        sa.UniqueConstraint("team_id", "member_id", "reviewer_id", name="uq_human_review"),
    )
    op.create_index("ix_human_reviews_team_id", "human_reviews", ["team_id"])
    op.create_index("ix_human_reviews_member_id", "human_reviews", ["member_id"])
    op.create_index("ix_human_reviews_reviewer_id", "human_reviews", ["reviewer_id"])

    op.create_table(
        "admission_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("candidate_teams.id"), nullable=False),
        sa.Column("member_id", sa.Integer(), sa.ForeignKey("members.id"), nullable=False),
        sa.Column("status", sa.String(40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("decided_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("team_id", "member_id", name="uq_admission_decision"),
    )
    op.create_index("ix_admission_decisions_team_id", "admission_decisions", ["team_id"])
    op.create_index("ix_admission_decisions_member_id", "admission_decisions", ["member_id"])
    op.create_index("ix_admission_decisions_decided_by", "admission_decisions", ["decided_by"])


def downgrade() -> None:
    op.drop_table("admission_decisions")
    op.drop_table("human_reviews")
    op.drop_table("candidate_assessments")
    op.drop_table("team_assessments")
    op.drop_table("individual_contributions")
    op.drop_table("submission_files")
    op.drop_table("research_submissions")
    op.drop_table("candidate_team_members")
    op.drop_table("candidate_teams")
    op.drop_table("research_tasks")
