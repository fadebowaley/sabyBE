const {
  SUBSCRIPTION_METERED_PRICING,
  SUBSCRIPTION_GATEWAY_POLICY,
  buildSubscriptionCharge,
  getSubscriptionPlan,
  normalizeCurrency,
  roundAmount,
} = require('./subscriptionCatalog.service');

const getMeteredPrice = (meterId, currency) => {
  const meter = SUBSCRIPTION_METERED_PRICING[meterId];
  if (!meter) {
    return null;
  }
  const normalizedCurrency = normalizeCurrency(currency);
  const unitPrice = Number(meter.pricing?.[normalizedCurrency] || 0);
  return {
    meterId,
    unit: meter.unit,
    currency: normalizedCurrency,
    unitPrice: roundAmount(unitPrice, normalizedCurrency),
  };
};

const calculateMeteredOverage = ({ currency, usage = {} }) => {
  const normalizedCurrency = normalizeCurrency(currency);
  const lineItems = Object.entries(usage)
    .map(([meterId, quantity]) => {
      const price = getMeteredPrice(meterId, normalizedCurrency);
      const normalizedQuantity = Number(quantity || 0);
      if (!price || !Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
        return null;
      }
      const total = roundAmount(price.unitPrice * normalizedQuantity, normalizedCurrency);
      return {
        id: meterId,
        type: 'metered_overage',
        label: meterId.replace(/_/g, ' '),
        unit: price.unit,
        quantity: normalizedQuantity,
        unitPrice: price.unitPrice,
        total,
        currency: normalizedCurrency,
      };
    })
    .filter(Boolean);

  return {
    currency: normalizedCurrency,
    lineItems,
    total: roundAmount(
      lineItems.reduce((sum, lineItem) => sum + Number(lineItem.total || 0), 0),
      normalizedCurrency
    ),
  };
};

const calculateCollectionFee = ({ planId, amount, currency }) => {
  const plan = getSubscriptionPlan(planId);
  const normalizedCurrency = normalizeCurrency(currency);
  const numericAmount = Number(amount || 0);
  const feeConfig =
    SUBSCRIPTION_GATEWAY_POLICY.collectionFees?.[plan?.id] || null;

  if (!feeConfig || feeConfig.type === 'custom' || !Number.isFinite(numericAmount)) {
    return {
      amount: 0,
      currency: normalizedCurrency,
      type: feeConfig?.type || 'custom',
      config: feeConfig,
    };
  }

  const feeAmount =
    feeConfig.type === 'percent'
      ? roundAmount((numericAmount * Number(feeConfig.value || 0)) / 100, normalizedCurrency)
      : 0;

  return {
    amount: feeAmount,
    currency: normalizedCurrency,
    type: feeConfig.type,
    config: feeConfig,
  };
};

const calculateSettlementFee = ({ planId, amount, currency }) => {
  const plan = getSubscriptionPlan(planId);
  const normalizedCurrency = normalizeCurrency(currency);
  const numericAmount = Number(amount || 0);
  const feeConfig =
    SUBSCRIPTION_GATEWAY_POLICY.settlementFees?.[plan?.id] ||
    SUBSCRIPTION_GATEWAY_POLICY.settlementFees?.default ||
    null;

  if (!feeConfig || feeConfig.type === 'custom' || !Number.isFinite(numericAmount)) {
    return {
      amount: 0,
      currency: normalizedCurrency,
      type: feeConfig?.type || 'custom',
      config: feeConfig,
    };
  }

  const percentFee = (numericAmount * Number(feeConfig.percent || 0)) / 100;
  const fixedFee =
    normalizedCurrency === 'USD'
      ? Number(feeConfig.fixedUsd || 0)
      : Number(feeConfig.fixedNgn || 0);

  return {
    amount: roundAmount(percentFee + fixedFee, normalizedCurrency),
    currency: normalizedCurrency,
    type: feeConfig.type,
    config: feeConfig,
  };
};

const calculateRecurringSubscriptionCharge = ({
  planId,
  billingPeriod,
  currency,
  addonIds = [],
}) =>
  buildSubscriptionCharge({
    planId,
    billingPeriod,
    currency,
    addonIds,
  });

module.exports = {
  calculateRecurringSubscriptionCharge,
  calculateMeteredOverage,
  calculateCollectionFee,
  calculateSettlementFee,
  getMeteredPrice,
};
