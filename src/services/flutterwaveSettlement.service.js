const httpStatus = require('http-status');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');

const getSecretKey = () =>
  String(config.payment?.providers?.flutterwave?.secretKey || '').trim();

const requestFlutterwave = async (path, query = {}) => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Flutterwave credentials are not configured for settlement reconciliation.'
    );
  }

  const url = new URL(`https://api.flutterwave.com/v3${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
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
      data?.message || 'Failed to fetch Flutterwave settlement data.'
    );
  }
  return data?.data || data;
};

const listSettlements = async ({ from, to, page = 1 } = {}) =>
  requestFlutterwave('/settlements', { from, to, page });

const getSettlement = async ({ settlementId }) => {
  const id = String(settlementId || '').trim();
  if (!id) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'settlementId is required.');
  }
  return requestFlutterwave(`/settlements/${encodeURIComponent(id)}`);
};

const asArray = (value) => (Array.isArray(value) ? value : []);

const flattenObjects = (value, depth = 0) => {
  if (!value || depth > 4) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenObjects(entry, depth + 1));
  }
  if (typeof value !== 'object') return [];

  const own = [value];
  const nested = Object.entries(value)
    .filter(([, entry]) => Array.isArray(entry) || (entry && typeof entry === 'object'))
    .flatMap(([, entry]) => flattenObjects(entry, depth + 1));
  return own.concat(nested);
};

const readString = (entry, keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => acc?.[part], entry);
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return null;
};

const readNumber = (entry, keys) => {
  for (const key of keys) {
    const value = key.split('.').reduce((acc, part) => acc?.[part], entry);
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const normalizeSettlementBatchList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.settlements)) return payload.settlements;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

const extractProviderSettlementId = (entry) =>
  readString(entry, ['id', 'settlement_id', 'settlementId', 'reference']);

const extractTransactionCandidates = (settlementDetail) => {
  const preferred = [
    ...asArray(settlementDetail?.transactions),
    ...asArray(settlementDetail?.charges),
    ...asArray(settlementDetail?.data?.transactions),
    ...asArray(settlementDetail?.data?.charges),
  ];
  const candidates = preferred.length ? preferred : flattenObjects(settlementDetail);
  return candidates.filter((entry) => {
    const txRef = readString(entry, [
      'tx_ref',
      'txRef',
      'reference',
      'paymentReference',
      'transaction_reference',
      'flw_ref',
      'flwRef',
    ]);
    const providerId = readString(entry, ['id', 'transaction_id', 'transactionId']);
    return txRef || providerId;
  });
};

const amountsMatch = (a, b) => {
  const left = Number(a);
  const right = Number(b);
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 0.01;
};

const transactionMatchesPayment = ({ candidate, payment, settlement }) => {
  const txRef = readString(candidate, [
    'tx_ref',
    'txRef',
    'reference',
    'paymentReference',
    'transaction_reference',
  ]);
  const providerId = readString(candidate, [
    'id',
    'transaction_id',
    'transactionId',
    'flw_ref',
    'flwRef',
  ]);
  const currency = readString(candidate, ['currency', 'settlement_currency']);
  const amount = readNumber(candidate, [
    'amount',
    'charged_amount',
    'settlement_amount',
    'net_amount',
  ]);
  const expectedAmount = Number(payment.total || payment.amount || settlement.amount || 0);

  const referenceMatches =
    (txRef && txRef === payment.reference) ||
    (providerId && payment.providerRef && providerId === String(payment.providerRef));
  const currencyMatches =
    String(currency || '').trim().toUpperCase() ===
    String(payment.currency || settlement.currency || '').trim().toUpperCase();

  return referenceMatches && currencyMatches && amountsMatch(amount, expectedAmount);
};

const findSettledTransaction = async ({
  payment,
  settlement,
  from,
  to,
  maxPages = 5,
}) => {
  const pages = Math.max(1, Number(maxPages) || 1);
  for (let page = 1; page <= pages; page += 1) {
    const listPayload = await listSettlements({ from, to, page });
    const batches = normalizeSettlementBatchList(listPayload);
    if (!batches.length) break;

    for (const batch of batches) {
      const providerSettlementId = extractProviderSettlementId(batch);
      if (!providerSettlementId) continue;

      const detail = await getSettlement({ settlementId: providerSettlementId });
      const candidates = extractTransactionCandidates(detail);
      const matched = candidates.find((candidate) =>
        transactionMatchesPayment({ candidate, payment, settlement })
      );
      if (matched) {
        return {
          matched: true,
          providerSettlementId,
          providerSettledAt:
            readString(detail, ['settled_at', 'settlement_date', 'created_at']) ||
            readString(batch, ['settled_at', 'settlement_date', 'created_at']) ||
            null,
          transaction: matched,
          settlementBatch: batch,
          settlementDetail: detail,
        };
      }
    }
  }

  return { matched: false };
};

module.exports = {
  listSettlements,
  getSettlement,
  findSettledTransaction,
  transactionMatchesPayment,
};
