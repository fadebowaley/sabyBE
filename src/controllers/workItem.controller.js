const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { workItemService } = require('../services');

const createWorkItem = catchAsync(async (req, res) => {
  const idempotencyKey =
    req.headers['x-idempotency-key'] || req.body.idempotencyKey;
  const payload = idempotencyKey ? { ...req.body, idempotencyKey } : req.body;
  const item = await workItemService.createWorkItem(payload, req.user);
  res.status(httpStatus.CREATED).send(item);
});

const importWorkItems = catchAsync(async (req, res) => {
  const outcome = await workItemService.importWorkItems(req.body.items, req.user);
  if (Array.isArray(outcome)) {
    res.status(httpStatus.CREATED).send({ results: outcome, total: outcome.length, errors: [] });
  } else {
    res.status(httpStatus.CREATED).send({
      results: outcome.results || [],
      total: (outcome.results || []).length,
      errors: outcome.errors || [],
    });
  }
});

const queryWorkItems = catchAsync(async (req, res) => {
  const items = await workItemService.queryWorkItems(req.query, req.user);
  res.send({ results: items });
});

const getWorkItem = catchAsync(async (req, res) => {
  const item = await workItemService.getWorkItem(
    req.params.workItemId,
    req.user
  );
  res.send(item);
});

const updateWorkItem = catchAsync(async (req, res) => {
  const item = await workItemService.updateWorkItem(
    req.params.workItemId,
    req.body,
    req.user
  );
  res.send(item);
});

const deleteWorkItem = catchAsync(async (req, res) => {
  await workItemService.deleteWorkItem(req.params.workItemId, req.user);
  res.status(httpStatus.NO_CONTENT).send();
});

const generateMeeting = catchAsync(async (req, res) => {
  const meeting = await workItemService.generateMeeting(req.body, req.user);
  res.send(meeting);
});

const getPublicWorkItem = catchAsync(async (req, res) => {
  const item = await workItemService.getPublicWorkItem(req.params.workItemId);
  res.send(item);
});

const addPublicResource = catchAsync(async (req, res) => {
  const resources = await workItemService.addPublicResource(
    req.params.workItemId,
    req.body
  );
  res.status(httpStatus.CREATED).send({ resources });
});

module.exports = {
  createWorkItem,
  importWorkItems,
  queryWorkItems,
  getWorkItem,
  getPublicWorkItem,
  addPublicResource,
  updateWorkItem,
  deleteWorkItem,
  generateMeeting,
};
