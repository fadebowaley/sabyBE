'use strict';

/**
 * Document Ingestion Service — Phase 6 RAG
 *
 * Handles the full document-to-chunks pipeline:
 *   1. Create a doc record in copilot.docs (or look up existing by content_hash)
 *   2. Validate the document (type, size, tenant policy)
 *   3. Split raw text into overlapping chunks (~400 tokens each, 50-token overlap)
 *   4. Write chunk rows to copilot.doc_chunks
 *   5. Queue a doc_ingestion_job for the embedding worker to pick up
 *
 * Idempotent on content_hash — re-uploading the same document text replaces
 * the existing chunks rather than creating duplicates.
 *
 * Supported content sources: plain text, markdown, pre-extracted PDF text.
 * PDF binary extraction is handled upstream (storage.service → S3) before
 * this service receives the text content.
 */

const crypto                = require('crypto');
const { postgresPool }      = require('../config/postgres');
const logger                = require('../config/logger');

// ─── Chunking constants ───────────────────────────────────────────────────────

const TARGET_CHUNK_TOKENS   = 400;  // approximate tokens per chunk
const OVERLAP_TOKENS        = 50;   // token overlap between adjacent chunks
const CHARS_PER_TOKEN       = 4;    // conservative estimate (English text)
const TARGET_CHUNK_CHARS    = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN;   // 1600
const OVERLAP_CHARS         = OVERLAP_TOKENS * CHARS_PER_TOKEN;         // 200

const SUPPORTED_MIME_TYPES  = new Set([
  'text/plain', 'text/markdown', 'text/html',
  'application/pdf',          // text must be pre-extracted before calling this service
  'application/json',
]);

const MAX_CONTENT_BYTES     = 10 * 1024 * 1024; // 10 MB raw text

// ─── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Split text into overlapping chunks, breaking on paragraph or sentence
 * boundaries rather than arbitrary character positions.
 *
 * @param {string} text
 * @returns {string[]}
 */
function chunkText(text) {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalised.length === 0) return [];

  // Split on paragraph boundaries first
  const paragraphs = normalised.split(/\n{2,}/).filter(p => p.trim().length > 0);

  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;

    if (candidate.length <= TARGET_CHUNK_CHARS) {
      current = candidate;
    } else {
      // Flush current if non-empty
      if (current) {
        chunks.push(current.trim());
        // Start new chunk with overlap from tail of previous
        const overlap = current.slice(-OVERLAP_CHARS);
        current = `${overlap}\n\n${para}`;
      } else {
        // Single paragraph too long — split on sentences
        const sentences = para.match(/[^.!?]+[.!?]+\s*/g) || [para];
        for (const sentence of sentences) {
          const sc = current ? `${current} ${sentence}` : sentence;
          if (sc.length <= TARGET_CHUNK_CHARS) {
            current = sc;
          } else {
            if (current) chunks.push(current.trim());
            current = sentence;
          }
        }
      }
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function contentHash(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function estimateTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ─── Doc record management ────────────────────────────────────────────────────

/**
 * Register a document and return its ID.
 * If a doc with the same content_hash already exists for the tenant, return
 * the existing ID and schedule a re-index rather than creating a duplicate.
 */
async function registerDoc({
  tenantId, title, source = 'upload', sourceRef = null,
  s3Key = null, url = null, mimeType = 'text/plain',
  contentText, accessPolicy = {}, metadata = {}, createdBy = null,
}) {
  if (Buffer.byteLength(contentText, 'utf8') > MAX_CONTENT_BYTES) {
    throw Object.assign(
      new Error(`Document too large (max ${MAX_CONTENT_BYTES / 1024 / 1024} MB of text)`),
      { code: 'DOC_TOO_LARGE' }
    );
  }
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw Object.assign(
      new Error(`Unsupported MIME type: ${mimeType}`),
      { code: 'UNSUPPORTED_MIME_TYPE' }
    );
  }

  const hash = contentHash(contentText);

  // Check for existing doc with same hash in this tenant
  const existingSql = `
    SELECT id, ingestion_status FROM copilot.docs
    WHERE tenant_id = $1 AND content_hash = $2 AND deleted_at IS NULL
    LIMIT 1
  `;
  const { rows: existing } = await postgresPool.query(existingSql, [tenantId, hash]);
  if (existing.length) {
    logger.info('[DocIngestion] Duplicate content_hash detected, returning existing doc', {
      tenantId, docId: existing[0].id,
    });
    return { docId: existing[0].id, duplicate: true, status: existing[0].ingestion_status };
  }

  const sql = `
    INSERT INTO copilot.docs
      (tenant_id, title, source, source_ref, s3_key, url,
       content_hash, mime_type, access_policy, metadata,
       ingestion_status, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)
    RETURNING id
  `;
  const { rows } = await postgresPool.query(sql, [
    tenantId, title, source, sourceRef, s3Key, url,
    hash, mimeType,
    JSON.stringify(accessPolicy), JSON.stringify(metadata),
    createdBy,
  ]);
  return { docId: rows[0].id, duplicate: false, status: 'pending' };
}

/**
 * Chunk the document text and write rows to copilot.doc_chunks.
 * Deletes any existing chunks for the doc first (safe re-index).
 *
 * @returns {Promise<{chunkCount: number}>}
 */
async function writeChunks({ docId, tenantId, contentText }) {
  const chunks = chunkText(contentText);
  if (!chunks.length) {
    throw Object.assign(new Error('Document produced zero chunks after chunking'), { code: 'EMPTY_DOCUMENT' });
  }

  // Delete old chunks before rewriting (idempotent re-index)
  await postgresPool.query(
    'DELETE FROM copilot.doc_chunks WHERE doc_id = $1 AND tenant_id = $2',
    [docId, tenantId]
  );

  const hash = contentHash(contentText);

  for (let i = 0; i < chunks.length; i++) {
    const chunkHash = crypto.createHash('sha256').update(chunks[i], 'utf8').digest('hex');
    await postgresPool.query(
      `INSERT INTO copilot.doc_chunks
         (doc_id, tenant_id, chunk_index, chunk_text, token_count, chunk_hash, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (doc_id, chunk_index) DO UPDATE
         SET chunk_text = EXCLUDED.chunk_text,
             token_count = EXCLUDED.token_count,
             chunk_hash = EXCLUDED.chunk_hash`,
      [docId, tenantId, i, chunks[i], estimateTokens(chunks[i]), chunkHash, '{}']
    );
  }

  logger.info('[DocIngestion] Chunks written', { docId, tenantId, chunkCount: chunks.length });
  return { chunkCount: chunks.length };
}

/**
 * Queue a doc for embedding by creating a doc_ingestion_job record.
 * Idempotent — skips if a queued/processing job already exists.
 */
async function queueEmbeddingJob({ docId, tenantId }) {
  const existingSql = `
    SELECT id FROM copilot.doc_ingestion_jobs
    WHERE doc_id = $1 AND tenant_id = $2 AND status IN ('queued', 'processing')
    LIMIT 1
  `;
  const { rows: existing } = await postgresPool.query(existingSql, [docId, tenantId]);
  if (existing.length) return { jobId: existing[0].id, queued: false };

  const { rows } = await postgresPool.query(
    `INSERT INTO copilot.doc_ingestion_jobs (tenant_id, doc_id, status)
     VALUES ($1, $2, 'queued') RETURNING id`,
    [tenantId, docId]
  );
  return { jobId: rows[0].id, queued: true };
}

/**
 * Full ingest pipeline: register → chunk → queue embedding job.
 * This is the single entry point called by the controller.
 */
async function ingestDocument({
  tenantId, title, source, sourceRef, s3Key, url,
  mimeType, contentText, accessPolicy, metadata, createdBy,
}) {
  const { docId, duplicate } = await registerDoc({
    tenantId, title, source, sourceRef, s3Key, url,
    mimeType, contentText, accessPolicy, metadata, createdBy,
  });

  const { chunkCount } = await writeChunks({ docId, tenantId, contentText });
  const { jobId } = await queueEmbeddingJob({ docId, tenantId });

  // Update doc status to 'processing'
  await postgresPool.query(
    `UPDATE copilot.docs SET ingestion_status = 'processing', updated_at = now()
     WHERE id = $1`,
    [docId]
  );

  return { docId, jobId, chunkCount, duplicate };
}

/**
 * List tenant documents.
 */
async function listDocs({ tenantId, status, limit = 50 }) {
  const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];
  const values = [tenantId];
  let idx = 2;
  if (status) { conditions.push(`ingestion_status = $${idx++}`); values.push(status); }
  values.push(limit);
  const sql = `
    SELECT id, title, source, mime_type, ingestion_status,
           content_hash, created_by, created_at, updated_at
    FROM copilot.docs
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT $${idx}
  `;
  const { rows } = await postgresPool.query(sql, values);
  return rows;
}

/**
 * Get a single doc with its ingestion job status.
 */
async function getDoc({ tenantId, docId }) {
  const sql = `
    SELECT d.*,
           j.id AS job_id, j.status AS job_status,
           j.attempts, j.error_message AS job_error,
           j.started_at, j.completed_at
    FROM copilot.docs d
    LEFT JOIN copilot.doc_ingestion_jobs j
      ON j.doc_id = d.id AND j.status IN ('queued','processing','completed','failed')
    WHERE d.id = $1 AND d.tenant_id = $2 AND d.deleted_at IS NULL
    ORDER BY j.created_at DESC
    LIMIT 1
  `;
  const { rows } = await postgresPool.query(sql, [docId, tenantId]);
  return rows[0] || null;
}

/**
 * Soft-delete a document (cascades chunks + embeddings via FK ON DELETE CASCADE).
 */
async function deleteDoc({ tenantId, docId }) {
  const { rows } = await postgresPool.query(
    `UPDATE copilot.docs SET deleted_at = now(), updated_at = now()
     WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
     RETURNING id`,
    [docId, tenantId]
  );
  return rows[0] || null;
}

/**
 * Get chunks for a document (used for audit/debug).
 */
async function getDocChunks({ tenantId, docId, limit = 100 }) {
  const { rows } = await postgresPool.query(
    `SELECT chunk_index, chunk_text, token_count, chunk_hash
     FROM copilot.doc_chunks
     WHERE doc_id = $1 AND tenant_id = $2
     ORDER BY chunk_index
     LIMIT $3`,
    [docId, tenantId, limit]
  );
  return rows;
}

module.exports = {
  ingestDocument,
  registerDoc,
  writeChunks,
  queueEmbeddingJob,
  listDocs,
  getDoc,
  deleteDoc,
  getDocChunks,
  chunkText,
  contentHash,
};
