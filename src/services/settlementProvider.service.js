const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const flutterwaveTransferService = require('./flutterwaveTransfer.service');

const normalizeProvider = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const initiateSettlementTransfer = async ({ settlement }) => {
  const provider = normalizeProvider(settlement?.provider);
  if (provider === 'flutterwave') {
    return flutterwaveTransferService.initiateTransfer({ settlement });
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    `${provider || 'This provider'} settlement transfers are not wired yet.`
  );
};

const checkSettlementAvailability = async ({ settlement }) => {
  const provider = normalizeProvider(settlement?.provider);
  if (provider === 'flutterwave') {
    return flutterwaveTransferService.checkAvailability({ settlement });
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    `${provider || 'This provider'} settlement availability checks are not wired yet.`
  );
};

const getSettlementTransferStatus = async ({ provider, transferId }) => {
  const normalizedProvider = normalizeProvider(provider);
  if (normalizedProvider === 'flutterwave') {
    return flutterwaveTransferService.getTransferStatus({ transferId });
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    `${normalizedProvider || 'This provider'} transfer status is not wired yet.`
  );
};

module.exports = {
  checkSettlementAvailability,
  initiateSettlementTransfer,
  getSettlementTransferStatus,
};
