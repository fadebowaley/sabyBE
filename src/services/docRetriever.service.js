'use strict';

/**
 * Document Retriever Service — Phase 6 RAG
 *
 * Tenant-scoped vector similarity search using pgvector's cosine distance
 * operator (<=>). Retrieves the top-K most relevant document chunks for a
 * query, enforcing strict tenant isolation on every query.
 *
 * Also builds the citation-ready prompt context string that the intelligence
 * gateway injects into the rag_answer prompt template.
 *
 * Search flow:
 *   1. Embed the query (docEmbedding.embedQuery)
 *   2. Run cosine similarity search scoped to tenant_id
 *   3. Filter out deleted docs (access_policy enforcement)
 *   4. Return chunks with similarity score, doc title, and source metadata
 *   5. Build the [Source N] formatted context string for the prompt
 */

const { postgresPool }    = require('../config/postgres');
const { embedQuery }      = require('./docEmbedding.service');
const { renderPrompt }    = require('./promptRegistry.service');
const logger              = require('../config/logger');

const DEFAULT_TOP_K          = 5;
const SIMILARITY_THRESHOLD   = 0.30;  // cosine similarity; below this is likely noise

// ─── Core retrieval ───────────────────────────────────────────────────────────

/**
 * Retrieve the top-K most relevant chunks for a query within a tenant.
 *
 * @param {object} opts
 * @param {string}   opts.tenantId
 * @param {string}   opts.query         — natural language question
 * @param {number}  [opts.topK]         — number of chunks to return (default 5)
 * @param {string}  [opts.projectId]    — optionally scope to docs tagged to a project
 * @returns {Promise<Array<{chunkId, docId, docTitle, chunkText, chunkIndex, similarity}>>}
 */
async function retrieve({ tenantId, query, topK = DEFAULT_TOP_K, projectId }) {
  // 1. Embed the query
  let queryVector;
  try {
    queryVector = await embedQuery(query);
  } catch (err) {
    if (err.code === 'EMBEDDING_UNCONFIGURED') {
      logger.warn('[DocRetriever] Embedding API not configured, returning empty results');
      return [];
    }
    throw err;
  }

  const vectorLiteral = `[${queryVector.join(',')}]`;

  // 2. Cosine similarity search — STRICTLY scoped to tenant_id
  // The <=> operator is cosine DISTANCE (0 = identical, 2 = opposite);
  // we convert to similarity as (1 - distance).
  const conditions = [
    'de.tenant_id = $1',
    'd.deleted_at IS NULL',
    `1 - (de.embedding <=> $2::vector) >= ${SIMILARITY_THRESHOLD}`,
  ];
  const values = [tenantId, vectorLiteral];
  let paramIdx = 3;

  if (projectId) {
    conditions.push(`d.metadata->>'projectId' = $${paramIdx++}`);
    values.push(projectId);
  }

  values.push(topK);

  const sql = `
    SELECT
      dc.id              AS chunk_id,
      dc.doc_id,
      dc.chunk_index,
      dc.chunk_text,
      d.title            AS doc_title,
      d.source,
      d.source_ref,
      d.metadata         AS doc_metadata,
      1 - (de.embedding <=> $2::vector) AS similarity
    FROM copilot.doc_embeddings de
    JOIN copilot.doc_chunks     dc ON dc.id = de.chunk_id
    JOIN copilot.docs            d ON d.id  = dc.doc_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY de.embedding <=> $2::vector ASC
    LIMIT $${paramIdx}
  `;

  const { rows } = await postgresPool.query(sql, values);

  logger.info('[DocRetriever] Retrieval complete', {
    tenantId, topK, resultCount: rows.length,
    topSimilarity: rows[0] ? Number(rows[0].similarity).toFixed(3) : null,
  });

  return rows.map((r, i) => ({
    sourceLabel:  `Source ${i + 1}`,
    chunkId:      r.chunk_id,
    docId:        r.doc_id,
    docTitle:     r.doc_title,
    chunkIndex:   r.chunk_index,
    chunkText:    r.chunk_text,
    similarity:   Number(r.similarity),
    source:       r.source,
    sourceRef:    r.source_ref,
  }));
}

// ─── Prompt context builder ───────────────────────────────────────────────────

/**
 * Format retrieved chunks as a numbered [Source N] context string ready for
 * injection into the rag_answer prompt template.
 *
 * @param {Array} chunks — result of retrieve()
 * @returns {string}
 */
function buildChunkContext(chunks) {
  return chunks
    .map((c, i) =>
      `[Source ${i + 1}: ${c.docTitle}${c.chunkIndex != null ? `, chunk ${c.chunkIndex + 1}` : ''}]\n${c.chunkText}`
    )
    .join('\n\n---\n\n');
}

/**
 * Hallucination guard: check that every [Source N] cited in the answer text
 * actually appears in the retrieved chunks list. Returns cited sources that
 * are NOT grounded in retrieved content.
 *
 * @param {string} answerText
 * @param {Array}  chunks     — retrieved chunks with sourceLabel
 * @returns {string[]}        — list of ungrounded citation labels (empty = clean)
 */
function detectUngroundedCitations(answerText, chunks) {
  // validLabels are stored without brackets, e.g. "Source 1"
  const validLabels = new Set(chunks.map(c => c.sourceLabel.toLowerCase()));
  const cited = [...answerText.matchAll(/\[Source\s+\d+\]/gi)].map(m => m[0].trim());
  const uniqueCited = [...new Set(cited)];

  return uniqueCited.filter(label => {
    // Strip brackets and normalise whitespace/case before comparing
    const normalised = label.replace(/[\[\]]/g, '').replace(/\s+/g, ' ').toLowerCase();
    return !validLabels.has(normalised);
  });
}

/**
 * Full RAG context resolution:
 *   1. Retrieve relevant chunks
 *   2. Build formatted context string
 *   3. Render rag_answer prompt with question + context
 *   4. Return everything the caller needs to run the LLM call
 *
 * @param {object} opts
 * @param {string}  opts.tenantId
 * @param {string}  opts.query
 * @param {number} [opts.topK]
 * @param {string} [opts.projectId]
 * @returns {Promise<{
 *   chunks: Array,
 *   contextString: string,
 *   systemPrompt: string,
 *   userPrompt: string,
 *   promptVersion: number,
 *   hasContext: boolean,
 * }>}
 */
async function resolveRagContext({ tenantId, query, topK, projectId }) {
  const chunks = await retrieve({ tenantId, query, topK, projectId });
  const hasContext = chunks.length > 0;

  const contextString = hasContext
    ? buildChunkContext(chunks)
    : 'No relevant documents found in the knowledge base.';

  let systemPrompt = null;
  let userPrompt   = null;
  let promptVersion = null;

  try {
    const rendered = await renderPrompt('rag_answer', {
      question: query,
      chunks:   contextString,
    });
    systemPrompt  = rendered.systemPrompt;
    userPrompt    = rendered.userPrompt;
    promptVersion = rendered.version;
  } catch (err) {
    logger.warn('[DocRetriever] rag_answer prompt not found, returning raw context only', { err: err.message });
  }

  return {
    chunks,
    contextString,
    systemPrompt,
    userPrompt,
    promptVersion,
    hasContext,
  };
}

/**
 * Log a retrieval event to entity_resolution_logs for observability.
 */
async function logRetrieval({ tenantId, query, resultCount, topSimilarity }) {
  try {
    await postgresPool.query(
      `INSERT INTO copilot.entity_resolution_logs
         (tenant_id, entity_type, query, result_count, metadata)
       VALUES ($1, 'doc_chunk', $2, $3, $4)`,
      [tenantId, query, resultCount, JSON.stringify({ topSimilarity })]
    );
  } catch (_) { /* observability — never fail the caller */ }
}

module.exports = {
  retrieve,
  resolveRagContext,
  buildChunkContext,
  detectUngroundedCitations,
};
