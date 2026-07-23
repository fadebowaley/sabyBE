const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

const MAX_BACKDATE_DAYS_WITHOUT_OVERRIDE = 7;

const formatMonth = (date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const getCalendarForMonth = async ({ tenantId, projectId, month }) => {
  const { rows } = await postgresPool.query(
    `
      SELECT *
      FROM event_calendar
      WHERE tenant_id = $1
        AND project_id = $2
        AND month = $3
      ORDER BY event_type
    `,
    [tenantId, projectId, month]
  );

  if (!rows.length) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'No calendar configured for this month'
    );
  }

  return rows;
};

const getTrackingRecord = async ({ tenantId, projectId, nodeId, month }) => {
  const { rows } = await postgresPool.query(
    `
      SELECT *
      FROM event_compliance_tracking
      WHERE tenant_id = $1
        AND project_id = $2
        AND node_id IS NOT DISTINCT FROM $3
        AND month = $4
      LIMIT 1
    `,
    [tenantId, projectId, nodeId, month]
  );
  return rows[0] || null;
};

const countSubmissionsForDate = async ({
  tenantId,
  projectId,
  nodeId,
  submissionDate,
}) => {
  const { rows } = await postgresPool.query(
    `
      SELECT submitted_count AS count
      FROM event_compliance_daily_tracking
      WHERE tenant_id = $1
        AND project_id = $2
        AND node_id IS NOT DISTINCT FROM $3
        AND event_date = $4
      LIMIT 1
    `,
    [tenantId, projectId, nodeId, submissionDate]
  );
  return Number(rows[0]?.count || 0);
};

const findCalendarSlot = (calendarRows, submissionDate) => {
  for (const row of calendarRows) {
    const daily = row.daily_config || {};
    if (Array.isArray(daily.dates) && daily.dates.includes(submissionDate)) {
      return {
        row,
        totalSlots: daily.frequency_per_day || daily.count || 1,
      };
    }

    const weekly = row.weekly_config || {};
    if (Array.isArray(weekly.days)) {
      for (const day of weekly.days) {
        if (Array.isArray(day.dates) && day.dates.includes(submissionDate)) {
          return {
            row,
            totalSlots:
              day.submission_limit_per_date ||
              day.frequency_per_day ||
              day.count ||
              1,
          };
        }
      }
    }

    const monthly = row.monthly_config || {};
    if (Array.isArray(monthly.dates) && monthly.dates.includes(submissionDate)) {
      return {
        row,
        totalSlots:
          monthly.submission_limit_per_date || monthly.frequency_per_day || 1,
      };
    }
  }
  return null;
};

const validateSubmissionDate = async ({
  tenantId,
  projectId,
  nodeId,
  month,
  submissionDate,
  allowBackdating = false,
}) => {
  const calendarRows = await getCalendarForMonth({
    tenantId,
    projectId,
    month,
  });
  const tracking = await getTrackingRecord({
    tenantId,
    projectId,
    nodeId,
    month,
  });

  if (tracking?.is_locked) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'This month is locked; no further submissions allowed'
    );
  }

  const slot = findCalendarSlot(calendarRows, submissionDate);

  if (!slot) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'Date is not configured in the calendar'
    );
  }

  const submissionDateObj = new Date(`${submissionDate}T00:00:00Z`);
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const maxBackdatedAllowedUtc = new Date(todayUtc);
  maxBackdatedAllowedUtc.setUTCDate(
    maxBackdatedAllowedUtc.getUTCDate() - MAX_BACKDATE_DAYS_WITHOUT_OVERRIDE
  );

  if (!allowBackdating && submissionDateObj < maxBackdatedAllowedUtc) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      `Backdated submissions older than ${MAX_BACKDATE_DAYS_WITHOUT_OVERRIDE} days are not allowed for this form`
    );
  }

  const usedSlots = await countSubmissionsForDate({
    tenantId,
    projectId,
    nodeId,
    submissionDate,
  });

  if (usedSlots >= slot.totalSlots) {
    throw new ApiError(
      httpStatus.TOO_MANY_REQUESTS,
      'Daily submission quota reached for this date'
    );
  }

  return {
    allowed: true,
    remainingSlots: slot.totalSlots - usedSlots,
    tracking,
  };
};

const getSubmissionWindowStatus = async ({
  tenantId,
  projectId,
  nodeId,
  referenceDate = new Date(),
}) => {
  const month = formatMonth(referenceDate);
  let calendarRows;

  try {
    calendarRows = await getCalendarForMonth({ tenantId, projectId, month });
  } catch (error) {
    return {
      isAccepting: false,
      remainingSlots: 0,
      nextAvailableDate: null,
      hasCalendar: false,
      statusReason: 'no_calendar',
    };
  }

  const tracking = await getTrackingRecord({
    tenantId,
    projectId,
    nodeId,
    month,
  });

  if (tracking?.is_locked) {
    return {
      isAccepting: false,
      remainingSlots: 0,
      nextAvailableDate: null,
      hasCalendar: true,
      statusReason: 'locked',
      lockMessage:
        tracking.lock_reason ||
        'This reporting window is locked by your administrator.',
    };
  }

  const todayStr = referenceDate.toISOString().split('T')[0];
  let remainingSlots = 0;
  let isAccepting = false;
  let usedSlotsToday = 0;
  let slotCapacity = 0;
  let statusReason = 'date_not_on_schedule';

  const todaySlot = findCalendarSlot(calendarRows, todayStr);
  if (todaySlot) {
    slotCapacity = todaySlot.totalSlots;
    remainingSlots =
      todaySlot.totalSlots -
      (await countSubmissionsForDate({
        tenantId,
        projectId,
        nodeId,
        submissionDate: todayStr,
      }));
    usedSlotsToday = todaySlot.totalSlots - remainingSlots;
    if (remainingSlots > 0) {
      isAccepting = true;
      statusReason = null;
    } else {
      statusReason = 'quota_reached';
    }
  }

  let nextAvailableDate = null;
  if (!isAccepting) {
    const futureDates = [];
    calendarRows.forEach((row) => {
      const dateSets = [];
      if (Array.isArray(row?.daily_config?.dates)) {
        dateSets.push(row.daily_config.dates);
      }
      if (Array.isArray(row?.monthly_config?.dates)) {
        dateSets.push(row.monthly_config.dates);
      }
      if (Array.isArray(row?.weekly_config?.days)) {
        row.weekly_config.days.forEach((day) => {
          if (Array.isArray(day?.dates)) {
            dateSets.push(day.dates);
          }
        });
      }
      dateSets.flat().forEach((dateStr) => {
        if (dateStr >= todayStr) {
          futureDates.push(dateStr);
        }
      });
    });

    futureDates.sort();
    for (const dateStr of futureDates) {
      const slot = findCalendarSlot(calendarRows, dateStr);
      if (!slot) continue;
      const used =
        slot.totalSlots -
        (await countSubmissionsForDate({
          tenantId,
          projectId,
          nodeId,
          submissionDate: dateStr,
        }));
      if (used < slot.totalSlots) {
        nextAvailableDate = dateStr;
        break;
      }
    }
  }

  return {
    isAccepting,
    remainingSlots: Math.max(remainingSlots, 0),
    nextAvailableDate,
    hasCalendar: true,
    statusReason,
    referenceDate: todayStr,
    slotCapacity,
    usedSlotsToday,
  };
};

// ---------------------------------------------------------------------------
// getAllowedDates
// ---------------------------------------------------------------------------
/**
 * Return the full per-date schedule for a given month, enriched with how
 * many submissions this node has already made for each date.
 *
 * Covers all three tracking modes:
 *
 *   - "none"   → no specific date schedule; returns { trackingMode: 'none', dates: null }
 *   - "daily"  → dates come from daily_config.dates[], slots from frequency_per_day
 *   - "weekly" → dates come from weekly_config.days[].dates[], slots from each day's per-date limit
 *   - "monthly" → dates come from monthly_config.dates[], slots from submission_limit_per_date
 *
 * @param {{ tenantId, projectId, nodeId, month }} opts   month = "YYYY-MM-DD"
 * @returns {{
 *   trackingMode: string,
 *   dates: null | Array<{
 *     date:      string,   // "YYYY-MM-DD"
 *     dayLabel:  string,   // "Monday"
 *     required:  number,   // slots per date (frequency)
 *     submitted: number,   // how many this node submitted for this date
 *     remaining: number,
 *     isFull:    boolean,
 *     isPast:    boolean,
 *   }>,
 *   totalRequired: number,
 *   totalSubmitted: number,
 * }}
 */
const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const getAllowedDates = async ({ tenantId, projectId, nodeId, month }) => {
  // ── Load the calendar row ────────────────────────────────────────────────
  let calendarRows;
  try {
    calendarRows = await getCalendarForMonth({ tenantId, projectId, month });
  } catch {
    return { trackingMode: 'none', dates: null, totalRequired: 0, totalSubmitted: 0 };
  }

  if (!calendarRows.length) {
    return { trackingMode: 'none', dates: null, totalRequired: 0, totalSubmitted: 0 };
  }

  const cal = calendarRows[0];
  const trackingMode = cal.tracking_mode || 'none';

  if (trackingMode === 'none') {
    return { trackingMode: 'none', dates: null, totalRequired: cal.total_events || 1, totalSubmitted: 0 };
  }

  // ── Build a flat slot list from the calendar config ───────────────────────
  // Each entry: { date: "YYYY-MM-DD", required: N, dayLabel: string }
  const slots = [];

  if (trackingMode === 'daily') {
    const dc = cal.daily_config || {};
    const freqPerDay = dc.frequency_per_day || 1;
    for (const dateStr of (dc.dates || [])) {
      const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay();
      slots.push({ date: dateStr, required: freqPerDay, dayLabel: DAY_NAMES[dow] });
    }
  } else if (trackingMode === 'weekly') {
    const wc = cal.weekly_config || {};
    for (const dayDef of (wc.days || [])) {
      const freq =
        dayDef.submission_limit_per_date || dayDef.frequency_per_day || 1;
      for (const dateStr of (dayDef.dates || [])) {
        slots.push({ date: dateStr, required: freq, dayLabel: dayDef.name || DAY_NAMES[dayDef.day] });
      }
    }
  } else if (trackingMode === 'monthly') {
    const mc = cal.monthly_config || {};
    const freq = mc.submission_limit_per_date || 1;
    for (const dateStr of mc.dates || []) {
      const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay();
      slots.push({ date: dateStr, required: freq, dayLabel: DAY_NAMES[dow] });
    }
  }

  // Sort by date
  slots.sort((a, b) => a.date.localeCompare(b.date));

  if (!slots.length) {
    return { trackingMode, dates: [], totalRequired: 0, totalSubmitted: 0 };
  }

  // ── Load existing submissions per event_date from daily tracking ───────────
  const { rows: submittedRows } = await postgresPool.query(
    `SELECT event_date::text AS event_date, submitted_count AS cnt
     FROM event_compliance_daily_tracking
     WHERE tenant_id = $1
       AND project_id = $2
       AND node_id IS NOT DISTINCT FROM $3
       AND event_date >= $4::date
       AND event_date < ($4::date + INTERVAL '1 month')`,
    [tenantId, projectId, nodeId, month]
  );

  // Build map: "YYYY-MM-DD" → submitted count
  const submittedMap = new Map(
    submittedRows.map((r) => [r.event_date.split('T')[0], Number(r.cnt)])
  );

  const todayStr = new Date().toISOString().split('T')[0];
  let totalRequired  = 0;
  let totalSubmitted = 0;

  const dates = slots.map((slot) => {
    const submitted = submittedMap.get(slot.date) || 0;
    const remaining = Math.max(slot.required - submitted, 0);
    totalRequired  += slot.required;
    totalSubmitted += submitted;
    return {
      date:      slot.date,
      dayLabel:  slot.dayLabel,
      required:  slot.required,
      submitted,
      remaining,
      isFull:    remaining === 0,
      isPast:    slot.date < todayStr,
    };
  });

  return { trackingMode, dates, totalRequired, totalSubmitted };
};

module.exports = {
  validateSubmissionDate,
  getCalendarForMonth,
  getSubmissionWindowStatus,
  getAllowedDates,
};
