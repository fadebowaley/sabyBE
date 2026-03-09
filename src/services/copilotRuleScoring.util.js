const DEFAULT_STATUS_BANDS = {
  WINNING: { min: 80 },
  NEUTRAL: { min: 60 },
  AT_RISK: { min: 40 },
  LOSING: { min: 0 },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const scoreRule = ({ direction, value, target, critical }) => {
  if (!Number.isFinite(value)) return 0;

  if (direction === 'higher_is_better') {
    if (value >= target) return 100;
    if (value <= critical) return 0;
    return clamp(((value - critical) / (target - critical)) * 100, 0, 100);
  }

  if (value <= target) return 100;
  if (value >= critical) return 0;
  return clamp(((critical - value) / (critical - target)) * 100, 0, 100);
};

const resolveStatus = (score, bands = DEFAULT_STATUS_BANDS) => {
  const ordered = ['WINNING', 'NEUTRAL', 'AT_RISK', 'LOSING'];
  for (let i = 0; i < ordered.length; i += 1) {
    const key = ordered[i];
    if (score >= Number(bands?.[key]?.min ?? DEFAULT_STATUS_BANDS[key].min)) {
      return key;
    }
  }
  return 'LOSING';
};

const evaluateVerdict = ({ direction, value, target, warning }) => {
  if (!Number.isFinite(value)) {
    return { verdict: 'fail', reason: 'No KPI value available for this metric' };
  }

  if (direction === 'higher_is_better') {
    if (value >= target) {
      return {
        verdict: 'pass',
        reason: `Value ${value.toFixed(2)} meets/exceeds target ${target.toFixed(2)}`,
      };
    }
    if (value >= warning) {
      return {
        verdict: 'warn',
        reason: `Value ${value.toFixed(2)} is below target ${target.toFixed(2)} but above warning threshold ${warning.toFixed(2)}`,
      };
    }
    return {
      verdict: 'fail',
      reason: `Value ${value.toFixed(2)} is below warning threshold ${warning.toFixed(2)}`,
    };
  }

  if (value <= target) {
    return {
      verdict: 'pass',
      reason: `Value ${value.toFixed(2)} meets target (<= ${target.toFixed(2)})`,
    };
  }
  if (value <= warning) {
    return {
      verdict: 'warn',
      reason: `Value ${value.toFixed(2)} is above target ${target.toFixed(2)} but within warning threshold ${warning.toFixed(2)}`,
    };
  }
  return {
    verdict: 'fail',
    reason: `Value ${value.toFixed(2)} exceeds warning threshold ${warning.toFixed(2)}`,
  };
};

module.exports = {
  DEFAULT_STATUS_BANDS,
  scoreRule,
  resolveStatus,
  evaluateVerdict,
};
