const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { schemaService } = require('../services');
const ApiError = require('../utils/ApiError');

/**
 * Get User schema with all available fields including custom fields
 * @route GET /schema/user
 * @access Private
 */
const getUserSchema = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId || req.query.tenantId;

  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required');
  }

  const schema = await schemaService.getUserSchema(tenantId);

  res.status(httpStatus.OK).send({
    success: true,
    data: schema,
  });
});

/**
 * Get Node schema with all available fields including custom fields
 * @route GET /schema/node
 * @access Private
 */
const getNodeSchema = catchAsync(async (req, res) => {
  const tenantId = req.user?.tenantId || req.query.tenantId;

  if (!tenantId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Tenant ID is required');
  }

  const schema = await schemaService.getNodeSchema(tenantId);

  res.status(httpStatus.OK).send({
    success: true,
    data: schema,
  });
});

module.exports = {
  getUserSchema,
  getNodeSchema,
};

