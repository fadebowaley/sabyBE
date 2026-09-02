const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { workItemService } = require('../services');

const createWorkItem = catchAsync(async (req, res) => {
  const item = await workItemService.createWorkItem(req.body, req.user);
  res.status(httpStatus.CREATED).send(item);
});

const importWorkItems = catchAsync(async (req, res) => {
  const items = await workItemService.importWorkItems(req.body.items, req.user);
  res.status(httpStatus.CREATED).send({ results: items, total: items.length });
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

module.exports = {
  createWorkItem,
  importWorkItems,
  queryWorkItems,
  getWorkItem,
  updateWorkItem,
  deleteWorkItem,
};
