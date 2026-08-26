const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');
const FlutterwaveTransferLog = require('../models/flutterwaveTransferLog.model');
const logger = require('../config/logger');

const FLUTTERWAVE_TRANSFER_CURRENCIES = new Set(['NGN']);
const FLUTTERWAVE_TRANSFER_MINIMUMS = {
  NGN: 100,
};

const getSecretKey = () =>
  String(config.payment?.providers?.flutterwave?.secretKey || '').trim();

const normalizeAccount = (account = {}) => ({
  accountNumber: String(account.accountNumber || '').trim(),
  bankCode: String(account.bankCode || '').trim(),
  bankName: String(account.bankName || '').trim(),
  accountName: String(account.accountName || account.label || '').trim(),
});

const buildTransferReference = (settlement) =>
  `SET-${String(settlement._id || settlement.id || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-20)
    .toUpperCase()}`;

const extractBalanceAmount = (entry = {}) => {
  const candidates = [
    entry.available_balance,
    entry.availableBalance,
    entry.balance,
    entry.amount,
    entry.ledger_balance,
  ];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

const updateLog = async (logId, updateData) => {
  try {
    await FlutterwaveTransferLog.findByIdAndUpdate(logId, updateData, { new: true });
  } catch (e) {
    logger.error(`Failed to update Flutterwave log: ${e.message}`);
  }
}

const getWalletBalances = async (settlement) => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new ApiError(
      503,
      'Flutterwave credentials are not configured for settlement balance checks.'
    );
  }

  const response = await fetch('https://api.flutterwave.com/v3/balances', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status !== 'success') {
    throw new ApiError(
      502,
      data?.message || 'Failed to fetch Flutterwave wallet balances.'
    );
  }

  return Array.isArray(data?.data) ? data.data : [];
}

const checkAvailability = async ({ settlement }) => {
  const currency = String(settlement.currency || '').trim().toUpperCase();
  const amount = Number(settlement.netAmount || settlement.amount || 0);
  if (!FLUTTERWAVE_TRANSFER_CURRENCIES.has(currency)) {
    return {
      available: false,
      reason: 'currency_not_enabled_for_transfer',
      currency,
      requiredAmount: amount,
      availableBalance: 0,
    };
  }

  const balances = await getWalletBalances(settlement);
  const balanceEntry = balances.find(
    (entry) => String(entry?.currency || '').trim().toUpperCase() === currency
  );
  const availableBalance = extractBalanceAmount(balanceEntry || {});

  return {
    available: availableBalance >= amount,
    reason:
      availableBalance >= amount
        ? 'available_for_payout'
        : 'insufficient_provider_balance',
    currency,
    requiredAmount: amount,
    availableBalance,
    raw: balanceEntry || null,
  };
}

const initiateTransfer = async ({ settlement }) => {
  const { secretKey, currency, account, amount } = assertTransferReady({
    settlement,
  });
  const reference = settlement.providerReference || buildTransferReference(settlement);
  const payload = {
    account_bank: account.bankCode,
    account_number: account.accountNumber,
    amount,
    currency,
    narration: `Saby settlement ${settlement.paymentReference}`,
    reference,
    beneficiary_name: account.accountName || undefined,
  }

  const logData = {
    settlementId: settlement._id,
    paymentId: settlement.paymentId,
    paymentReference: settlement.paymentReference,
    tenantId: settlement.tenantId,
    request: {
      endpoint: '/v3/transfers',
      method: 'POST',
      payload,
      reference,
      amount,
      currency,
      accountNumber: account.accountNumber,
      bankCode: account.bankCode,
      bankName: account.bankName,
      beneficiaryName: account.accountName,
    },
    lifecycle: {
      initiatedAt: new Date(),
      statusCheckedAt: [],
    },
    status: 'initiated',
    metadata: { type: 'transfer_initiation' },
  }

  const logEntry = await FlutterwaveTransferLog.create(logData)

  try {
    const response = await fetch('https://api.flutterwave.com/v3/transfers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getSecretKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const text = await response.text()
    const data = JSON.parse(text)

    await updateLog(logEntry._id, {
      $set: {
        'response.statusCode': response.status,
        'response.raw': data,
        'response.durationMs': 0,
      },
      $push: { 'lifecycle.statusCheckedAt': new Date() },
    })

    if (!response.ok || data?.status !== 'success') {
      await updateLog(logEntry._id, {
        $set: {
          status: 'transfer_failed',
          error: {
            message: data?.message || 'Failed to initiate Flutterwave settlement transfer.',
            flutterwaveError: data,
          },
        },
      })
      throw new ApiError(
        502,
        data?.message || 'Failed to initiate Flutterwave settlement transfer.'
      )
    }

    const transfer = data?.data || {}
    await updateLog(logEntry._id, {
      $set: {
        status: 'transfer_queued',
        'response.success': data.status === 'success',
        'response.status': String(transfer.status || 'processing').trim().toLowerCase(),
        'response.message': data.message,
        'response.providerTransferId': transfer.id ? String(transfer.id) : null,
        'response.providerReference': transfer.reference ? String(transfer.reference) : reference,
        'response.flutterwaveStatus': String(transfer.status || '').trim(),
        'response.transferFee': Number(transfer.fee || 0),
        'response.transferAmount': Number(transfer.amount || amount),
        'response.bankName': transfer.bank_name || null,
        'response.fullName': transfer.full_name || null,
        'response.createdAt': transfer.created_at || null,
        'response.completeMessage': transfer.complete_message || null,
        'response.requiresApproval': transfer.requires_approval === 1,
        'response.isApproved': transfer.is_approved === 1,
        'response.raw': transfer,
      },
      $push: { 'lifecycle.statusCheckedAt': new Date() },
    })

    return {
      provider: 'flutterwave',
      providerTransferId: transfer.id ? String(transfer.id) : null,
      providerReference: transfer.reference ? String(transfer.reference) : reference,
      status: String(transfer.status || 'processing').trim().toLowerCase(),
      amount: Number(transfer.amount || amount),
      currency: String(transfer.currency || currency).trim().toUpperCase(),
      account,
      raw: transfer,
      logId: logEntry._id,
    }
  } catch (e) {
    await updateLog(logEntry._id, {
      $set: {
        status: 'transfer_failed',
        error: {
          code: e.code,
          message: e.message,
          stack: e.stack,
        },
      },
    })
    throw e
  }
}

const getTransferStatus = async ({ transferId }) => {
  const secretKey = getSecretKey()
  const id = String(transferId || '').trim()
  if (!id) {
    throw new ApiError(400, 'transferId is required.')
  }

  const url = `https://api.flutterwave.com/v3/transfers/${encodeURIComponent(id)}`
  const options = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      'Content-Type': 'application/json',
    },
  }

  const logData = {
    settlementId: null,
    paymentId: null,
    paymentReference: null,
    tenantId: null,
    request: {
      endpoint: `/v3/transfers/${encodeURIComponent(id)}`,
      method: 'GET',
      payload: { transferId: id },
    },
    lifecycle: {
      initiatedAt: new Date(),
      statusCheckedAt: [],
    },
    status: 'initiated',
    metadata: { type: 'status_check' },
  }

  const logEntry = await FlutterwaveTransferLog.create(logData)

  try {
    const response = await fetch(url, options)
    const text = await response.text()
    const data = JSON.parse(text)

    await updateLog(logEntry._id, {
      $set: {
        'response.statusCode': response.status,
        'response.raw': data,
        'response.durationMs': 0,
      },
      $push: { 'lifecycle.statusCheckedAt': new Date() },
    })

    if (!response.ok || data?.status !== 'success') {
      await updateLog(logEntry._id, {
        $set: {
          status: 'transfer_failed',
          error: {
            message: data?.message || 'Failed to fetch Flutterwave transfer status.',
            flutterwaveError: data,
          },
        },
      })
      throw new ApiError(
        502,
        data?.message || 'Failed to fetch Flutterwave transfer status.'
      )
    }

    const transfer = data?.data || {}
    await updateLog(logEntry._id, {
      $set: {
        status: 'successful',
        'response.success': true,
        'response.status': String(transfer.status || '').trim().toLowerCase(),
        'response.providerTransferId': transfer.id ? String(transfer.id) : id,
        'response.providerReference': transfer.reference ? String(transfer.reference) : null,
        'response.flutterwaveStatus': String(transfer.status || '').trim(),
        'response.transferAmount': Number(transfer.amount || 0),
        'response.raw': transfer,
      },
      $push: { 'lifecycle.statusCheckedAt': new Date() },
    })

    return {
      provider: 'flutterwave',
      providerTransferId: transfer.id ? String(transfer.id) : id,
      providerReference: transfer.reference ? String(transfer.reference) : null,
      status: String(transfer.status || '').trim().toLowerCase(),
      amount: Number(transfer.amount || 0),
      currency: String(transfer.currency || '').trim().toUpperCase(),
      raw: transfer,
    }
  } catch (e) {
    await updateLog(logEntry._id, {
      $set: {
        status: 'transfer_failed',
        error: {
          code: e.code,
          message: e.message,
          stack: e.stack,
        },
      },
    })
    throw e
  }
}

const assertTransferReady = ({ settlement }) => {
  const secretKey = getSecretKey()
  if (!secretKey) {
    throw new ApiError(
      503,
      'Flutterwave credentials are not configured for settlement transfers.'
    )
  }

  const currency = String(settlement.currency || '').trim().toUpperCase()
  if (!FLUTTERWAVE_TRANSFER_CURRENCIES.has(currency)) {
    throw new ApiError(
      400,
      `Flutterwave settlement transfers are not enabled for ${currency || 'this currency'} yet.`
    )
  }

  const account = normalizeAccount(settlement.destinationAccount || {})
  if (!account.accountNumber || !account.bankCode) {
    throw new ApiError(
      400,
      'Settlement destination requires account number and bank code.'
    )
  }

  const amount = Number(settlement.netAmount || settlement.amount || 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(
      400,
      'Settlement transfer amount must be greater than zero.'
    )
  }

  const minimumAmount = Number(FLUTTERWAVE_TRANSFER_MINIMUMS[currency] || 0);
  if (minimumAmount > 0 && amount < minimumAmount) {
    const error = new ApiError(
      httpStatus.UNPROCESSABLE_ENTITY,
      `Flutterwave ${currency} transfers require a minimum amount of ${minimumAmount}.`
    );
    error.code = 'FLUTTERWAVE_TRANSFER_MINIMUM_NOT_MET';
    error.minimumAmount = minimumAmount;
    error.transferAmount = amount;
    throw error;
  }

  return { secretKey, currency, account, amount }
}

module.exports = {
  checkAvailability,
  initiateTransfer,
  getTransferStatus,
  normalizeAccount,
  getWalletBalances,
  assertTransferReady,
  FLUTTERWAVE_TRANSFER_CURRENCIES,
  FLUTTERWAVE_TRANSFER_MINIMUMS,
}
