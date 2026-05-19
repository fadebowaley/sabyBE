-- Migration 026: Enable pgvector + upgrade RAG embedding storage
-- Phase 6: RAG and Knowledge Layer
--
-- The doc_embeddings table was created with DOUBLE PRECISION[] which cannot
-- be indexed for cosine similarity. This migration converts it to the native
-- pgvector VECTOR type and adds an HNSW index for fast approximate search.
-- text-embedding-3-small produces 1536-dimension vectors.

-- Enable the extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop the old DOUBLE PRECISION[] column and replace with VECTOR(1536)
-- Existing rows (none in production at this point) would be dropped.
ALTER TABLE copilot.doc_embeddings
  DROP COLUMN IF EXISTS embedding_values,
  ADD COLUMN IF NOT EXISTS embedding VECTOR(1536);

-- HNSW index for approximate nearest-neighbour cosine similarity.
-- ef_construction=128 is a reasonable default for enterprise document sets.
-- This index makes retrieval O(log n) rather than O(n).
CREATE INDEX IF NOT EXISTS idx_doc_embeddings_hnsw_cosine
  ON copilot.doc_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- Also index by tenant_id so the similarity scan is always tenant-scoped.
-- The planner combines this with the HNSW index via a bitmap scan.
CREATE INDEX IF NOT EXISTS idx_doc_embeddings_tenant
  ON copilot.doc_embeddings (tenant_id);

-- Seed text-embedding-3-small into model_registry so the router knows its cost
INSERT INTO copilot.model_registry
  (model_key, provider, model_name, latency_class, task_types,
   max_context_tokens, cost_input_per_1k, cost_output_per_1k,
   supports_json_mode, supports_tools, priority)
VALUES
  (
    'text-embedding-3-small', 'openai', 'text-embedding-3-small', 'fast',
    '["embedding"]',
    8191, 0.000020, 0.0, false, false, 1
  )
ON CONFLICT (model_key) DO NOTHING;

-- Seed the rag_answer prompt template
INSERT INTO copilot.prompt_versions
  (prompt_key, version, owner, description, system_prompt, user_prompt_template,
   input_variables, output_schema, model_hint, task_type, status, changelog, created_by)
VALUES
  (
    'rag_answer', 1, 'system',
    'Answers a user question from retrieved document chunks with mandatory citations',
    E'You are a Saby knowledge assistant. Answer the user question using ONLY the source documents provided below.\n\nRules:\n- Never answer from your own training data if the documents do not support it\n- Every factual claim must reference at least one source by its [Source N] label\n- If the documents do not contain enough information to answer, say so explicitly\n- Keep your answer concise and professional\n- Do not fabricate citations\n\nRespond in this JSON format:\n{"answer":"<your answer, referencing [Source N] labels>","citations":[{"sourceLabel":"Source N","excerpt":"<verbatim short quote from that chunk>","relevance":"high"|"medium"}]}',
    E'User question: {{question}}\n\nSource documents:\n{{chunks}}',
    '["question","chunks"]',
    '{"type":"object","required":["answer","citations"],"properties":{"answer":{"type":"string"},"citations":{"type":"array"}}}',
    'gpt-4o-mini', 'rag_answer', 'active',
    'Initial release — citation-mandatory RAG answer template', 'system'
  )
ON CONFLICT (prompt_key, version) DO NOTHING;
