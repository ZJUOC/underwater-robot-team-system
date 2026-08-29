"""add explainable personality profile

Revision ID: 9c3f11b6f401
Revises: 47b80a87e781
Create Date: 2026-08-29 18:20:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c3f11b6f401"
down_revision: Union[str, None] = "47b80a87e781"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("members", sa.Column("personality_profile", sa.JSON(), nullable=False, server_default="{}"))


def downgrade() -> None:
    op.drop_column("members", "personality_profile")
