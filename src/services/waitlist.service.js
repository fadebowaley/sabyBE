const httpStatus = require('http-status');
const { Waitlist } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a waitlist entry
 * @param {Object} waitlistBody
 * @returns {Promise<Waitlist>}
 */
const createWaitlistEntry = async (waitlistBody) => {
  const { email } = waitlistBody;

  // Check if email already exists
  if (await Waitlist.isEmailTaken(email)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Email already registered in waitlist'
    );
  }

  return Waitlist.create(waitlistBody);
};

/**
 * Query for waitlist entries
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryWaitlist = async (filter, options) => {
  const entries = await Waitlist.paginate(filter, options);
  return entries;
};

/**
 * Get waitlist entry by id
 * @param {ObjectId} id
 * @returns {Promise<Waitlist>}
 */
const getWaitlistEntryById = async (id) => {
  return Waitlist.findById(id);
};

/**
 * Get waitlist statistics
 * @returns {Promise<Object>}
 */
const getWaitlistStats = async () => {
  return Waitlist.getStats();
};

/**
 * Update waitlist entry status
 * @param {ObjectId} id
 * @param {string} status
 * @returns {Promise<Waitlist>}
 */
const updateWaitlistStatus = async (id, status) => {
  const entry = await getWaitlistEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Waitlist entry not found');
  }

  entry.status = status;

  if (status === 'invited' && !entry.invitedAt) {
    entry.invitedAt = new Date();
  }

  if (status === 'converted' && !entry.convertedAt) {
    entry.convertedAt = new Date();
  }

  await entry.save();
  return entry;
};

/**
 * Delete waitlist entry by id
 * @param {ObjectId} id
 * @returns {Promise<Waitlist>}
 */
const deleteWaitlistEntry = async (id) => {
  const entry = await getWaitlistEntryById(id);
  if (!entry) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Waitlist entry not found');
  }
  await entry.remove();
  return entry;
};

/**
 * Export waitlist entries
 * @param {string} format - 'json' or 'csv'
 * @param {Object} filter - Mongo filter
 * @returns {Promise<Array|string>}
 */
const exportWaitlist = async (format = 'json', filter = {}) => {
  const entries = await Waitlist.find(filter)
    .select('-__v')
    .sort({ createdAt: -1 })
    .lean();

  if (format === 'csv') {
    // Convert to CSV format
    if (entries.length === 0) {
      return 'email,name,industry,designation,needsDemo,userType,status,subscribedAt\n';
    }

    const headers = [
      'email',
      'name',
      'industry',
      'designation',
      'needsDemo',
      'userType',
      'referralSource',
      'status',
      'subscribedAt',
      'invitedAt',
      'convertedAt',
      'ipAddress'
    ];

    const csvRows = [headers.join(',')];
    
    entries.forEach(entry => {
      const row = headers.map(header => {
        const value = entry[header];
        if (value === null || value === undefined) return '';
        if (value instanceof Date) return value.toISOString();
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        // Escape commas and quotes in CSV
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  // Return JSON format
  return entries;
};

module.exports = {
  createWaitlistEntry,
  queryWaitlist,
  getWaitlistEntryById,
  getWaitlistStats,
  updateWaitlistStatus,
  deleteWaitlistEntry,
  exportWaitlist,
};

