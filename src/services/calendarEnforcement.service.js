const httpStatus = require('http-status');
const { postgresPool } = require('../config/postgres');
const ApiError = require('../utils/ApiError');

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
      SELECT COUNT(*) AS count
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND node_id IS NOT DISTINCT FROM $3
        AND (
          submission_date = $4 
          OR event_date = $4 
          OR DATE(created_at) = $4
        )
        AND status != 'deleted'
    `,
    [tenantId, projectId, nodeId, submissionDate]
  );
  return Number(rows[0]?.count || 0);
};

const findCalendarSlot = (calendarRows, submissionDate) => {
  for (const row of calendarRows) {
    const config = row.daily_config || row.weekly_config || {};
    const dates = config.dates || [];
    if (dates.includes(submissionDate)) {
      return {
        row,
        totalSlots: config.frequency_per_day || config.count || 1,
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

  const submissionDateObj = new Date(submissionDate);
  const today = new Date();

  if (!allowBackdating && submissionDateObj < today.setHours(0, 0, 0, 0)) {
    throw new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      'Backdated submissions are not allowed for this form'
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
      const config = row.daily_config || row.weekly_config || {};
      (config.dates || []).forEach((dateStr) => {
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

module.exports = {
  validateSubmissionDate,
  getCalendarForMonth,
  getSubmissionWindowStatus,
};
