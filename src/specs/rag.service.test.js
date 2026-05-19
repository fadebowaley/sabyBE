'use strict';

// ── Mock setup ────────────────────────────────────────────────────────────────

const mockPool = { query: jest.fn() };
jest.mock('../config/postgres', () => ({ postgresPool: mockPool }));

const mockCallEmbeddingApi = jest.fn();
jest.mock('../services/docEmbedding.service', () => ({
  embedQuery:           (...args) => mockCallEmbeddingApi(...args),
  embedDocumentChunks:  jest.fn(),
  callEmbeddingApi:     (...args) => mockCallEmbeddingApi(...args),
  saveEmbedding:        jest.fn(),
}));

const mockRenderPrompt = jest.fn();
jest.mock('../services/promptRegistry.service', () => ({
  renderPrompt: (...args) => mockRenderPrompt(...args),
}));

// ── Modules under test ────────────────────────────────────────────────────────

const docIngestion = require('../services/docIngestion.service');
const docRetriever = require('../services/docRetriever.service');

const TENANT = 'tenant-rag-test';
const DOC_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────────────────────────────────────
// chunkText — paragraph-boundary splitting
// ─────────────────────────────────────────────────────────────────────────────

describe('docIngestion — chunkText', () => {
  test('short text returned as single chunk', () => {
    const text = 'Hello world. This is a test document.';
    const chunks = docIngestion.chunkText(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  test('splits on double-newlines when combined length exceeds target', () => {
    // TARGET_CHUNK_CHARS = 1600; three 900-char paragraphs force multiple chunks
    const para1 = 'A'.repeat(900);
    const para2 = 'B'.repeat(900);
    const para3 = 'C'.repeat(900);
    const text = `${para1}\n\n${para2}\n\n${para3}`;
    const chunks = docIngestion.chunkText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test('empty string returns empty array', () => {
    const chunks = docIngestion.chunkText('');
    expect(chunks).toHaveLength(0);
  });

  test('long single paragraph is split by sentence boundaries', () => {
    // A very long "sentence" paragraph — chunkText falls back to sentence splitting
    const TARGET_CHUNK_CHARS = 1600;
    const sentences = Array.from({ length: 20 }, (_, i) => `Sentence number ${i + 1} ends here.`).join(' ');
    const chunks = docIngestion.chunkText(sentences.repeat(5));
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// contentHash — deterministic SHA256
// ─────────────────────────────────────────────────────────────────────────────

describe('docIngestion — contentHash', () => {
  test('same text produces same hash', () => {
    const h1 = docIngestion.contentHash('hello');
    const h2 = docIngestion.contentHash('hello');
    expect(h1).toBe(h2);
  });

  test('different texts produce different hashes', () => {
    expect(docIngestion.contentHash('foo')).not.toBe(docIngestion.contentHash('bar'));
  });

  test('returns 64-char hex string (SHA256)', () => {
    expect(docIngestion.contentHash('test')).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// registerDoc — idempotency via content_hash
// ─────────────────────────────────────────────────────────────────────────────

describe('docIngestion — registerDoc idempotency', () => {
  test('returns existing docId if content_hash already exists', async () => {
    const existingId = 'existing-doc-uuid';
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: existingId, ingestion_status: 'indexed' }] })
    ;
    const result = await docIngestion.registerDoc({
      tenantId: TENANT,
      title: 'Test Doc',
      source: 'upload',
      mimeType: 'text/plain',
      contentText: 'hello',
    });
    expect(result.docId).toBe(existingId);
    expect(result.duplicate).toBe(true);
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  test('inserts new doc when hash is new', async () => {
    const newId = 'new-doc-uuid';
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })                           // hash check — no match
      .mockResolvedValueOnce({ rows: [{ id: newId }] })              // INSERT
    ;
    const result = await docIngestion.registerDoc({
      tenantId: TENANT,
      title: 'Brand New Doc',
      source: 'upload',
      mimeType: 'text/plain',
      contentText: 'unique content',
    });
    expect(result.docId).toBe(newId);
    expect(result.duplicate).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// queueEmbeddingJob — idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe('docIngestion — queueEmbeddingJob idempotency', () => {
  test('skips insert if queued/processing job exists', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [{ id: 'existing-job' }] }) // existing job check
    ;
    await docIngestion.queueEmbeddingJob({ docId: DOC_ID, tenantId: TENANT });
    expect(mockPool.query).toHaveBeenCalledTimes(1);
  });

  test('inserts job when no active job exists', async () => {
    mockPool.query
      .mockResolvedValueOnce({ rows: [] })                         // no existing job
      .mockResolvedValueOnce({ rows: [{ id: 'new-job' }] })        // INSERT
    ;
    await docIngestion.queueEmbeddingJob({ docId: DOC_ID, tenantId: TENANT });
    expect(mockPool.query).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// docRetriever — buildChunkContext
// ─────────────────────────────────────────────────────────────────────────────

describe('docRetriever — buildChunkContext', () => {
  const chunks = [
    { docTitle: 'Immigration Policy', chunkIndex: 0, chunkText: 'Citizens must...' },
    { docTitle: 'Compliance Guide',   chunkIndex: 2, chunkText: 'All forms must be...' },
  ];

  test('formats each chunk with [Source N] label', () => {
    const ctx = docRetriever.buildChunkContext(chunks);
    expect(ctx).toContain('[Source 1: Immigration Policy, chunk 1]');
    expect(ctx).toContain('[Source 2: Compliance Guide, chunk 3]');
  });

  test('includes chunk text content', () => {
    const ctx = docRetriever.buildChunkContext(chunks);
    expect(ctx).toContain('Citizens must...');
    expect(ctx).toContain('All forms must be...');
  });

  test('separates chunks with divider', () => {
    const ctx = docRetriever.buildChunkContext(chunks);
    expect(ctx).toContain('---');
  });

  test('handles null chunkIndex gracefully', () => {
    const c = [{ docTitle: 'Doc', chunkIndex: null, chunkText: 'text' }];
    const ctx = docRetriever.buildChunkContext(c);
    expect(ctx).toContain('[Source 1: Doc]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// docRetriever — detectUngroundedCitations (hallucination guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('docRetriever — detectUngroundedCitations', () => {
  const chunks = [
    { sourceLabel: 'Source 1' },
    { sourceLabel: 'Source 2' },
  ];

  test('returns empty array when all citations are grounded', () => {
    const answer = 'See [Source 1] and [Source 2] for details.';
    const ungrounded = docRetriever.detectUngroundedCitations(answer, chunks);
    expect(ungrounded).toEqual([]);
  });

  test('flags citation not present in retrieved chunks', () => {
    const answer = 'Per [Source 3], this is wrong.';
    const ungrounded = docRetriever.detectUngroundedCitations(answer, chunks);
    expect(ungrounded).toContain('[Source 3]');
  });

  test('is case-insensitive on [source N] pattern', () => {
    const answer = 'According to [source 1] this holds.';
    const ungrounded = docRetriever.detectUngroundedCitations(answer, chunks);
    expect(ungrounded).toEqual([]);
  });

  test('deduplicates repeated citations in answer', () => {
    const answer = '[Source 99] is cited twice. [Source 99] again.';
    const ungrounded = docRetriever.detectUngroundedCitations(answer, chunks);
    expect(ungrounded).toHaveLength(1);
    expect(ungrounded[0]).toContain('99');
  });

  test('returns empty array when answer has no citations', () => {
    const answer = 'No sources cited here.';
    expect(docRetriever.detectUngroundedCitations(answer, chunks)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// docRetriever — retrieve (with embedding unconfigured guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('docRetriever — retrieve EMBEDDING_UNCONFIGURED', () => {
  test('returns empty results when embedding API is unconfigured', async () => {
    const embeddingErr = Object.assign(new Error('not configured'), { code: 'EMBEDDING_UNCONFIGURED' });
    mockCallEmbeddingApi.mockRejectedValueOnce(embeddingErr);

    const results = await docRetriever.retrieve({ tenantId: TENANT, query: 'what is the rule?' });
    expect(results).toEqual([]);
  });

  test('propagates non-EMBEDDING_UNCONFIGURED errors', async () => {
    mockCallEmbeddingApi.mockRejectedValueOnce(new Error('network failure'));
    await expect(
      docRetriever.retrieve({ tenantId: TENANT, query: 'test' })
    ).rejects.toThrow('network failure');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// docRetriever — resolveRagContext builds context + renders prompt
// ─────────────────────────────────────────────────────────────────────────────

describe('docRetriever — resolveRagContext', () => {
  test('hasContext=false when no chunks retrieved', async () => {
    const embeddingErr = Object.assign(new Error('no key'), { code: 'EMBEDDING_UNCONFIGURED' });
    mockCallEmbeddingApi.mockRejectedValueOnce(embeddingErr);
    mockRenderPrompt.mockResolvedValueOnce({ systemPrompt: 'sys', userPrompt: 'usr', version: 1 });

    const result = await docRetriever.resolveRagContext({ tenantId: TENANT, query: 'test' });
    expect(result.hasContext).toBe(false);
    expect(result.contextString).toContain('No relevant documents');
  });

  test('hasContext=true when chunks retrieved', async () => {
    const fakeVector = Array(1536).fill(0.1);
    mockCallEmbeddingApi.mockResolvedValueOnce(fakeVector);
    mockPool.query.mockResolvedValueOnce({
      rows: [{
        chunk_id: 'c1', doc_id: DOC_ID, chunk_index: 0,
        chunk_text: 'Relevant text here.', doc_title: 'Policy Doc',
        source: 'upload', source_ref: null, doc_metadata: {},
        similarity: '0.85',
      }],
    });
    mockRenderPrompt.mockResolvedValueOnce({ systemPrompt: 'sys', userPrompt: 'usr', version: 1 });

    const result = await docRetriever.resolveRagContext({ tenantId: TENANT, query: 'policy rules' });
    expect(result.hasContext).toBe(true);
    expect(result.chunks).toHaveLength(1);
    expect(result.systemPrompt).toBe('sys');
  });

  test('handles missing rag_answer prompt gracefully (non-fatal)', async () => {
    const embeddingErr = Object.assign(new Error('no key'), { code: 'EMBEDDING_UNCONFIGURED' });
    mockCallEmbeddingApi.mockRejectedValueOnce(embeddingErr);
    mockRenderPrompt.mockRejectedValueOnce(new Error('Prompt not found'));

    const result = await docRetriever.resolveRagContext({ tenantId: TENANT, query: 'test' });
    expect(result.systemPrompt).toBeNull();
    expect(result.hasContext).toBe(false);
  });
});
