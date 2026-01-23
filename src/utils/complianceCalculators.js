/**
 * PERM (Per Event Reporting Model) - Compliance Calculation Utilities
 *
 * Purpose: Calculate compliance metrics, completeness percentages, and status
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

const logger = require('../config/logger');

/**
 * Calculate completeness percentage
 * @param {number} submitted - Number of events submitted
 * @param {number} required - Number of events required
 * @returns {number} Percentage (0.00 to 100.00)
 */
const calculateCompleteness = (submitted, required) => {
  if (required === 0) return 100.0;
  if (submitted > required) {
    logger.warn(
      `⚠️ Submitted events (${submitted}) exceed required (${required})`
    );
    return 100.0;
  }
  const percentage = (submitted / required) * 100;
  return parseFloat(percentage.toFixed(2));
};

/**
 * Get compliance status based on percentage
 * @param {number} percentage - Completeness percentage
 * @returns {string} Status: 'incomplete', 'partial', 'complete'
 */
const getComplianceStatus = (percentage) => {
  if (percentage >= 100) return 'complete';
  if (percentage >= 40) return 'partial';
  return 'incomplete';
};

/**
 * Count submitted events from submission data
 * @param {Object} submissionData - The submission data object
 * @returns {number} Total count of event records
 */
const countSubmittedEvents = (submissionData) => {
  if (!submissionData || typeof submissionData !== 'object') return 0;

  let totalEvents = 0;

  // Iterate through categories (attendance, financial, first_timers, etc.)
  Object.keys(submissionData).forEach((category) => {
    const categoryData = submissionData[category];

    // Check if category has records array
    if (categoryData && Array.isArray(categoryData.records)) {
      totalEvents += categoryData.records.length;
    }
  });

  return totalEvents;
};

/**
 * Count submitted events by event type
 * @param {Object} submissionData - The submission data object
 * @param {string} category - Category name (e.g., 'attendance')
 * @returns {Object} Event type counts { sunday_event: 4, monday_event: 5, ... }
 */
const countEventsByType = (submissionData, category) => {
  const counts = {};

  if (!submissionData || !submissionData[category]) return counts;

  const categoryData = submissionData[category];
  if (!Array.isArray(categoryData.records)) return counts;

  categoryData.records.forEach((record) => {
    const eventType = record.event || record.service || 'unknown';
    counts[eventType] = (counts[eventType] || 0) + 1;
  });

  return counts;
};

/**
 * Compare submitted events against calendar
 * @param {Object} submissionData - The submission data object
 * @param {Array} calendar - Array of event_calendar entries
 * @param {string} category - Category to check (default: 'attendance')
 * @returns {Object} Comparison result with missing events
 */
const compareAgainstCalendar = (
  submissionData,
  calendar,
  category = 'attendance'
) => {
  const result = {
    totalRequired: 0,
    totalSubmitted: 0,
    completeness: 0,
    byEventType: {},
    missingEvents: [],
  };

  if (!calendar || calendar.length === 0) {
    logger.warn('⚠️ No calendar provided for comparison');
    return result;
  }

  // Count submitted events by type
  const submittedCounts = countEventsByType(submissionData, category);

  // Compare against calendar
  calendar.forEach((calendarEntry) => {
    const eventType = calendarEntry.event_type;
    const required = calendarEntry.total_events;
    const submitted = submittedCounts[eventType] || 0;
    const missing = required - submitted;

    result.totalRequired += required;
    result.totalSubmitted += submitted;

    result.byEventType[eventType] = {
      required,
      submitted,
      missing: Math.max(0, missing),
      percentage: required > 0 ? (submitted / required) * 100 : 100,
    };

    // Identify specific missing event dates
    if (missing > 0 && calendarEntry.event_dates) {
      const eventDates = Array.isArray(calendarEntry.event_dates)
        ? calendarEntry.event_dates
        : JSON.parse(calendarEntry.event_dates);

      // Get submitted dates for this event type
      const submittedDates = new Set();
      if (
        submissionData[category] &&
        Array.isArray(submissionData[category].records)
      ) {
        submissionData[category].records.forEach((record) => {
          if ((record.event || record.service) === eventType && record.date) {
            submittedDates.add(record.date);
          }
        });
      }

      // Find missing dates
      eventDates.forEach((expectedDate) => {
        if (!submittedDates.has(expectedDate)) {
          result.missingEvents.push({
            event_type: eventType,
            expected_date: expectedDate,
            status: 'not_submitted',
          });
        }
      });
    }
  });

  result.completeness = calculateCompleteness(
    result.totalSubmitted,
    result.totalRequired
  );

  return result;
};

/**
 * Generate compliance report
 * @param {Object} submission - The submission object
 * @param {Array} calendar - Array of event_calendar entries
 * @returns {Object} Comprehensive compliance report
 */
const generateComplianceReport = (submission, calendar) => {
  const comparison = compareAgainstCalendar(submission.data, calendar);

  const report = {
    submission_id: submission.id,
    node_id: submission.node_id,
    month: submission.month,
    year: submission.year,

    // Overall metrics
    total_events_required: comparison.totalRequired,
    total_events_submitted: comparison.totalSubmitted,
    completeness_percentage: comparison.completeness,
    compliance_status: getComplianceStatus(comparison.completeness),

    // Per-event breakdown
    events_breakdown: comparison.byEventType,

    // Missing events
    missing_events: comparison.missingEvents,
    missing_count: comparison.missingEvents.length,

    // Lock status
    is_locked: submission.is_locked || false,
    locked_at: submission.locked_at,

    // Timestamps
    last_updated: submission.updated_at,
    calculated_at: new Date(),
  };

  return report;
};

/**
 * Calculate weekly progress
 * @param {Object} submissionData - The submission data object
 * @returns {Array} Weekly progress array
 */
const calculateWeeklyProgress = (submissionData) => {
  const weeklyProgress = [];

  if (!submissionData) return weeklyProgress;

  // Extract all records from all categories
  const allRecords = [];
  Object.keys(submissionData).forEach((category) => {
    const categoryData = submissionData[category];
    if (categoryData && Array.isArray(categoryData.records)) {
      allRecords.push(...categoryData.records.map((r) => ({ ...r, category })));
    }
  });

  // Group by week
  const byWeek = {};
  allRecords.forEach((record) => {
    const week = record.week || 1;
    if (!byWeek[week]) {
      byWeek[week] = [];
    }
    byWeek[week].push(record);
  });

  // Calculate cumulative progress
  let cumulativeEvents = 0;
  const weeks = Object.keys(byWeek).sort((a, b) => a - b);

  weeks.forEach((week) => {
    cumulativeEvents += byWeek[week].length;
    weeklyProgress.push({
      week: parseInt(week),
      events_submitted: byWeek[week].length,
      cumulative_events: cumulativeEvents,
      // Note: cumulative_percentage requires totalRequired, calculated separately
    });
  });

  return weeklyProgress;
};

/**
 * Validate if submission is within allowed window
 * @param {string} eventDate - Event date (YYYY-MM-DD)
 * @param {number} windowDays - Number of days after event (default: 6)
 * @param {number} gracePeriod - Additional grace days (default: 0)
 * @returns {Object} Validation result
 */
const validateSubmissionWindow = (
  eventDate,
  windowDays = 6,
  gracePeriod = 0
) => {
  const eventDateObj = new Date(eventDate);
  const currentDate = new Date();

  // Calculate deadline
  const deadline = new Date(eventDateObj);
  deadline.setDate(deadline.getDate() + windowDays + gracePeriod);
  deadline.setHours(23, 59, 59, 999); // End of day

  const isWithinWindow = currentDate <= deadline;
  const daysLate = Math.max(
    0,
    Math.ceil((currentDate - deadline) / (1000 * 60 * 60 * 24))
  );

  return {
    isValid: isWithinWindow,
    eventDate,
    currentDate: currentDate.toISOString(),
    deadline: deadline.toISOString(),
    windowDays,
    gracePeriod,
    daysLate,
    message: isWithinWindow
      ? 'Within submission window'
      : `Submission window closed ${daysLate} days ago`,
  };
};

/**
 * Validate event date matches expected day of week
 * @param {string} eventDate - Event date (YYYY-MM-DD)
 * @param {string} eventType - Event type (e.g., 'sunday_event')
 * @param {number} expectedDayOfWeek - Expected day (0=Sunday, 6=Saturday)
 * @returns {Object} Validation result
 */
const validateEventDayOfWeek = (eventDate, eventType, expectedDayOfWeek) => {
  const dateObj = new Date(eventDate);
  const actualDayOfWeek = dateObj.getDay();

  const isValid = actualDayOfWeek === expectedDayOfWeek;

  const dayNames = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  return {
    isValid,
    eventDate,
    eventType,
    expectedDay: dayNames[expectedDayOfWeek],
    actualDay: dayNames[actualDayOfWeek],
    message: isValid
      ? `Event date is correct (${dayNames[actualDayOfWeek]})`
      : `Event date is ${dayNames[actualDayOfWeek]}, expected ${dayNames[expectedDayOfWeek]}`,
  };
};

/**
 * Calculate events breakdown per category
 * @param {Object} submissionData - The submission data object
 * @returns {Object} Breakdown by category
 */
const calculateCategoryBreakdown = (submissionData) => {
  const breakdown = {};

  if (!submissionData) return breakdown;

  Object.keys(submissionData).forEach((category) => {
    const categoryData = submissionData[category];

    if (categoryData && Array.isArray(categoryData.records)) {
      const eventCounts = {};

      categoryData.records.forEach((record) => {
        const eventType = record.event || record.service || 'unknown';
        eventCounts[eventType] = (eventCounts[eventType] || 0) + 1;
      });

      breakdown[category] = {
        total_records: categoryData.records.length,
        event_counts: eventCounts,
        has_settings: !!categoryData.settings,
        is_required: categoryData.settings?.required || false,
      };
    }
  });

  return breakdown;
};

module.exports = {
  calculateCompleteness,
  getComplianceStatus,
  countSubmittedEvents,
  countEventsByType,
  compareAgainstCalendar,
  generateComplianceReport,
  calculateWeeklyProgress,
  validateSubmissionWindow,
  validateEventDayOfWeek,
  calculateCategoryBreakdown,
};

/**
 * PERM (Per Event Reporting Model) - Compliance Calculation Utilities
 *
 * Purpose: Calculate compliance metrics, completeness percentages, and status
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */
