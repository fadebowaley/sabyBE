const {
  transactionMatchesPayment,
} = require('../services/flutterwaveSettlement.service');

const payment = {
  reference: 'COL-MT8EVHUP-36292146',
  providerRef: '2083796649',
  total: 107.4,
  currency: 'NGN',
};

const settlement = {
  amount: 107.4,
  currency: 'NGN',
};

describe('flutterwaveSettlement.service transaction matching', () => {
  test('matches a settled Flutterwave transaction when provider fees change its settlement amounts', () => {
    expect(
      transactionMatchesPayment({
        payment,
        settlement,
        candidate: {
          id: 2083796649,
          tx_ref: 'COL-MT8EVHUP-36292146',
          currency: 'NGN',
          status: 'successful',
          charged_amount: 109.55,
          settlement_amount: 107.23,
        },
      })
    ).toBe(true);
  });

  test('rejects a transaction with the wrong currency or a non-successful status', () => {
    expect(
      transactionMatchesPayment({
        payment,
        settlement,
        candidate: {
          id: 2083796649,
          tx_ref: 'COL-MT8EVHUP-36292146',
          currency: 'USD',
          status: 'successful',
        },
      })
    ).toBe(false);

    expect(
      transactionMatchesPayment({
        payment,
        settlement,
        candidate: {
          id: 2083796649,
          tx_ref: 'COL-MT8EVHUP-36292146',
          currency: 'NGN',
          status: 'failed',
        },
      })
    ).toBe(false);
  });
});