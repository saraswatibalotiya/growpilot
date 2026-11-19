"""competitor data source: where a competitor's public posts came from

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-17

upgrade() is additive: two new columns on `competitors` plus a check constraint. Existing rows keep all their data.
Competitors that were suggested by the engine (source = AI_SUGGESTED) can only have come from the bundled FICTIONAL sample
provider, so they are labelled SAMPLE_PROVIDER; every other existing row keeps the default USER_SUPPLIED.

downgrade() drops the two columns (their values are lost). It needs the same explicit confirmation as 0001's downgrade.
"""
import os

import sqlalchemy as sa

from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('competitors', sa.Column('data_source', sa.String(length=20), server_default='USER_SUPPLIED', nullable=False), schema='ai_engine')
    op.add_column('competitors', sa.Column('posts_updated_at', sa.DateTime(timezone=True), nullable=True), schema='ai_engine')
    op.execute("UPDATE ai_engine.competitors SET data_source = 'SAMPLE_PROVIDER' WHERE source = 'AI_SUGGESTED'")
    op.create_check_constraint(op.f('ck_competitors_data_source'), 'competitors', "data_source IN ('USER_SUPPLIED','SAMPLE_PROVIDER','OFFICIAL_API')", schema='ai_engine')


def _require_explicit_confirmation() -> None:
    if os.environ.get("AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION") != "yes":
        raise RuntimeError("Refusing to downgrade: this drops columns and loses their data. Set AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION=yes and AI_ENGINE_CONFIRM_DATABASE=<database name> to proceed.")
    database = op.get_bind().exec_driver_sql("SELECT current_database()").scalar()
    if os.environ.get("AI_ENGINE_CONFIRM_DATABASE") != database:
        raise RuntimeError("Refusing to downgrade: AI_ENGINE_CONFIRM_DATABASE does not match the database being migrated.")


def downgrade() -> None:
    _require_explicit_confirmation()
    op.drop_constraint(op.f('ck_competitors_data_source'), 'competitors', schema='ai_engine', type_='check')
    op.drop_column('competitors', 'posts_updated_at', schema='ai_engine')
    op.drop_column('competitors', 'data_source', schema='ai_engine')
