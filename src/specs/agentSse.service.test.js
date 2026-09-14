const agentSse = require('../services/agentSse.service');

describe('agentSse.service', () => {
  describe('translateEngineEvent', () => {
    test('returns null for non-objects', () => {
      expect(agentSse.translateEngineEvent(undefined)).toBeNull();
      expect(agentSse.translateEngineEvent('nope')).toBeNull();
    });

    test('maps error events to error frames', () => {
      const frame = agentSse.translateEngineEvent({
        type: 'session.next.retry_error',
        data: { error: { message: 'provider exploded' } },
      });
      expect(frame).toEqual({ type: 'error', error: 'provider exploded' });
    });

    test('maps an event with a usage summary to a done frame', () => {
      const frame = agentSse.translateEngineEvent({
        type: 'session.message.completed',
        data: { usage: { inputTokens: 100, outputTokens: 42, model: 'gpt-4o' } },
      });
      expect(frame.type).toBe('done');
      expect(frame.usage).toEqual({
        inputTokens: 100,
        outputTokens: 42,
        model: 'gpt-4o',
        toolCalls: 0,
        subagentCalls: 0,
        retries: 0,
      });
    });

    test('maps terminal event types without usage to a done frame', () => {
      const frame = agentSse.translateEngineEvent({
        type: 'session.next.prompted_done',
        data: {},
      });
      expect(frame.type).toBe('done');
    });

    test('maps assistant text to token frames', () => {
      const frame = agentSse.translateEngineEvent({
        type: 'session.message',
        data: { message: { parts: [{ type: 'text', text: 'Hello' }] } },
      });
      expect(frame).toEqual({ type: 'token', token: 'Hello', sessionId: null });
    });

    test('maps data-level text content directly', () => {
      const frame = agentSse.translateEngineEvent({
        type: 'provider.event',
        data: { text: 'hi there' },
      });
      expect(frame.type).toBe('token');
      expect(frame.token).toBe('hi there');
    });

    test('maps tool/permission events to progress (tools) frames', () => {
      const frame = agentSse.translateEngineEvent({
        type: 'session.permission.create',
        data: { permission: { id: 'p-1' } },
      });
      expect(frame).toEqual({ type: 'progress', stage: 'tools' });
    });

    test('maps anything else to a progress frame', () => {
      const frame = agentSse.translateEngineEvent({
        type: 'session.plan.update',
        data: { plan: [] },
      });
      expect(frame.type).toBe('progress');
      expect(frame.detail.engineType).toBe('session.plan.update');
    });
  });

  describe('extractText / extractUsage', () => {
    test('extracts text from message parts in order', () => {
      expect(
        agentSse.extractText({
          data: { message: { parts: [{ text: 'a' }, { text: 'bc' }] } },
        })
      ).toBe('abc');
    });

    test('returns null when no text is present', () => {
      expect(agentSse.extractText({ data: { tool: 'x' } })).toBeNull();
    });

    test('extracts usage from nested summary', () => {
      expect(agentSse.extractUsage({ data: { summary: { input: 5, output: 7 } } })).toEqual({
        inputTokens: 5,
        outputTokens: 7,
        model: null,
        toolCalls: 0,
        subagentCalls: 0,
        retries: 0,
      });
    });
  });

  describe('writeSse', () => {
    test('writes event + data frames for known protocol types', () => {
      const chunks = [];
      const res = { write: (value) => chunks.push(value) };
      agentSse.writeSse(res, { type: 'token', token: 'Hi' });
      expect(chunks.join('')).toContain('event: token');
      expect(chunks.join('')).toContain('data: {"type":"token","token":"Hi"}');
    });

    test('ignores frames outside the protocol', () => {
      const chunks = [];
      const res = { write: (value) => chunks.push(value) };
      agentSse.writeSse(res, { type: 'bogus' });
      expect(chunks).toHaveLength(0);
    });
  });

  describe('startKeepAlive', () => {
    test('pings on interval and stops on dispose', () => {
      jest.useFakeTimers();
      const chunks = [];
      const res = { write: (value) => chunks.push(value) };
      const stop = agentSse.startKeepAlive(res, 5000);
      jest.advanceTimersByTime(10000);
      expect(chunks.join('')).toContain(': ping');
      stop();
      jest.advanceTimersByTime(10000);
      const pings = chunks.filter((c) => c.includes(': ping')).length;
      expect(pings).toBe(2);
      jest.useRealTimers();
    });
  });
});