"""add material extraction report

Revision ID: a4d29e73c812
Revises: 9c3f11b6f401
Create Date: 2026-08-29 21:10:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4d29e73c812"
down_revision: Union[str, None] = "9c3f11b6f401"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "material_analyses",
        sa.Column("extraction_report", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("material_analyses", "extraction_report")
