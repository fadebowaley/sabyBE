const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');

const FLUTTERWAVE_TRANSFER_CURRENCIES = new Set(['NGN']);

const getSecretKey = () =>
  String(config.payment?.providers?.flutterwave?.secretKey || '').trim();

const normalizeAccount = (account = {}) => ({
  accountNumber: String(account.accountNumber || '').trim(),
  bankCode: String(account.bankCode || '').trim(),
  bankName: String(account.bankName || '').trim(),
  accountName: String(account.accountName || account.label || '').trim(),
});

const assertTransferReady = ({ settlement }) => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Flutterwave credentials are not configured for settlement transfers.'
    );
  }

  const currency = String(settlement.currency || '').trim().toUpperCase();
  if (!FLUTTERWAVE_TRANSFER_CURRENCIES.has(currency)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Flutterwave settlement transfers are not enabled for ${currency || 'this currency'} yet.`
    );
  }

  const account = normalizeAccount(settlement.destinationAccount || {});
  if (!account.accountNumber || !account.bankCode) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Settlement destination requires account number and bank code.'
    );
  }

  const amount = Number(settlement.netAmount || settlement.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Settlement transfer amount must be greater than zero.'
    );
  }

  return { secretKey, currency, account, amount };
};

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
};

const getWalletBalances = async () => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Flutterwave credentials are not configured for settlement balance checks.'
    );
  }

  const response = await fetch('https://api.flutterwave.com/v3/balances', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status !== 'success') {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      data?.message || 'Failed to fetch Flutterwave wallet balances.'
    );
  }

  return Array.isArray(data?.data) ? data.data : [];
};

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

  const balances = await getWalletBalances();
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
};

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
  };

  const response = await fetch('https://api.flutterwave.com/v3/transfers', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status !== 'success') {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      data?.message || 'Failed to initiate Flutterwave settlement transfer.'
    );
  }

  const transfer = data?.data || {};
  return {
    provider: 'flutterwave',
    providerTransferId: transfer.id ? String(transfer.id) : null,
    providerReference: transfer.reference ? String(transfer.reference) : reference,
    status: String(transfer.status || 'processing').trim().toLowerCase(),
    amount: Number(transfer.amount || amount),
    currency: String(transfer.currency || currency).trim().toUpperCase(),
    account,
    raw: transfer,
  };
};

const getTransferStatus = async ({ transferId }) => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Flutterwave credentials are not configured for settlement transfers.'
    );
  }
  const id = String(transferId || '').trim();
  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'transferId is required.');
  }

  const response = await fetch(
    `https://api.flutterwave.com/v3/transfers/${encodeURIComponent(id)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status !== 'success') {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      data?.message || 'Failed to fetch Flutterwave transfer status.'
    );
  }

  const transfer = data?.data || {};
  return {
    provider: 'flutterwave',
    providerTransferId: transfer.id ? String(transfer.id) : id,
    providerReference: transfer.reference ? String(transfer.reference) : null,
    status: String(transfer.status || '').trim().toLowerCase(),
    amount: Number(transfer.amount || 0),
    currency: String(transfer.currency || '').trim().toUpperCase(),
    raw: transfer,
  };
};

module.exports = {
  checkAvailability,
  initiateTransfer,
  getTransferStatus,
  normalizeAccount,
};
