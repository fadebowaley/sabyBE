const {
  evaluateFormMode,
  sanitizeProctoringMetadata,
} = require('../services/formModeEvaluator.service');

const projectForm = (formMode, formModeConfig, elements) => ({
  metadata: {
    moduleStudio: {
      document: {
        settings: { formMode, formModeConfig },
      },
    },
  },
  elements,
});

describe('formModeEvaluator.service', () => {
  test('returns no result for Universal mode', () => {
    expect(
      evaluateFormMode({
        projectForm: projectForm('universal', {}, [{ id: 'q1', type: 'text', properties: {} }]),
        submissionData: { q1: 'answer' },
      })
    ).toBeNull();
  });

  test('calculates lead answer scores and selects a band', () => {
    const form = projectForm(
      'lead_qualification',
      { lead: { bands: [{ label: 'Hot', minScore: 10 }, { label: 'Cold', minScore: 0 }] } },
      [{ id: 'q1', type: 'dropdown', properties: { leadScores: '{"yes": 12}' } }]
    );
    expect(evaluateFormMode({ projectForm: form, submissionData: { q1: 'yes' } })).toEqual({
      mode: 'lead_qualification',
      score: 12,
      band: 'Hot',
    });
  });

  test('calculates quiz percentage and missed questions', () => {
    const form = projectForm(
      'knowledge_quiz',
      { quiz: { passMark: 50 } },
      [
        { id: 'q1', type: 'radio', properties: { correctAnswer: 'A', quizPoints: 2 } },
        { id: 'q2', type: 'radio', properties: { correctAnswer: 'B', quizPoints: 2 } },
      ]
    );
    expect(evaluateFormMode({ projectForm: form, submissionData: { q1: 'A', q2: 'C' } })).toEqual({
      mode: 'knowledge_quiz',
      score: 2,
      maxScore: 4,
      percentage: 50,
      passed: true,
      missedQuestionIds: ['q2'],
      questionResults: [
        { questionId: 'q1', correct: true, pointsAwarded: 2, pointsAvailable: 2 },
        { questionId: 'q2', correct: false, pointsAwarded: 0, pointsAvailable: 2 },
      ],
    });
  });

  test('calculates match category and resolves ties deterministically', () => {
    const form = projectForm(
      'match_quiz',
      { match: { tieResult: 'General' } },
      [
        {
          id: 'q1',
          type: 'radio',
          properties: { matchWeights: '{"A":{"Alpha":1},"B":{"Beta":1}}' },
        },
      ]
    );
    expect(evaluateFormMode({ projectForm: form, submissionData: { q1: 'B' } })).toEqual({
      mode: 'match_quiz',
      match: 'Beta',
      categoryScores: { Beta: 1 },
      totalScore: 1,
    });
  });

  test('ignores client result data because it is not an evaluator input', () => {
    const form = projectForm(
      'knowledge_quiz',
      { quiz: { passMark: 80 } },
      [{ id: 'q1', type: 'radio', properties: { correctAnswer: 'A', quizPoints: 1 } }]
    );
    expect(
      evaluateFormMode({
        projectForm: form,
        submissionData: { q1: 'B', modeResult: { passed: true, percentage: 100 } },
      })
    ).toMatchObject({ percentage: 0, passed: false, missedQuestionIds: ['q1'] });
  });

  test('derives blocked proctoring status from validated warning events', () => {
    const result = sanitizeProctoringMetadata(
      {
        status: 'clean',
        warningCount: 0,
        events: [
          { type: 'paste_attempt', occurredAt: '2026-08-21T10:00:00Z' },
          { type: 'window_blurred', occurredAt: '2026-08-21T10:01:00Z' },
        ],
      },
      { maxWarnings: 2 }
    );
    expect(result.status).toBe('blocked');
    expect(result.warningCount).toBe(2);
  });
});
