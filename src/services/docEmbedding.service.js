'use strict';

/**
 * Document Embedding Service — Phase 6 RAG
 *
 * Generates vector embeddings for document chunks using OpenAI's
 * text-embedding-3-small model (1536 dimensions, $0.000020/1k tokens).
 *
 * Architecture note: the backend calls the OpenAI Embeddings API directly
 * here — this is NOT a generative call and carries no hallucination risk,
 * so it does not need to route through saby-copilot. The embedding API is
 * a pure numeric transformation. Cost is logged to model_usage_logs.
 *
 * Each chunk is embedded individually to allow partial re-indexing without
 * reprocessing the entire document.
 */

const https              = require('https');
const { postgresPool }   = require('../config/postgres');
const logger             = require('../config/logger');

const EMBEDDING_MODEL    = 'text-embedding-3-small';
const EMBEDDING_DIM      = 1536;
const OPENAI_API_KEY     = process.env.OPENAI_API_KEY;
const OPENAI_EMBED_URL   = 'https://api.openai.com/v1/embeddings';

// ─── OpenAI embedding call ────────────────────────────────────────────────────

/**
 * Call the OpenAI Embeddings API for a batch of texts.
 * Returns the embedding vectors in the same order as the input.
 *
 * @param {string[]} texts
 * @returns {Promise<{embeddings: number[][], usage: {prompt_tokens: number}}>}
 */
async function callEmbeddingApi(texts) {
  if (!OPENAI_API_KEY) {
    throw Object.assign(
      new Error('OPENAI_API_KEY is not configured — embedding generation unavailable'),
      { code: 'EMBEDDING_UNCONFIGURED' }
    );
  }

  const body = JSON.stringify({ model: EMBEDDING_MODEL, input: texts });

  return new Promise((resolve, reject) => {
    const req = https.request(
      OPENAI_EMBED_URL,
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', d => { raw += d; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              return reject(Object.assign(new Error(parsed.error.message), { code: 'OPENAI_API_ERROR' }));
            }
            const embeddings = parsed.data.map(d => d.embedding);
            resolve({ embeddings, usage: parsed.usage });
          } catch (e) {
            reject(Object.assign(new Error('Invalid JSON from OpenAI embedding API'), { code: 'PARSE_ERROR' }));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Storage ──────────────────────────────────────────────────────────────────

/**
 * Store a single embedding vector for a chunk.
 * Upserts on chunk_id so re-indexing is safe.
 */
async function saveEmbedding({ chunkId, tenantId, embeddingVector }) {
  if (embeddingVector.length !== EMBEDDING_DIM) {
    throw new Error(`Expected ${EMBEDDING_DIM}-dim vector, got ${embeddingVector.length}`);
  }

  const vectorLiteral = `[${embeddingVector.join(',')}]`;

  await postgresPool.query(
    `INSERT INTO copilot.doc_embeddings
       (chunk_id, tenant_id, embedding_model, embedding_dim, embedding)
     VALUES ($1, $2, $3, $4, $5::vector)
     ON CONFLICT (chunk_id) DO UPDATE
       SET embedding       = EXCLUDED.embedding,
           embedding_model = EXCLUDED.embedding_model,
           embedding_dim   = EXCLUDED.embedding_dim`,
    [chunkId, tenantId, EMBEDDING_MODEL, EMBEDDING_DIM, vectorLiteral]
  );
}

// ─── Cost logging ─────────────────────────────────────────────────────────────

async function logEmbeddingCost({ tenantId, docId, promptTokens, chunkCount }) {
  const COST_PER_1K = 0.00002;
  const estimatedCost = (promptTokens / 1000) * COST_PER_1K;

  try {
    await postgresPool.query(
      `INSERT INTO copilot.model_usage_logs
         (actor_id, tenant_id, turn_trace_id, stage, provider, model_name,
          invocation_status, input_tokens, output_tokens, total_tokens,
          estimated_cost_usd, metadata)
       VALUES ('system', $1, $2, 'embedding', 'openai', $3,
               'success', $4, 0, $4, $5, $6)`,
      [
        tenantId,
        `embed-${docId}`,
        EMBEDDING_MODEL,
        promptTokens,
        estimatedCost,
        JSON.stringify({ docId, chunkCount }),
      ]
    );
  } catch (err) {
    logger.warn('[DocEmbedding] Cost log failed (non-fatal)', { err: err.message });
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Embed all chunks for a document and store the vectors.
 * Called by the docIngestion worker after chunking is complete.
 *
 * @param {object} opts
 * @param {string} opts.docId
 * @param {string} opts.tenantId
 * @returns {Promise<{embeddedCount: number, totalTokens: number}>}
 */
async function embedDocumentChunks({ docId, tenantId }) {
  // Load all chunks for the document
  const { rows: chunks } = await postgresPool.query(
    `SELECT id, chunk_text, chunk_index
     FROM copilot.doc_chunks
     WHERE doc_id = $1 AND tenant_id = $2
     ORDER BY chunk_index`,
    [docId, tenantId]
  );

  if (!chunks.length) {
    throw Object.assign(
      new Error(`No chunks found for doc ${docId} — run chunking first`),
      { code: 'NO_CHUNKS' }
    );
  }

  // Embed in batches of 100 (OpenAI limit is higher, but 100 keeps latency manageable)
  const BATCH_SIZE = 100;
  let totalTokens  = 0;
  let embeddedCount = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch  = chunks.slice(i, i + BATCH_SIZE);
    const texts  = batch.map(c => c.chunk_text);

    const { embeddings, usage } = await callEmbeddingApi(texts);
    totalTokens += usage.prompt_tokens;

    for (let j = 0; j < batch.length; j++) {
      await saveEmbedding({
        chunkId:         batch[j].id,
        tenantId,
        embeddingVector: embeddings[j],
      });
      embeddedCount++;
    }

    logger.info('[DocEmbedding] Batch embedded', {
      docId, tenantId,
      batchStart: i, batchSize: batch.length, totalTokens,
    });
  }

  await logEmbeddingCost({ tenantId, docId, promptTokens: totalTokens, chunkCount: embeddedCount });

  // Mark doc as indexed
  await postgresPool.query(
    `UPDATE copilot.docs SET ingestion_status = 'indexed', updated_at = now() WHERE id = $1`,
    [docId]
  );

  logger.info('[DocEmbedding] Document fully embedded', { docId, tenantId, embeddedCount, totalTokens });
  return { embeddedCount, totalTokens };
}

/**
 * Embed a single query string (used by the retriever at search time).
 * Returns the raw embedding vector.
 */
async function embedQuery(queryText) {
  const { embeddings } = await callEmbeddingApi([queryText]);
  return embeddings[0];
}

module.exports = {
  embedDocumentChunks,
  embedQuery,
  callEmbeddingApi,
  saveEmbedding,
};
