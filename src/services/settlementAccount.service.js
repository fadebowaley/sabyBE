const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');

const FLUTTERWAVE_BASE = 'https://api.flutterwave.com/v3';

const CURRENCY_COUNTRY_MAP = {
  NGN: 'NG',
  GHS: 'GH',
  KES: 'KE',
  ZAR: 'ZA',
  USD: 'US',
  GBP: 'GB',
  EUR: 'DE',
};

const resolveCountryCode = (currency) => {
  const normalizedCurrency = String(currency || 'NGN').trim().toUpperCase();
  return CURRENCY_COUNTRY_MAP[normalizedCurrency] || 'NG';
};

const getSecretKey = () =>
  String(config.payment?.providers?.flutterwave?.secretKey || '').trim();

const assertReady = () => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Flutterwave credentials are not configured for settlement account setup.'
    );
  }
  return secretKey;
};

const listBanks = async ({ currency = 'NGN' } = {}) => {
  const secretKey = assertReady();
  const country = resolveCountryCode(currency);

  const response = await fetch(
    `${FLUTTERWAVE_BASE}/banks/${encodeURIComponent(country)}`,
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
      data?.message || 'Failed to fetch Flutterwave bank list.'
    );
  }

  const banks = Array.isArray(data?.data) ? data.data : [];
  return banks
    .map((bank) => ({
      id: bank?.id != null ? String(bank.id) : null,
      code: String(bank?.code || bank?.id || '').trim(),
      name: String(bank?.name || '').trim(),
    }))
    .filter((bank) => bank.code && bank.name);
};

const resolveAccount = async ({ accountNumber, bankCode }) => {
  const secretKey = assertReady();
  const normalizedAccountNumber = String(accountNumber || '').trim();
  const normalizedBankCode = String(bankCode || '').trim();

  if (!normalizedAccountNumber || !normalizedBankCode) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Account number and bank are required.'
    );
  }

  const response = await fetch(`${FLUTTERWAVE_BASE}/accounts/resolve`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      account_number: normalizedAccountNumber,
      account_bank: normalizedBankCode,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status !== 'success') {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      data?.message || 'Failed to resolve bank account.'
    );
  }

  const resolved = data?.data || {};
  return {
    accountNumber: String(
      resolved.account_number || normalizedAccountNumber
    ).trim(),
    accountName: String(resolved.account_name || '').trim(),
  };
};

module.exports = {
  listBanks,
  resolveAccount,
};
