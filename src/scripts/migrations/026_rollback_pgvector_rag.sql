-- Rollback 026: pgvector RAG

DROP INDEX IF EXISTS copilot.idx_doc_embeddings_hnsw_cosine;
DROP INDEX IF EXISTS copilot.idx_doc_embeddings_tenant;

ALTER TABLE copilot.doc_embeddings
  DROP COLUMN IF EXISTS embedding,
  ADD COLUMN IF NOT EXISTS embedding_values DOUBLE PRECISION[];

-- Remove seeded rows (don't drop extension — other extensions may depend on it)
DELETE FROM copilot.model_registry WHERE model_key = 'text-embedding-3-small';
UPDATE copilot.prompt_versions SET status = 'deprecated' WHERE prompt_key = 'rag_answer' AND version = 1;
