"""initial schema: the `ai_engine` schema and its 14 tables

Revision ID: 0001
Revises:
Create Date: 2026-11-17

upgrade() is purely additive: it creates the `ai_engine` schema if it is missing and then creates tables. It never drops,
truncates or alters anything, and it fails (rather than overwrites) if a table already exists.

downgrade() DELETES ALL ENGINE DATA (every table in the schema). It refuses to run unless both are set:
    AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION=yes
    AI_ENGINE_CONFIRM_DATABASE=<the exact name of the database being migrated>
so it can not be run by accident, or against a database you did not name.
"""
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "ai_engine"')
    op.create_table('ai_profiles',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('public_id', sa.String(length=64), nullable=False),
    sa.Column('profile_type', sa.String(length=16), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('instagram_username', sa.String(length=30), nullable=True),
    sa.Column('category', sa.String(length=200), nullable=True),
    sa.Column('niche', sa.String(length=200), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('target_audience', sa.Text(), nullable=True),
    sa.Column('country', sa.String(length=60), server_default='India', nullable=False),
    sa.Column('region', sa.String(length=200), nullable=True),
    sa.Column('city', sa.String(length=200), nullable=True),
    sa.Column('primary_language', sa.String(length=10), server_default='en', nullable=False),
    sa.Column('brand_voice', sa.String(length=300), nullable=True),
    sa.Column('goals', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('products', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('services', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('preferred_topics', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('excluded_topics', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('preferred_formats', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('posting_frequency_per_week', sa.Float(), nullable=True),
    sa.Column('demographics', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("profile_type IN ('BUSINESS','CREATOR')", name=op.f('ck_ai_profiles_profile_type')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ai_profiles')),
    sa.UniqueConstraint('public_id', name='uq_ai_profiles_public_id'),
    schema='ai_engine'
    )
    op.create_table('festival_events',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('public_id', sa.String(length=64), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('year', sa.SmallInteger(), nullable=False),
    sa.Column('region', sa.String(length=60), nullable=False),
    sa.Column('category', sa.String(length=60), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('relevant_industries', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('relevant_content_themes', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('source', sa.Text(), nullable=False),
    sa.Column('verification_status', sa.String(length=40), nullable=False),
    sa.Column('date_note', sa.Text(), nullable=True),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_festival_events')),
    sa.UniqueConstraint('public_id', name='uq_festival_events_public_id'),
    schema='ai_engine'
    )
    op.create_index('ix_festival_events_date', 'festival_events', ['date'], unique=False, schema='ai_engine')
    op.create_table('audience_comments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('comment_id', sa.String(length=64), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('posted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('like_count', sa.Integer(), nullable=True),
    sa.Column('post_media_id', sa.String(length=64), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['profile_id'], ['ai_engine.ai_profiles.id'], name=op.f('fk_audience_comments_profile_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audience_comments')),
    sa.UniqueConstraint('profile_id', 'comment_id', name='uq_audience_comments_profile_comment'),
    schema='ai_engine'
    )
    op.create_index('ix_audience_comments_profile_posted', 'audience_comments', ['profile_id', 'posted_at'], unique=False, schema='ai_engine')
    op.create_table('audience_insights',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('comments_analyzed', sa.Integer(), nullable=False),
    sa.Column('insights', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('generated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['profile_id'], ['ai_engine.ai_profiles.id'], name=op.f('fk_audience_insights_profile_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audience_insights')),
    schema='ai_engine'
    )
    op.create_index('ix_audience_insights_profile_generated', 'audience_insights', ['profile_id', 'generated_at'], unique=False, schema='ai_engine')
    op.create_table('competitors',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('public_id', sa.String(length=64), nullable=False),
    sa.Column('username', sa.String(length=30), nullable=False),
    sa.Column('niche', sa.String(length=200), nullable=True),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('source', sa.String(length=16), nullable=False),
    sa.Column('approval_status', sa.String(length=16), nullable=False),
    sa.Column('suggestion_reason', sa.Text(), nullable=True),
    sa.Column('suggestion_confidence', sa.Float(), nullable=True),
    sa.Column('verified', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("approval_status IN ('PENDING','APPROVED','REJECTED')", name=op.f('ck_competitors_approval_status')),
    sa.CheckConstraint("source IN ('MANUAL','AI_SUGGESTED')", name=op.f('ck_competitors_source')),
    sa.ForeignKeyConstraint(['profile_id'], ['ai_engine.ai_profiles.id'], name=op.f('fk_competitors_profile_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_competitors')),
    sa.UniqueConstraint('id', 'profile_id', name='uq_competitors_id_profile'),
    sa.UniqueConstraint('profile_id', 'public_id', name='uq_competitors_profile_public'),
    sa.UniqueConstraint('profile_id', 'username', name='uq_competitors_profile_username'),
    schema='ai_engine'
    )
    op.create_index('ix_competitors_profile_status', 'competitors', ['profile_id', 'approval_status'], unique=False, schema='ai_engine')
    op.create_table('instagram_posts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('media_id', sa.String(length=64), nullable=False),
    sa.Column('caption', sa.Text(), nullable=True),
    sa.Column('media_type', sa.String(length=30), nullable=True),
    sa.Column('media_product_type', sa.String(length=30), nullable=True),
    sa.Column('permalink', sa.String(length=500), nullable=True),
    sa.Column('posted_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['profile_id'], ['ai_engine.ai_profiles.id'], name=op.f('fk_instagram_posts_profile_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_instagram_posts')),
    sa.UniqueConstraint('id', 'profile_id', name='uq_instagram_posts_id_profile'),
    sa.UniqueConstraint('profile_id', 'media_id', name='uq_instagram_posts_profile_media'),
    schema='ai_engine'
    )
    op.create_index('ix_instagram_posts_profile_posted', 'instagram_posts', ['profile_id', 'posted_at'], unique=False, schema='ai_engine')
    op.create_table('learning_adjustments',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('dimension', sa.String(length=20), nullable=False),
    sa.Column('value', sa.String(length=120), nullable=False),
    sa.Column('samples', sa.Integer(), nullable=False),
    sa.Column('mean_signal', sa.Float(), nullable=False),
    sa.Column('adjustment', sa.Float(), nullable=False),
    sa.Column('active', sa.Boolean(), nullable=False),
    sa.Column('is_current', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('trigger_type', sa.String(length=10), nullable=True),
    sa.Column('trigger_id', sa.String(length=64), nullable=True),
    sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('samples >= 0', name=op.f('ck_learning_adjustments_samples_non_negative')),
    sa.ForeignKeyConstraint(['profile_id'], ['ai_engine.ai_profiles.id'], name=op.f('fk_learning_adjustments_profile_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_learning_adjustments')),
    schema='ai_engine'
    )
    op.create_index('ix_learning_adjustments_profile_computed', 'learning_adjustments', ['profile_id', 'computed_at'], unique=False, schema='ai_engine')
    op.create_index('uq_learning_adjustments_current', 'learning_adjustments', ['profile_id', 'dimension', 'value'], unique=True, schema='ai_engine', postgresql_where=sa.text('is_current'))
    op.create_table('recommendations',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('content_idea', sa.Text(), nullable=False),
    sa.Column('detailed_concept', sa.Text(), nullable=False),
    sa.Column('format', sa.String(length=30), nullable=False),
    sa.Column('objective', sa.String(length=30), nullable=False),
    sa.Column('target_audience', sa.Text(), nullable=False),
    sa.Column('suggested_publish_date', sa.Date(), nullable=True),
    sa.Column('publish_timing_note', sa.Text(), nullable=True),
    sa.Column('hook', sa.Text(), nullable=False),
    sa.Column('caption_direction', sa.Text(), nullable=False),
    sa.Column('call_to_action', sa.Text(), nullable=False),
    sa.Column('hashtags', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('opportunity_score', sa.SmallInteger(), nullable=False),
    sa.Column('confidence_score', sa.SmallInteger(), nullable=False),
    sa.Column('score_breakdown', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('reasoning', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('source_references', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('risks_and_caveats', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('suggested_duration_seconds', sa.Integer(), nullable=True),
    sa.Column('idea_fingerprint', sa.String(length=64), nullable=False),
    sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('generation', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.CheckConstraint('opportunity_score BETWEEN 0 AND 100 AND confidence_score BETWEEN 0 AND 100', name=op.f('ck_recommendations_scores_in_range')),
    sa.ForeignKeyConstraint(['profile_id'], ['ai_engine.ai_profiles.id'], name=op.f('fk_recommendations_profile_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recommendations')),
    sa.UniqueConstraint('id', 'profile_id', name='uq_recommendations_id_profile'),
    schema='ai_engine'
    )
    op.create_index('ix_recommendations_profile_created', 'recommendations', ['profile_id', 'created_at'], unique=False, schema='ai_engine')
    op.create_index('ix_recommendations_profile_fingerprint', 'recommendations', ['profile_id', 'idea_fingerprint'], unique=False, schema='ai_engine')
    op.create_table('trend_snapshots',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('as_of', sa.Date(), nullable=False),
    sa.Column('trend_count', sa.Integer(), nullable=False),
    sa.Column('trends', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['profile_id'], ['ai_engine.ai_profiles.id'], name=op.f('fk_trend_snapshots_profile_id'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_trend_snapshots')),
    schema='ai_engine'
    )
    op.create_index('ix_trend_snapshots_profile_asof', 'trend_snapshots', ['profile_id', 'as_of', 'captured_at'], unique=False, schema='ai_engine')
    op.create_table('competitor_posts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('competitor_id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('media_id', sa.String(length=64), nullable=False),
    sa.Column('caption', sa.Text(), nullable=True),
    sa.Column('media_type', sa.String(length=30), nullable=True),
    sa.Column('posted_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('likes', sa.BigInteger(), nullable=True),
    sa.Column('comments', sa.BigInteger(), nullable=True),
    sa.ForeignKeyConstraint(['competitor_id', 'profile_id'], ['ai_engine.competitors.id', 'ai_engine.competitors.profile_id'], name='fk_competitor_posts_competitor_profile', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_competitor_posts')),
    sa.UniqueConstraint('competitor_id', 'media_id', name='uq_competitor_posts_competitor_media'),
    schema='ai_engine'
    )
    op.create_index('ix_competitor_posts_profile', 'competitor_posts', ['profile_id'], unique=False, schema='ai_engine')
    op.create_table('post_analytics',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('post_id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('views', sa.BigInteger(), nullable=True),
    sa.Column('reach', sa.BigInteger(), nullable=True),
    sa.Column('likes', sa.BigInteger(), nullable=True),
    sa.Column('comments', sa.BigInteger(), nullable=True),
    sa.Column('shares', sa.BigInteger(), nullable=True),
    sa.Column('saves', sa.BigInteger(), nullable=True),
    sa.Column('interactions', sa.BigInteger(), nullable=True),
    sa.Column('avg_watch_time_seconds', sa.Float(), nullable=True),
    sa.Column('follower_count', sa.BigInteger(), nullable=True),
    sa.Column('captured_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('coalesce(views,0) >= 0 AND coalesce(reach,0) >= 0 AND coalesce(likes,0) >= 0 AND coalesce(comments,0) >= 0 AND coalesce(shares,0) >= 0 AND coalesce(saves,0) >= 0', name=op.f('ck_post_analytics_metrics_non_negative')),
    sa.ForeignKeyConstraint(['post_id', 'profile_id'], ['ai_engine.instagram_posts.id', 'ai_engine.instagram_posts.profile_id'], name='fk_post_analytics_post_profile', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_post_analytics')),
    sa.UniqueConstraint('post_id', name='uq_post_analytics_post_id'),
    schema='ai_engine'
    )
    op.create_index('ix_post_analytics_profile', 'post_analytics', ['profile_id'], unique=False, schema='ai_engine')
    op.create_table('recommendation_evidence',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('recommendation_id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('position', sa.SmallInteger(), nullable=False),
    sa.Column('signal', sa.String(length=20), nullable=False),
    sa.Column('statement', sa.Text(), nullable=False),
    sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    sa.ForeignKeyConstraint(['recommendation_id', 'profile_id'], ['ai_engine.recommendations.id', 'ai_engine.recommendations.profile_id'], name='fk_recommendation_evidence_recommendation_profile', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recommendation_evidence')),
    sa.UniqueConstraint('recommendation_id', 'position', name='uq_recommendation_evidence_position'),
    schema='ai_engine'
    )
    op.create_index('ix_recommendation_evidence_profile', 'recommendation_evidence', ['profile_id'], unique=False, schema='ai_engine')
    op.create_table('recommendation_feedback',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('recommendation_id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('action', sa.String(length=20), nullable=False),
    sa.Column('comment', sa.String(length=500), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint("action IN ('SAVED','DISMISSED','LIKED','NOT_RELEVANT','ALREADY_POSTED','CREATED','PUBLISHED')", name=op.f('ck_recommendation_feedback_action')),
    sa.ForeignKeyConstraint(['recommendation_id', 'profile_id'], ['ai_engine.recommendations.id', 'ai_engine.recommendations.profile_id'], name='fk_recommendation_feedback_recommendation_profile', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recommendation_feedback')),
    schema='ai_engine'
    )
    op.create_index('ix_recommendation_feedback_profile_created', 'recommendation_feedback', ['profile_id', 'created_at'], unique=False, schema='ai_engine')
    op.create_index('ix_recommendation_feedback_recommendation', 'recommendation_feedback', ['recommendation_id'], unique=False, schema='ai_engine')
    op.create_table('recommendation_outcomes',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('recommendation_id', sa.UUID(), nullable=False),
    sa.Column('profile_id', sa.UUID(), nullable=False),
    sa.Column('interval', sa.String(length=10), nullable=False),
    sa.Column('instagram_media_id', sa.String(length=64), nullable=True),
    sa.Column('captured_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('metrics_available', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('engagement_rate', sa.Float(), nullable=True),
    sa.Column('performance_index', sa.Float(), nullable=True),
    sa.CheckConstraint("interval IN ('INITIAL','H24','H72','D7')", name=op.f('ck_recommendation_outcomes_interval')),
    sa.ForeignKeyConstraint(['recommendation_id', 'profile_id'], ['ai_engine.recommendations.id', 'ai_engine.recommendations.profile_id'], name='fk_recommendation_outcomes_recommendation_profile', ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_recommendation_outcomes')),
    sa.UniqueConstraint('recommendation_id', 'interval', name='uq_recommendation_outcomes_interval'),
    schema='ai_engine'
    )
    op.create_index('ix_recommendation_outcomes_profile_captured', 'recommendation_outcomes', ['profile_id', 'captured_at'], unique=False, schema='ai_engine')


def _require_explicit_confirmation() -> None:
    import os

    if os.environ.get("AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION") != "yes":
        raise RuntimeError("Refusing to downgrade: this deletes all AI engine data. Set AI_ENGINE_ALLOW_DESTRUCTIVE_MIGRATION=yes and AI_ENGINE_CONFIRM_DATABASE=<database name> to proceed.")
    database = op.get_bind().exec_driver_sql("SELECT current_database()").scalar()
    if os.environ.get("AI_ENGINE_CONFIRM_DATABASE") != database:
        raise RuntimeError("Refusing to downgrade: AI_ENGINE_CONFIRM_DATABASE does not match the database being migrated.")


def downgrade() -> None:
    _require_explicit_confirmation()
    op.drop_index('ix_recommendation_outcomes_profile_captured', table_name='recommendation_outcomes', schema='ai_engine')
    op.drop_table('recommendation_outcomes', schema='ai_engine')
    op.drop_index('ix_recommendation_feedback_recommendation', table_name='recommendation_feedback', schema='ai_engine')
    op.drop_index('ix_recommendation_feedback_profile_created', table_name='recommendation_feedback', schema='ai_engine')
    op.drop_table('recommendation_feedback', schema='ai_engine')
    op.drop_index('ix_recommendation_evidence_profile', table_name='recommendation_evidence', schema='ai_engine')
    op.drop_table('recommendation_evidence', schema='ai_engine')
    op.drop_index('ix_post_analytics_profile', table_name='post_analytics', schema='ai_engine')
    op.drop_table('post_analytics', schema='ai_engine')
    op.drop_index('ix_competitor_posts_profile', table_name='competitor_posts', schema='ai_engine')
    op.drop_table('competitor_posts', schema='ai_engine')
    op.drop_index('ix_trend_snapshots_profile_asof', table_name='trend_snapshots', schema='ai_engine')
    op.drop_table('trend_snapshots', schema='ai_engine')
    op.drop_index('ix_recommendations_profile_fingerprint', table_name='recommendations', schema='ai_engine')
    op.drop_index('ix_recommendations_profile_created', table_name='recommendations', schema='ai_engine')
    op.drop_table('recommendations', schema='ai_engine')
    op.drop_index('uq_learning_adjustments_current', table_name='learning_adjustments', schema='ai_engine', postgresql_where=sa.text('is_current'))
    op.drop_index('ix_learning_adjustments_profile_computed', table_name='learning_adjustments', schema='ai_engine')
    op.drop_table('learning_adjustments', schema='ai_engine')
    op.drop_index('ix_instagram_posts_profile_posted', table_name='instagram_posts', schema='ai_engine')
    op.drop_table('instagram_posts', schema='ai_engine')
    op.drop_index('ix_competitors_profile_status', table_name='competitors', schema='ai_engine')
    op.drop_table('competitors', schema='ai_engine')
    op.drop_index('ix_audience_insights_profile_generated', table_name='audience_insights', schema='ai_engine')
    op.drop_table('audience_insights', schema='ai_engine')
    op.drop_index('ix_audience_comments_profile_posted', table_name='audience_comments', schema='ai_engine')
    op.drop_table('audience_comments', schema='ai_engine')
    op.drop_index('ix_festival_events_date', table_name='festival_events', schema='ai_engine')
    op.drop_table('festival_events', schema='ai_engine')
    op.drop_table('ai_profiles', schema='ai_engine')
