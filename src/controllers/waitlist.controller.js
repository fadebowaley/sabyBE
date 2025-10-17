const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { waitlistService } = require('../services');

/**
 * Create a waitlist entry
 */
const createWaitlistEntry = catchAsync(async (req, res) => {
  const {
    email,
    name,
    industry,
    designation,
    needsDemo,
    userType,
    referralSource,
    metadata,
  } = req.body;

  // Get IP and user agent
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('user-agent') || '';

  const entry = await waitlistService.createWaitlistEntry({
    email,
    name,
    industry,
    designation,
    needsDemo: needsDemo || false,
    userType: userType || 'organization',
    referralSource: referralSource || '',
    metadata: metadata || {},
    ipAddress,
    userAgent,
  });

  res.status(httpStatus.CREATED).send({
    success: true,
    data: entry,
    message:
      'Successfully joined the waitlist! Welcome to SABY VIP Early Access.',
  });
});

/**
 * Get waitlist entries (admin only)
 */
const getWaitlistEntries = catchAsync(async (req, res) => {
  const filter = req.query.filter ? JSON.parse(req.query.filter) : {};
  const options = {
    sortBy: req.query.sortBy || '-createdAt',
    limit: req.query.limit ? parseInt(req.query.limit, 10) : 10,
    page: req.query.page ? parseInt(req.query.page, 10) : 1,
  };

  const result = await waitlistService.queryWaitlist(filter, options);
  res.send(result);
});

/**
 * Get waitlist statistics (admin only)
 */
const getWaitlistStats = catchAsync(async (req, res) => {
  const stats = await waitlistService.getWaitlistStats();
  res.send(stats);
});

/**
 * Update waitlist entry status (admin only)
 */
const updateWaitlistStatus = catchAsync(async (req, res) => {
  const entry = await waitlistService.updateWaitlistStatus(
    req.params.id,
    req.body.status
  );
  res.send(entry);
});

/**
 * Delete waitlist entry (admin only)
 */
const deleteWaitlistEntry = catchAsync(async (req, res) => {
  await waitlistService.deleteWaitlistEntry(req.params.id);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Export waitlist entries (admin only)
 */
const exportWaitlist = catchAsync(async (req, res) => {
  const format = req.query.format || 'json';
  const filter = req.query.filter ? JSON.parse(req.query.filter) : {};

  const data = await waitlistService.exportWaitlist(format, filter);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=waitlist-export-${Date.now()}.csv`);
    res.send(data);
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=waitlist-export-${Date.now()}.json`);
    res.send({
      success: true,
      count: data.length,
      data,
    });
  }
});

module.exports = {
  createWaitlistEntry,
  getWaitlistEntries,
  getWaitlistStats,
  updateWaitlistStatus,
  deleteWaitlistEntry,
  exportWaitlist,
};
