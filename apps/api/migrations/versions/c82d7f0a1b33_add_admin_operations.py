"""add admin operations

Revision ID: c82d7f0a1b33
Revises: b71c4e2d9f10
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c82d7f0a1b33"
down_revision: Union[str, None] = "b71c4e2d9f10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "routine_tasks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("assignee_ids", sa.JSON(), nullable=False),
        sa.Column("submissions", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "course_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("location", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("materials", sa.JSON(), nullable=False),
        sa.Column("attendance", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "setp_teams",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("member_ids", sa.JSON(), nullable=False),
        sa.Column("leader_member_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_table(
        "setp_projects",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("setp_teams.id"), nullable=True),
        sa.Column("title", sa.String(180), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("budget_total", sa.Float(), nullable=False),
        sa.Column("application", sa.JSON(), nullable=False),
        sa.Column("issue_records", sa.JSON(), nullable=False),
        sa.Column("midterm", sa.JSON(), nullable=False),
        sa.Column("final", sa.JSON(), nullable=False),
        sa.Column("expenses", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_setp_projects_team_id", "setp_projects", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_setp_projects_team_id", table_name="setp_projects")
    op.drop_table("setp_projects")
    op.drop_table("setp_teams")
    op.drop_table("course_sessions")
    op.drop_table("routine_tasks")
