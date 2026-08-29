"""split applicants, members, and material analyses

Revision ID: 47b80a87e781
Revises: 810e009bbe22
Create Date: 2026-08-29 17:10:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "47b80a87e781"
down_revision: Union[str, None] = "810e009bbe22"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("members", sa.Column("lifecycle_stage", sa.String(length=32), nullable=False, server_default="applicant"))
    op.add_column("members", sa.Column("role_title", sa.String(length=120), nullable=False, server_default=""))
    op.add_column("members", sa.Column("joined_at", sa.DateTime(), nullable=True))
    op.create_index(op.f("ix_members_lifecycle_stage"), "members", ["lifecycle_stage"], unique=False)

    op.create_table(
        "application_archives",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=False),
        sa.Column("application_no", sa.String(length=48), nullable=False),
        sa.Column("recruitment_cycle", sa.String(length=64), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_name", sa.String(length=240), nullable=False),
        sa.Column("applied_at", sa.DateTime(), nullable=False),
        sa.Column("motivation", sa.Text(), nullable=False),
        sa.Column("prior_experience", sa.Text(), nullable=False),
        sa.Column("available_time", sa.String(length=64), nullable=False),
        sa.Column("raw_answers", sa.JSON(), nullable=False),
        sa.Column("profile_completion", sa.Float(), nullable=False),
        sa.Column("data_quality", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("application_no"),
        sa.UniqueConstraint("member_id"),
    )
    op.create_index(op.f("ix_application_archives_application_no"), "application_archives", ["application_no"], unique=True)
    op.create_index(op.f("ix_application_archives_member_id"), "application_archives", ["member_id"], unique=True)

    op.create_table(
        "material_analyses",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("member_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("file_names", sa.JSON(), nullable=False),
        sa.Column("material_types", sa.JSON(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("extracted_facts", sa.JSON(), nullable=False),
        sa.Column("uncertainties", sa.JSON(), nullable=False),
        sa.Column("suggested_questions", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["member_id"], ["members.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_material_analyses_member_id"), "material_analyses", ["member_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_material_analyses_member_id"), table_name="material_analyses")
    op.drop_table("material_analyses")
    op.drop_index(op.f("ix_application_archives_member_id"), table_name="application_archives")
    op.drop_index(op.f("ix_application_archives_application_no"), table_name="application_archives")
    op.drop_table("application_archives")
    op.drop_index(op.f("ix_members_lifecycle_stage"), table_name="members")
    op.drop_column("members", "joined_at")
    op.drop_column("members", "role_title")
    op.drop_column("members", "lifecycle_stage")
