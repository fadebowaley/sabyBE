/**
 * Date Helper Utilities for PERM Calendar System
 *
 * Provides utility functions for date calculations, month boundaries,
 * holiday checking, and calendar operations.
 *
 * Created: October 29, 2025
 */

/**
 * Check if a year is a leap year
 * @param {number} year - Year to check
 * @returns {boolean} True if leap year
 */
const isLeapYear = (year) => {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
};

/**
 * Get number of days in a month
 * Handles leap years correctly
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {number} Number of days
 */
const getDaysInMonth = (year, month) => {
  const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (month === 2 && isLeapYear(year)) {
    return 29;
  }

  return daysPerMonth[month - 1];
};

/**
 * Get first and last day of month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Object} {firstDay, lastDay, totalDays}
 */
const getMonthBoundaries = (year, month) => {
  const firstDay = new Date(year, month - 1, 1);
  const totalDays = getDaysInMonth(year, month);
  const lastDay = new Date(year, month - 1, totalDays);

  return {
    firstDay,
    lastDay,
    totalDays,
    month: month,
    year: year,
  };
};

/**
 * Get all dates in a month for specific days of week
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number[]} daysOfWeek - Array of day numbers (0-6, where 0=Sunday)
 * @returns {string[]} Array of date strings (YYYY-MM-DD)
 */
const getDatesForDaysOfWeek = (year, month, daysOfWeek) => {
  const { firstDay, totalDays } = getMonthBoundaries(year, month);
  const dates = [];

  for (let day = 1; day <= totalDays; day++) {
    const currentDate = new Date(year, month - 1, day);
    const dayOfWeek = currentDate.getDay();

    if (daysOfWeek.includes(dayOfWeek)) {
      dates.push(currentDate.toISOString().split('T')[0]);
    }
  }

  return dates;
};

/**
 * Apply frequency filter to dates
 * @param {string[]} dates - Array of dates
 * @param {string} frequency - 'weekly', 'biweekly', 'monthly'
 * @param {number} occurrences - For biweekly/monthly, how many to take
 * @returns {string[]} Filtered dates
 */
const applyFrequencyFilter = (dates, frequency, occurrences = null) => {
  switch (frequency) {
    case 'weekly':
      return dates; // All occurrences

    case 'biweekly':
      return dates.filter((_, index) => index % 2 === 0); // Every other

    case 'monthly':
      return dates.slice(0, occurrences || 1); // First N occurrences

    default:
      return dates;
  }
};

/**
 * Parse month string to year and month numbers
 * Supports: 'YYYY-MM-DD' or 'YYYY-MM'
 * @param {string} monthString - Month string
 * @returns {Object} {year, month, monthString}
 */
const parseMonthString = (monthString) => {
  const match = monthString.match(/^(\d{4})-(\d{2})/);

  if (!match) {
    throw new Error(
      `Invalid month format: ${monthString}. Expected YYYY-MM or YYYY-MM-DD`
    );
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}. Must be between 1 and 12`);
  }

  return {
    year,
    month,
    monthString: `${year}-${String(month).padStart(2, '0')}-01`,
  };
};

/**
 * Basic holiday checker (can be enhanced)
 * @param {Date} date - Date to check
 * @param {string[]} holidayDates - Array of holiday date strings (YYYY-MM-DD)
 * @returns {boolean} True if date is a holiday
 */
const isHoliday = (date, holidayDates = []) => {
  const dateString = date.toISOString().split('T')[0];
  return holidayDates.includes(dateString);
};

/**
 * Check if date is a weekend
 * @param {Date} date - Date to check
 * @returns {boolean} True if Saturday or Sunday
 */
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

/**
 * Get day name from day number
 * @param {number} day - Day number (0-6)
 * @returns {string} Day name
 */
const getDayName = (day) => {
  const names = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  return names[day] || 'Unknown';
};

/**
 * Calculate expected submissions for daily tracking
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number[]} activeDays - Active days of week (0-6)
 * @param {number} frequencyPerDay - Submissions per day
 * @param {boolean} skipWeekends - Skip weekends
 * @param {boolean} skipHolidays - Skip holidays
 * @param {string[]} holidayDates - Array of holiday dates
 * @returns {Object} {totalDays, totalExpected, dates}
 */
const calculateDailyExpected = (
  year,
  month,
  activeDays,
  frequencyPerDay = 1,
  skipWeekends = false,
  skipHolidays = false,
  holidayDates = []
) => {
  const dates = getDatesForDaysOfWeek(year, month, activeDays);
  const filteredDates = dates.filter((dateStr) => {
    const date = new Date(dateStr);

    if (skipWeekends && isWeekend(date)) return false;
    if (skipHolidays && isHoliday(date, holidayDates)) return false;

    return true;
  });

  const totalDays = filteredDates.length;
  const totalExpected = totalDays * frequencyPerDay;

  return {
    totalDays,
    totalExpected,
    dates: filteredDates,
    frequencyPerDay,
  };
};

/**
 * Calculate expected submissions for weekly tracking
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {Array} dayConfigs - Array of {day, frequency, occurrences}
 * @returns {Object} {totalEvents, breakdown}
 */
const calculateWeeklyExpected = (year, month, dayConfigs) => {
  const breakdown = [];
  let totalEvents = 0;

  for (const config of dayConfigs) {
    if (!config.enabled) continue;

    // Get all dates for this day of week
    const allDates = getDatesForDaysOfWeek(year, month, [config.day]);

    // Apply frequency filter
    const finalDates = applyFrequencyFilter(
      allDates,
      config.frequency,
      config.occurrences
    );

    breakdown.push({
      day: config.day,
      name: config.name || getDayName(config.day),
      frequency: config.frequency,
      count: finalDates.length,
      dates: finalDates,
    });

    totalEvents += finalDates.length;
  }

  return {
    totalEvents,
    breakdown,
  };
};

/**
 * Validate month string format
 * @param {string} monthString - Month string to validate
 * @returns {boolean} True if valid
 */
const isValidMonthString = (monthString) => {
  return /^\d{4}-\d{2}(-\d{2})?$/.test(monthString);
};

/**
 * Get current month string (YYYY-MM-01)
 * @returns {string} Current month
 */
const getCurrentMonth = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

/**
 * Add months to a date
 * @param {string} monthString - Starting month (YYYY-MM-DD)
 * @param {number} monthsToAdd - Number of months to add
 * @returns {string} New month string
 */
const addMonths = (monthString, monthsToAdd) => {
  const { year, month } = parseMonthString(monthString);
  const date = new Date(year, month - 1 + monthsToAdd, 1);
  const newYear = date.getFullYear();
  const newMonth = String(date.getMonth() + 1).padStart(2, '0');
  return `${newYear}-${newMonth}-01`;
};

module.exports = {
  isLeapYear,
  getDaysInMonth,
  getMonthBoundaries,
  getDatesForDaysOfWeek,
  applyFrequencyFilter,
  parseMonthString,
  isHoliday,
  isWeekend,
  getDayName,
  calculateDailyExpected,
  calculateWeeklyExpected,
  isValidMonthString,
  getCurrentMonth,
  addMonths,
};


