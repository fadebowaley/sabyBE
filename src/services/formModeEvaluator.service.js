const FORM_MODES = new Set([
  'universal',
  'lead_qualification',
  'knowledge_quiz',
  'match_quiz',
]);

const asNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const asStringList = (value) => {
  if (Array.isArray(value)) return value.map((entry) => String(entry)).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const parseJsonObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
};

const getModeSettings = (projectForm) =>
  projectForm?.metadata?.moduleStudio?.document?.settings || {};

const getModeNodes = (projectForm) =>
  (Array.isArray(projectForm?.elements) ? projectForm.elements : []).filter(
    (element) => !['welcome_screen', 'end_screen', 'statement'].includes(String(element?.type || ''))
  );

const resolveAnswer = (submissionData, node) => {
  const candidates = [node?.id, node?.properties?.fieldKey, node?.properties?.label]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const key = Object.keys(submissionData || {}).find((answerKey) =>
    candidates.includes(String(answerKey).trim().toLowerCase())
  );
  return key ? submissionData[key] : undefined;
};

const sanitizeProctoringMetadata = (
  value,
  { submittedAt = new Date().toISOString(), maxWarnings = 3 } = {}
) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const events = Array.isArray(value.events)
    ? value.events.slice(0, 500).map((event) => ({
        type: String(event?.type || 'unknown').slice(0, 80),
        occurredAt: Number.isNaN(Date.parse(event?.occurredAt))
          ? submittedAt
          : new Date(event.occurredAt).toISOString(),
        questionId: event?.questionId ? String(event.questionId).slice(0, 160) : null,
        stepIndex: Number.isInteger(Number(event?.stepIndex)) ? Number(event.stepIndex) : null,
      }))
    : [];
  const questions = Array.isArray(value.questions)
    ? value.questions.slice(0, 500).map((question) => ({
        questionId: String(question?.questionId || '').slice(0, 160),
        questionNumber: Math.max(1, Number(question?.questionNumber) || 1),
        shownAt: Number.isNaN(Date.parse(question?.shownAt))
          ? submittedAt
          : new Date(question.shownAt).toISOString(),
        answeredAt: Number.isNaN(Date.parse(question?.answeredAt))
          ? null
          : new Date(question.answeredAt).toISOString(),
        timeSpentMs: Math.max(0, Math.min(86_400_000, Number(question?.timeSpentMs) || 0)),
        answerChangedCount: Math.max(0, Math.min(100, Number(question?.answerChangedCount) || 0)),
        integrityEventsBeforeAnswer: Math.max(
          0,
          Math.min(500, Number(question?.integrityEventsBeforeAnswer) || 0)
        ),
      })).filter((question) => question.questionId)
    : [];
  const warningTypes = new Set([
    'visibility_hidden',
    'window_blurred',
    'paste_attempt',
    'copy_attempt',
  ]);
  const warningCount = events.filter((event) => warningTypes.has(event.type)).length;
  const warningLimit = Math.max(1, Number(maxWarnings) || 3);
  const timedOut = events.some((event) => event.type === 'time_limit_reached');
  const summary = {
    tabSwitchCount: events.filter((event) => event.type === 'visibility_hidden').length,
    windowBlurCount: events.filter((event) => event.type === 'window_blurred').length,
    copyPasteAttemptCount: events.filter((event) => ['copy_attempt', 'paste_attempt'].includes(event.type)).length,
    questionCount: questions.length,
  };
  return {
    sessionId: String(value.sessionId || '').slice(0, 160) || null,
    mode: ['basic', 'strict'].includes(String(value.mode)) ? String(value.mode) : 'basic',
    status: timedOut
      ? 'timed_out'
      : warningCount >= warningLimit
        ? 'blocked'
        : warningCount
          ? 'review_required'
          : 'clean',
    startedAt: Number.isNaN(Date.parse(value.startedAt))
      ? submittedAt
      : new Date(value.startedAt).toISOString(),
    submittedAt: Number.isNaN(Date.parse(value.submittedAt))
      ? submittedAt
      : new Date(value.submittedAt).toISOString(),
    timeLimitSeconds: Math.max(
      0,
      Math.min(86_400, Number(value.timeLimitSeconds) || 0)
    ) || null,
    timeRemainingSeconds:
      value.timeRemainingSeconds === null || value.timeRemainingSeconds === undefined
        ? null
        : Math.max(0, Math.min(86_400, Number(value.timeRemainingSeconds) || 0)),
    timedOut,
    warningCount,
    eventCount: events.length,
    events,
    questions,
    summary,
  };
};

const evaluateFormMode = ({ projectForm, submissionData = {} }) => {
  const settings = getModeSettings(projectForm);
  const mode = FORM_MODES.has(String(settings.formMode || '').trim())
    ? String(settings.formMode).trim()
    : 'universal';
  if (mode === 'universal') return null;

  const nodes = getModeNodes(projectForm);
  if (mode === 'lead_qualification') {
    const score = nodes.reduce((total, node) => {
      const answer = asStringList(resolveAnswer(submissionData, node));
      const answerScores = parseJsonObject(node.properties?.leadScores);
      if (answer.length && Object.keys(answerScores).length) {
        return total + answer.reduce((sum, entry) => sum + asNumber(answerScores[entry]), 0);
      }
      return total + (answer.length ? asNumber(node.properties?.leadScore) : 0);
    }, 0);
    const defaultBands = [
      { label: 'Hot lead', minScore: 80 },
      { label: 'Warm lead', minScore: 40 },
      { label: 'Cold lead', minScore: 0 },
    ];
    const bands = Array.isArray(settings.formModeConfig?.lead?.bands)
      ? settings.formModeConfig.lead.bands
      : defaultBands;
    const band = [...bands]
      .filter((entry) => entry && String(entry.label || '').trim())
      .sort((left, right) => asNumber(right.minScore) - asNumber(left.minScore))
      .find((entry) => score >= asNumber(entry.minScore));
    return {
      mode,
      score,
      ...(band ? { band: String(band.label).trim() } : {}),
    };
  }

  if (mode === 'knowledge_quiz') {
    let score = 0;
    let maxScore = 0;
    const missedQuestionIds = [];
    const questionResults = [];
    nodes.forEach((node) => {
      const correct = asStringList(node.properties?.correctAnswer);
      if (!correct.length) return;
      const points = Math.max(0, asNumber(node.properties?.quizPoints, 1));
      const answer = asStringList(resolveAnswer(submissionData, node));
      maxScore += points;
      const isCorrect = answer.length === correct.length && answer.every((entry) => correct.includes(entry));
      if (isCorrect) score += points;
      else missedQuestionIds.push(node.id);
      questionResults.push({
        questionId: node.id,
        correct: isCorrect,
        pointsAwarded: isCorrect ? points : 0,
        pointsAvailable: points,
      });
    });
    const percentage = maxScore ? Math.round((score / maxScore) * 10000) / 100 : 0;
    const passMark = Math.min(100, Math.max(0, asNumber(settings.formModeConfig?.quiz?.passMark, 50)));
    return {
      mode,
      score,
      maxScore,
      percentage,
      passed: percentage >= passMark,
      missedQuestionIds,
      questionResults,
    };
  }

  const categoryScores = {};
  nodes.forEach((node) => {
    const selected = asStringList(resolveAnswer(submissionData, node));
    const weights = parseJsonObject(node.properties?.matchWeights);
    selected.forEach((answer) => {
      const answerWeights = parseJsonObject(weights[answer]);
      Object.entries(answerWeights).forEach(([category, value]) => {
        categoryScores[category] = (categoryScores[category] || 0) + asNumber(value);
      });
    });
  });
  const ordered = Object.entries(categoryScores).sort(
    ([leftCategory, leftScore], [rightCategory, rightScore]) =>
      rightScore - leftScore || leftCategory.localeCompare(rightCategory)
  );
  const match = ordered[0]?.[0] || settings.formModeConfig?.match?.tieResult || null;
  const totalScore = Object.values(categoryScores).reduce((sum, score) => sum + score, 0);
  return { mode, match, categoryScores, totalScore };
};

module.exports = { evaluateFormMode, sanitizeProctoringMetadata };
