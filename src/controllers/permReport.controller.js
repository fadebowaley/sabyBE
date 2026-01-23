const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const permReportService = require('../services/permReport.service');

const getPermReport = catchAsync(async (req, res) => {
  const filters = pick(req.query, [
    'tenant_id',
    'project_id',
    'node_id',
    'structure_name',
    'level_name',
    'search',
    'start_date',
    'end_date',
    'month',
    'limit',
    'offset',
  ]);

  const report = await permReportService.getPermReport(filters);

  res.status(httpStatus.OK).send({
    success: true,
    ...report,
  });
});

module.exports = {
  getPermReport,
};


