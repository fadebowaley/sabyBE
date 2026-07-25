const httpStatus = require('http-status');
const validator = require('validator');
const config = require('../config/config');
const ApiError = require('../utils/ApiError');

const PROVIDER_CONFIG = config.payment?.providers || {};
const FLUTTERWAVE_SUPPORTED_CURRENCIES = new Set(['NGN', 'USD', 'GBP']);
const FLUTTERWAVE_PAYMENT_OPTIONS_BY_CURRENCY = {
  NGN: {
    card: 'card',
    bank_transfer: 'banktransfer',
    transfer: 'banktransfer',
    account: 'account',
    ussd: 'ussd',
  },
  USD: {
    card: 'card',
  },
  GBP: {
    card: 'card',
  },
};
const FLUTTERWAVE_DEFAULT_OPTIONS_BY_CURRENCY = {
  NGN: ['card', 'bank_transfer', 'ussd'],
  USD: ['card'],
  GBP: ['card'],
};

const normalizeProvider = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const normalizePublicReturnUrl = ({ payment, respondentContext = {} }) => {
  const explicit = String(
    respondentContext?.returnUrl ||
      respondentContext?.callbackUrl ||
      ''
  ).trim();
  const configuredBase = String(config.payment?.returnBaseUrl || '').trim();
  const metadata = payment?.metadata || {};
  const shareRef = String(metadata.shareRef || '').trim();
  const publicRef = String(metadata.publicRef || '').trim();

  if (explicit) {
    try {
      const url = new URL(explicit);
      url.hash = '';
      return url;
    } catch (_) {
      // Fall back to canonical public URL below.
    }
  }

  if (!configuredBase) {
    return null;
  }

  try {
    const url = new URL(configuredBase);
    if (shareRef) {
      url.pathname = `/s/${encodeURIComponent(shareRef)}`;
    } else if (publicRef) {
      url.pathname = `/go/${encodeURIComponent(publicRef)}`;
    }
    url.hash = '';
    return url;
  } catch (_) {
    return null;
  }
};

const buildReturnUrl = ({ payment, respondentContext = {} }) => {
  const url = normalizePublicReturnUrl({ payment, respondentContext });
  if (!url) return null;
  url.searchParams.set('payment_reference', String(payment.reference || ''));
  url.searchParams.set('payment_id', String(payment._id || payment.id || ''));
  return url.toString();
};

const toMinorAmount = (amount, currency) => {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Payment amount must be greater than zero.'
    );
  }
  const zeroDecimalCurrencies = new Set(['JPY']);
  if (zeroDecimalCurrencies.has(String(currency || '').toUpperCase())) {
    return Math.round(numeric);
  }
  return Math.round(numeric * 100);
};

const normalizeCustomerIdentity = (customer = {}) => {
  const email = String(customer.email || '').trim().toLowerCase();
  const fullName = String(customer.fullName || '').trim();
  const phone = String(customer.phone || '').trim();

  return {
    email: email && validator.isEmail(email) ? email : null,
    invalidEmail: Boolean(email && !validator.isEmail(email)),
    fullName: fullName || null,
    phone: phone || null,
  };
};

const assertValidCheckoutCustomer = ({ provider, customer }) => {
  if (customer.invalidEmail) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${provider} checkout requires a valid customer email address.`
    );
  }
  if (!customer.email) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${provider} checkout requires a customer email address. Add an email field or map the email in form settings before collecting payment.`
    );
  }
};

const normalizeFlutterwavePaymentOptions = ({
  enabledChannels = [],
  currency,
}) => {
  const normalizedCurrency = String(currency || '').trim().toUpperCase();
  if (!FLUTTERWAVE_SUPPORTED_CURRENCIES.has(normalizedCurrency)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Flutterwave collection is not enabled for ${normalizedCurrency || 'this currency'} in this runtime.`
    );
  }

  const methodMap = FLUTTERWAVE_PAYMENT_OPTIONS_BY_CURRENCY[normalizedCurrency] || {};
  const requestedChannels = (Array.isArray(enabledChannels) ? enabledChannels : [])
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);
  const effectiveChannels = requestedChannels.some((entry) =>
    ['flutterwave', 'paystack', 'sabypay'].includes(entry)
  )
    ? FLUTTERWAVE_DEFAULT_OPTIONS_BY_CURRENCY[normalizedCurrency] || ['card']
    : requestedChannels;
  const options = Array.from(
    new Set(
      effectiveChannels
        .map((entry) => methodMap[entry] || null)
        .filter(Boolean)
    )
  );

  if (!options.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `No supported Flutterwave collection method is configured for ${normalizedCurrency}.`
    );
  }

  return options.join(',');
};

const initializePaystackCheckout = async ({
  payment,
  customer,
  invoiceSnapshot,
  respondentContext = {},
}) => {
  const secretKey = String(PROVIDER_CONFIG?.paystack?.secretKey || '').trim();
  if (!secretKey) {
    return {
      supported: false,
      provider: 'paystack',
      status: 'provider_not_configured',
      message: 'Paystack credentials are not configured for this environment.',
    };
  }

  assertValidCheckoutCustomer({ provider: 'Paystack', customer });

  const callbackUrl = buildReturnUrl({ payment, respondentContext });
  const payload = {
    email: customer.email,
    amount: toMinorAmount(payment.total, payment.currency),
    currency: String(payment.currency || 'NGN').toUpperCase(),
    reference: String(payment.reference || ''),
    metadata: {
      paymentId: String(payment._id || payment.id || ''),
      tenantId: String(payment.tenantId || ''),
      submissionId: String(payment.submissionId || ''),
      projectFormId: payment?.metadata?.projectFormId || null,
      invoiceTotal: Number(invoiceSnapshot?.total || payment.total || 0),
    },
  };

  if (customer.fullName) {
    payload.metadata.customerName = customer.fullName;
  }
  if (customer.phone) {
    payload.metadata.customerPhone = customer.phone;
  }
  if (callbackUrl) {
    payload.callback_url = callbackUrl;
  }

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status === false) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      data?.message || 'Failed to initialize Paystack checkout.'
    );
  }

  return {
    supported: true,
    provider: 'paystack',
    status: 'initialized',
    authorizationUrl: data?.data?.authorization_url || null,
    accessCode: data?.data?.access_code || null,
    providerRef: data?.data?.reference || null,
    message: 'Paystack checkout initialized.',
    raw: data?.data || data,
  };
};

const initializeFlutterwaveCheckout = async ({
  payment,
  customer,
  invoiceSnapshot,
  respondentContext = {},
}) => {
  const secretKey = String(PROVIDER_CONFIG?.flutterwave?.secretKey || '').trim();
  if (!secretKey) {
    return {
      supported: false,
      provider: 'flutterwave',
      status: 'provider_not_configured',
      message: 'Flutterwave credentials are not configured for this environment.',
    };
  }

  assertValidCheckoutCustomer({ provider: 'Flutterwave', customer });

  const redirectUrl = buildReturnUrl({ payment, respondentContext });
  if (!redirectUrl) {
    return {
      supported: false,
      provider: 'flutterwave',
      status: 'return_url_missing',
      message: 'Flutterwave checkout requires a valid return URL.',
    };
  }

  const payload = {
    tx_ref: String(payment.reference || ''),
    amount: Number(payment.total || payment.amount || 0),
    currency: String(payment.currency || 'NGN').toUpperCase(),
    redirect_url: redirectUrl,
    customer: {
      email: customer.email,
      name: customer.fullName || 'Saby Customer',
      phonenumber: customer.phone || undefined,
    },
    customizations: {
      title: payment?.metadata?.checkoutTitle || 'Form Payment',
      description:
        payment?.metadata?.checkoutDescription ||
        payment?.metadata?.projectName ||
        'Public form checkout',
    },
    meta: {
      paymentId: String(payment._id || payment.id || ''),
      tenantId: String(payment.tenantId || ''),
      submissionId: String(payment.submissionId || ''),
      projectFormId: payment?.metadata?.projectFormId || null,
      invoiceTotal: Number(invoiceSnapshot?.total || payment.total || 0),
    },
  };

  const configuredPaymentOptions =
    payment?.metadata?.collectionPlan?.providerConfig?.paymentOptions ||
    payment?.metadata?.collectionPlan?.providerConfig?.enabledMethods ||
    payment?.metadata?.collectionPlan?.enabledChannels ||
    ['card'];
  const paymentOptions = normalizeFlutterwavePaymentOptions({
    enabledChannels: configuredPaymentOptions,
    currency: payload.currency,
  });
  payload.payment_options = paymentOptions;

  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text().catch(() => '');
  console.log('[Flutterwave] Response status:', response.status);
  console.log('[Flutterwave] cf-mitigated:', response.headers.get('cf-mitigated') || 'N/A');
  console.log('[Flutterwave] cf-ray:', response.headers.get('cf-ray') || 'N/A');
  console.log('[Flutterwave] Raw response (first 500 chars):', rawText.substring(0, 500));

  let data;
  try {
    data = JSON.parse(rawText);
  } catch (_) {
    data = {};
    console.log('[Flutterwave] Response is NOT valid JSON — likely Cloudflare challenge page');
  }

  if (!response.ok || data?.status !== 'success') {
    console.log('[Flutterwave] FAILED — status:', response.status, 'message:', data?.message || 'No message');
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      data?.message || 'Failed to initialize Flutterwave checkout.'
    );
  }

  return {
    supported: true,
    provider: 'flutterwave',
    status: 'initialized',
    authorizationUrl: data?.data?.link || null,
    accessCode: null,
    providerRef: data?.data?.id ? String(data.data.id) : null,
    message: 'Flutterwave checkout initialized.',
    raw: data?.data || data,
  };
};

const verifyFlutterwaveTransaction = async ({
  transactionId = null,
  txRef = null,
}) => {
  const secretKey = String(PROVIDER_CONFIG?.flutterwave?.secretKey || '').trim();
  if (!secretKey) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Flutterwave credentials are not configured for this environment.'
    );
  }

  const id = String(transactionId || '').trim();
  const reference = String(txRef || '').trim();
  const url = id
    ? `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(id)}/verify`
    : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`;

  if (!id && !reference) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Flutterwave verification requires transaction_id or tx_ref.'
    );
  }

  const response = await fetch(url, {
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
      data?.message || 'Failed to verify Flutterwave transaction.'
    );
  }

  const tx = data?.data || {};
  return {
    provider: 'flutterwave',
    providerRef: tx?.id ? String(tx.id) : null,
    txRef: tx?.tx_ref ? String(tx.tx_ref) : null,
    status: String(tx?.status || '').trim().toLowerCase(),
    amount: Number(tx?.amount || 0),
    chargedAmount: Number(tx?.charged_amount || tx?.amount || 0),
    currency: String(tx?.currency || '').trim().toUpperCase(),
    paymentType: tx?.payment_type ? String(tx.payment_type) : null,
    customer: tx?.customer || null,
    raw: tx,
  };
};

const normalizePaystackStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'success' ? 'successful' : normalized;
};

const verifyPaystackTransaction = async ({ txRef = null }) => {
  const secretKey = String(PROVIDER_CONFIG?.paystack?.secretKey || '').trim();
  if (!secretKey) {
    throw new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      'Paystack credentials are not configured for this environment.'
    );
  }

  const reference = String(txRef || '').trim();
  if (!reference) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Paystack verification requires a payment reference.'
    );
  }

  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.status !== true) {
    throw new ApiError(
      httpStatus.BAD_GATEWAY,
      data?.message || 'Failed to verify Paystack transaction.'
    );
  }

  const tx = data?.data || {};
  const currency = String(tx?.currency || '').trim().toUpperCase();
  return {
    provider: 'paystack',
    providerRef: tx?.id ? String(tx.id) : null,
    txRef: tx?.reference ? String(tx.reference) : reference,
    status: normalizePaystackStatus(tx?.status),
    amount: Number(tx?.amount || 0) / 100,
    chargedAmount: Number(tx?.amount || 0) / 100,
    currency,
    paymentType: tx?.channel ? String(tx.channel) : null,
    customer: tx?.customer || null,
    raw: tx,
  };
};

const verifyTransaction = async ({
  provider,
  transactionId = null,
  txRef = null,
}) => {
  const normalizedProvider = normalizeProvider(provider);
  if (normalizedProvider === 'flutterwave') {
    return verifyFlutterwaveTransaction({ transactionId, txRef });
  }
  if (normalizedProvider === 'paystack') {
    return verifyPaystackTransaction({ txRef });
  }

  throw new ApiError(
    httpStatus.BAD_REQUEST,
    `${normalizedProvider || 'This provider'} transaction verification is not wired yet.`
  );
};

const initializeHostedCheckout = async ({
  payment,
  paymentMethod,
  customer = {},
  invoiceSnapshot = null,
  respondentContext = {},
}) => {
  const provider = normalizeProvider(paymentMethod);
  const normalizedCustomer = normalizeCustomerIdentity(customer);

  if (provider === 'paystack') {
    return initializePaystackCheckout({
      payment,
      customer: normalizedCustomer,
      invoiceSnapshot,
      respondentContext,
    });
  }

  if (provider === 'flutterwave') {
    return initializeFlutterwaveCheckout({
      payment,
      customer: normalizedCustomer,
      invoiceSnapshot,
      respondentContext,
    });
  }

  return {
    supported: false,
    provider,
    status: 'provider_not_supported',
    message: `${provider || 'This payment channel'} is not wired to hosted checkout yet.`,
  };
};

module.exports = {
  initializeHostedCheckout,
  verifyTransaction,
  normalizeFlutterwavePaymentOptions,
};
