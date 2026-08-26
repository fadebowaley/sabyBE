const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const flutterwaveTransferLogSchema = mongoose.Schema(
  {
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentSettlement',
      index: true,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      index: true,
    },
    paymentReference: {
      type: String,
      index: true,
    },
    tenantId: {
      type: String,
      index: true,
    },
    // Request details
    request: {
      endpoint: String,
      method: String,
      payload: mongoose.Schema.Types.Mixed,
      reference: String,
      amount: Number,
      currency: String,
      accountNumber: String,
      bankCode: String,
      bankName: String,
      beneficiaryName: String,
    },
    // Response details
    response: {
      statusCode: Number,
      success: Boolean,
      status: String,
      message: String,
      providerTransferId: String,
      providerReference: String,
      flutterwaveStatus: String,
      transferFee: Number,
      transferAmount: Number,
      bankName: String,
      fullName: String,
      createdAt: String,
      completeMessage: String,
      requiresApproval: Boolean,
      isApproved: Boolean,
      raw: mongoose.Schema.Types.Mixed,
    },
    // Error details (if any)
    error: {
      code: String,
      message: String,
      stack: String,
      flutterwaveError: mongoose.Schema.Types.Mixed,
    },
    // Balance check details
    balanceCheck: {
      currency: String,
      requiredAmount: Number,
      availableBalance: Number,
      ledgerBalance: Number,
      available: Boolean,
      reason: String,
      checkedAt: Date,
    },
    // Transfer lifecycle
    lifecycle: {
      initiatedAt: Date,
      statusCheckedAt: [Date],
      completedAt: Date,
      failedAt: Date,
      retries: Number,
    },
    // Overall status
    status: {
      type: String,
      enum: [
        'initiated',
        'balance_check_failed',
        'transfer_failed',
        'transfer_queued',
        'processing',
        'successful',
        'failed',
        'reversed',
      ],
      default: 'initiated',
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

flutterwaveTransferLogSchema.index({ tenantId: 1, createdAt: -1 });
flutterwaveTransferLogSchema.index({ paymentReference: 1, createdAt: -1 });
flutterwaveTransferLogSchema.index({ 'request.reference': 1 });
flutterwaveTransferLogSchema.index({ 'response.providerTransferId': 1 });
flutterwaveTransferLogSchema.index({ status: 1, createdAt: -1 });

flutterwaveTransferLogSchema.plugin(toJSON);
flutterwaveTransferLogSchema.plugin(paginate);

const FlutterwaveTransferLog = mongoose.model(
  'FlutterwaveTransferLog',
  flutterwaveTransferLogSchema
);

module.exports = FlutterwaveTransferLog;