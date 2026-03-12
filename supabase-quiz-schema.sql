-- =============================================================================
-- Quiz Schema for Sitecore XM Cloud Quiz Application
-- =============================================================================
-- This schema defines the `quiz` schema and replaces the MongoDB collections
-- previously used to store exam content, questions, competencies, and document
-- chunks for the Sitecore XM Cloud (SCXMCL) quiz application.
--
-- MongoDB collections replaced:
--   exams            -> quiz.exams
--   questions        -> quiz.questions
--   competencies     -> quiz.competencies
--   document_chunks  -> quiz.document_chunks
--
-- All tables have RLS enabled. Authenticated users may SELECT. Mutations are
-- reserved for the service role (server-side only).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS quiz;

-- ---------------------------------------------------------------------------
-- Shared trigger function: keep updated_at current on every row UPDATE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION quiz.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ===========================================================================
-- Table: quiz.exams
-- ===========================================================================
-- One row per exam / certification. The exam_id is the human-readable slug
-- (e.g. "XM-CLOUD-2024") that is used as a foreign key in child tables.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS quiz.exams (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id         text        UNIQUE NOT NULL,
    exam_title      text,
    welcome_config  jsonb,
    document_groups text[],
    created_at      timestamptz NOT NULL DEFAULT NOW(),
    updated_at      timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE quiz.exams ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS exams_exam_id_idx      ON quiz.exams (exam_id);
CREATE INDEX IF NOT EXISTS exams_created_at_idx   ON quiz.exams (created_at);

-- Trigger
CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON quiz.exams
    FOR EACH ROW
    EXECUTE FUNCTION quiz.update_updated_at();

-- RLS Policies
CREATE POLICY "Authenticated users can select exams"
    ON quiz.exams
    FOR SELECT
    TO authenticated
    USING (true);

-- ===========================================================================
-- Table: quiz.questions
-- ===========================================================================
-- One row per exam question. Stores the question text, answer options, correct
-- answer(s), optional AI-generated explanation, competency tags, moderation
-- flags, and a precomputed text embedding for similarity search.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS quiz.questions (
    id                            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id                       text        NOT NULL
                                              REFERENCES quiz.exams (exam_id)
                                              ON DELETE CASCADE,
    question                      text        NOT NULL,
    -- options: keyed object, e.g. {"A": "...", "B": "...", "C": "...", "D": "..."}
    options                       jsonb       NOT NULL,
    -- answer: single letter string ("B") or array for multiple-choice (["A","C"])
    answer                        jsonb       NOT NULL,
    question_type                 text        NOT NULL DEFAULT 'single'
                                              CHECK (question_type IN ('single', 'multiple')),
    explanation                   text,
    explanation_generated_by_ai   boolean     DEFAULT false,
    explanation_sources           jsonb,
    explanation_history           jsonb,
    study                         jsonb,
    competency_ids                text[],
    flagged_for_review            boolean     DEFAULT false,
    flagged_reason                text,
    flagged_at                    timestamptz,
    flagged_by                    text,
    embedding                     vector(1536),
    embedding_model               text,
    embedding_updated_at          timestamptz,
    created_at                    timestamptz NOT NULL DEFAULT NOW(),
    updated_at                    timestamptz NOT NULL DEFAULT NOW(),

    -- Prevent duplicate question text within the same exam
    UNIQUE (exam_id, question)
);

ALTER TABLE quiz.questions ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS questions_exam_id_idx
    ON quiz.questions (exam_id);

CREATE INDEX IF NOT EXISTS questions_question_type_idx
    ON quiz.questions (question_type);

CREATE INDEX IF NOT EXISTS questions_flagged_for_review_idx
    ON quiz.questions (flagged_for_review)
    WHERE flagged_for_review = true;

-- Partial index: only index rows that have embeddings to avoid sparse index bloat
CREATE INDEX IF NOT EXISTS questions_embedding_idx
    ON quiz.questions
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS questions_created_at_idx
    ON quiz.questions (created_at);

-- Trigger
CREATE TRIGGER update_questions_updated_at
    BEFORE UPDATE ON quiz.questions
    FOR EACH ROW
    EXECUTE FUNCTION quiz.update_updated_at();

-- RLS Policies
CREATE POLICY "Authenticated users can select questions"
    ON quiz.questions
    FOR SELECT
    TO authenticated
    USING (true);

-- ===========================================================================
-- Table: quiz.competencies
-- ===========================================================================
-- Exam competency domains / topic areas. Questions reference these via the
-- competency_ids text[] column on quiz.questions.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS quiz.competencies (
    id                   uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id              text        NOT NULL
                                     REFERENCES quiz.exams (exam_id)
                                     ON DELETE CASCADE,
    title                text        NOT NULL,
    description          text        NOT NULL,
    exam_percentage      numeric     CHECK (exam_percentage >= 0 AND exam_percentage <= 100),
    embedding            vector(1536),
    embedding_model      text,
    embedding_updated_at timestamptz,
    created_at           timestamptz NOT NULL DEFAULT NOW(),
    updated_at           timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE quiz.competencies ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS competencies_exam_id_idx
    ON quiz.competencies (exam_id);

CREATE INDEX IF NOT EXISTS competencies_embedding_idx
    ON quiz.competencies
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;

-- Trigger
CREATE TRIGGER update_competencies_updated_at
    BEFORE UPDATE ON quiz.competencies
    FOR EACH ROW
    EXECUTE FUNCTION quiz.update_updated_at();

-- RLS Policies
CREATE POLICY "Authenticated users can select competencies"
    ON quiz.competencies
    FOR SELECT
    TO authenticated
    USING (true);

-- ===========================================================================
-- Table: quiz.document_chunks
-- ===========================================================================
-- Stores chunked source documents produced by the data pipeline. Each chunk
-- carries its text content plus a precomputed embedding used for RAG retrieval.
-- The chunk_id is the chunkContentHash emitted by the pipeline and acts as the
-- stable deduplication key.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS quiz.document_chunks (
    id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- chunkContentHash from the ingest pipeline; used for upsert deduplication
    chunk_id        text        UNIQUE NOT NULL,
    source_file     text,
    source_basename text,
    group_id        text,
    title           text,
    description     text,
    url             text,
    tags            text[],
    text            text        NOT NULL,
    section_path    text,
    nearest_heading text,
    chunk_index     int,
    chunk_total     int,
    start_index     int,
    end_index       int,
    model           text,
    dimensions      int,
    content_hash    text,
    source_meta     jsonb,
    embedding       vector(1536),
    created_at      timestamptz NOT NULL DEFAULT NOW(),
    updated_at      timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE quiz.document_chunks ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS document_chunks_chunk_id_idx
    ON quiz.document_chunks (chunk_id);

CREATE INDEX IF NOT EXISTS document_chunks_group_id_idx
    ON quiz.document_chunks (group_id);

CREATE INDEX IF NOT EXISTS document_chunks_source_basename_idx
    ON quiz.document_chunks (source_basename);

CREATE INDEX IF NOT EXISTS document_chunks_content_hash_idx
    ON quiz.document_chunks (content_hash);

CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
    ON quiz.document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding IS NOT NULL;

CREATE INDEX IF NOT EXISTS document_chunks_created_at_idx
    ON quiz.document_chunks (created_at);

-- Trigger
CREATE TRIGGER update_document_chunks_updated_at
    BEFORE UPDATE ON quiz.document_chunks
    FOR EACH ROW
    EXECUTE FUNCTION quiz.update_updated_at();

-- RLS Policies
CREATE POLICY "Authenticated users can select document_chunks"
    ON quiz.document_chunks
    FOR SELECT
    TO authenticated
    USING (true);

-- ===========================================================================
-- Rollback (reference — run manually to undo this migration)
-- ===========================================================================
-- DROP TABLE IF EXISTS quiz.document_chunks;
-- DROP TABLE IF EXISTS quiz.competencies;
-- DROP TABLE IF EXISTS quiz.questions;
-- DROP TABLE IF EXISTS quiz.exams;
-- DROP FUNCTION IF EXISTS quiz.update_updated_at();
-- DROP SCHEMA IF EXISTS quiz;
