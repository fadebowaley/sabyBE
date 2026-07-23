const httpStatus = require('http-status');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { Payment, TenantOnboarding, User } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const config = require('../config/config');
const paymentRemittanceService = require('./paymentRemittance.service');
const paymentEventService = require('./paymentEvent.service');
const emailService = require('./email.service');

const ALLOWED_STATUS_TRANSITIONS = {
  pending: ['processing', 'failed', 'cancelled'],
  processing: ['completed', 'failed', 'cancelled'],
  completed: ['refunded'],
  failed: [],
  cancelled: [],
  refunded: [],
};

const buildScopedFilter = (baseFilter = {}, tenantId) => {
  if (!tenantId) {
    return { ...baseFilter };
  }
  return { ...baseFilter, tenantId };
};

const sanitizePdfText = (value) =>
  String(value ?? '')
    .replace(/₦/g, 'NGN ')
    .replace(/[–—]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const formatPdfDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatPdfMoney = (amount, currency = 'NGN') =>
  `${String(currency || 'NGN').toUpperCase()} ${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const safeReferencePart = (value) =>
  String(value || 'document').replace(/[^a-zA-Z0-9._-]+/g, '-');

const resolveSabyLogoPath = () => {
  const candidates = [
    path.resolve(__dirname, '../../public/Sabyblack.png'),
    path.resolve(__dirname, '../../../sabyFrontend/apps/isomorphic/public/logos/saby-logo-main.png'),
    path.resolve(__dirname, '../../../sabyFrontend/apps/isomorphic/public/logo-primary-text.png'),
    path.resolve(__dirname, '../../../sabyFrontend/apps/isomorphic/public/saby-logo.png'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
};

const createPdfBuffer = (render) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: 42,
      bufferPages: false,
      info: {
        Creator: 'Saby',
        Producer: 'Saby Billing',
      },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    render(doc);
    doc.end();
  });

const fitText = (doc, text, x, y, options = {}) => {
  const width = options.width || 160;
  const fontSize = options.size || 9;
  const clean = sanitizePdfText(text);
  const textOptions = { ...options };
  delete textOptions.size;
  doc.fontSize(fontSize);
  let value = clean;
  while (value.length > 0 && doc.widthOfString(value) > width) {
    value = value.slice(0, -1);
  }
  if (value.length < clean.length) {
    value = `${value.slice(0, Math.max(0, value.length - 3))}...`;
  }
  doc.text(value, x, y, { ...textOptions, width, lineBreak: false });
};

const drawRule = (doc, y, x1 = 42, x2 = 570, color = '#dbe3ef') => {
  doc.save().strokeColor(color).lineWidth(0.7).moveTo(x1, y).lineTo(x2, y).stroke().restore();
};

const findPaymentUser = async (payment, projection = 'firstname lastname email phoneNumber') => {
  const userId = String(payment?.userId || '').trim();
  if (!userId) {
    return null;
  }

  if (/^[a-f\d]{24}$/i.test(userId)) {
    const user = await User.findById(userId).select(projection).lean();
    if (user) return user;
  }

  return User.findOne({ userId }).select(projection).lean();
};

const resolveBillingIdentity = async (payment) => {
  const [profile, owner] = await Promise.all([
    TenantOnboarding.findOne({ tenantId: payment.tenantId })
      .select('company owner')
      .lean(),
    findPaymentUser(payment),
  ]);
  const ownerName = [owner?.firstname, owner?.lastname].filter(Boolean).join(' ').trim();
  const company = profile?.company || {};
  return {
    billTo: [
      company.name || ownerName || payment.tenantId,
      company.address,
      [company.city, company.state].filter(Boolean).join(', '),
      company.country,
      company.email || owner?.email,
    ].filter(Boolean),
    issuer: [
      'Saby',
      'Subscription Billing',
      'Saby Managed Payment Rails',
      'billing@saby.io',
    ],
  };
};

const getPaymentReviewUrl = (payment) => {
  const base = String(config.payment?.returnBaseUrl || config.clientUrl || '').replace(/\/+$/, '');
  if (!base) return '';
  return `${base}/billing?payment_reference=${encodeURIComponent(payment.reference || '')}`;
};

const resolveInvoicePaymentUrl = (payment) => {
  const details = payment?.paymentDetails && typeof payment.paymentDetails === 'object'
    ? payment.paymentDetails
    : {};
  return (
    details.authorizationUrl ||
    details.authorization_url ||
    details.checkoutUrl ||
    details.checkout_url ||
    details.paymentUrl ||
    details.payment_url ||
    ''
  );
};

const getBillingPortalUrl = (payment) => {
  const base = String(config.payment?.returnBaseUrl || config.clientUrl || '').replace(/\/+$/, '');
  if (!base) return '';
  const reference = payment?.reference ? `?payment_reference=${encodeURIComponent(payment.reference)}` : '';
  return `${base}/billing${reference}`;
};

const resolvePaymentRecipient = async (payment) => {
  let user = await findPaymentUser(payment, 'firstname lastname email');

  if (!user && payment?.tenantId) {
    user = await User.findOne({ tenantId: payment.tenantId, isOwner: true })
      .select('firstname lastname email')
      .lean();
  }

  const email = String(user?.email || '').trim();
  if (!email) {
    return null;
  }

  const name =
    [user?.firstname, user?.lastname].filter(Boolean).join(' ').trim() ||
    'there';

  return { email, name };
};

const buildSubscriptionBillingEmail = ({ payment, document, status }) => {
  const metadata = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  const planName = metadata.planName || 'Saby';
  const billingPeriod = metadata.billingPeriod || 'monthly';
  const amount = formatPdfMoney(payment.total || payment.amount || 0, payment.currency);
  const billingUrl = getBillingPortalUrl(payment);
  const isSuccess = status === 'completed';
  const subject = isSuccess
    ? `Saby subscription confirmed - ${planName}`
    : `Saby subscription payment failed - ${planName}`;

  return {
    subject,
    preheader: isSuccess
      ? `Your ${planName} subscription is now active.`
      : `Your ${planName} subscription payment was not completed.`,
    layout: isSuccess ? 'billingReceipt' : 'billingFailure',
    label: isSuccess ? 'Payment receipt' : 'Billing attention required',
    icon: 'PAY',
    headline: isSuccess ? 'Your subscription is active.' : 'Payment could not be completed.',
    body: isSuccess
      ? [
          `Your Saby ${planName} subscription has been confirmed. Your workspace now has access to the features included in this plan.`,
          'We have attached your receipt for your records.',
        ]
      : [
          `We could not complete payment for your Saby ${planName} subscription. Your invoice is attached, and you can retry payment from your billing page.`,
          'If payment is not completed, access to paid features may be limited based on your workspace plan.',
        ],
    tone: isSuccess ? 'success' : 'danger',
    purpose: isSuccess ? 'subscription' : 'billing',
    detailsRows: [
      ['Plan', planName],
      ['Billing cycle', billingPeriod],
      [isSuccess ? 'Amount paid' : 'Amount due', amount],
      ['Reference', payment.reference],
      ...(isSuccess || !payment.failureReason ? [] : [['Reason', payment.failureReason]]),
    ],
    attachmentNote: isSuccess ? 'Receipt attached as PDF.' : 'Invoice attached as PDF.',
    nextStepTitle: isSuccess ? '' : 'Next step',
    nextStepBody: isSuccess ? '' : 'Retry payment from your billing page to keep paid workspace features active.',
    ctaLabel: billingUrl ? (isSuccess ? 'Open billing' : 'Retry payment') : '',
    ctaUrl: billingUrl,
    attachment: {
      filename: document.fileName,
      content: document.content,
      contentType: document.contentType || 'application/pdf',
    },
  };
};

const sendSubscriptionBillingNotification = async (payment, status) => {
  if (payment?.purpose !== 'subscription') {
    return;
  }
  if (!['completed', 'failed'].includes(status)) {
    return;
  }

  try {
    const recipient = await resolvePaymentRecipient(payment);
    if (!recipient) {
      logger.warn(
        `[Billing Email] No recipient found for subscription payment ${payment.reference}`
      );
      return;
    }

    const type = status === 'completed' ? 'receipt' : 'invoice';
    const document = await buildBillingPdf({ payment, type });
    const email = buildSubscriptionBillingEmail({
      payment,
      document: {
        fileName: `saby-${type}-${safeReferencePart(document.reference)}.pdf`,
        contentType: 'application/pdf',
        content: document.buffer,
      },
      status,
    });

    await emailService.sendSabyEmail({
      to: recipient.email,
      subject: email.subject,
      preheader: email.preheader,
      headline: email.headline,
      body: email.body,
      tone: email.tone,
      purpose: email.purpose,
      layout: email.layout,
      label: email.label,
      icon: email.icon,
      detailsRows: email.detailsRows,
      attachmentNote: email.attachmentNote,
      nextStepTitle: email.nextStepTitle,
      nextStepBody: email.nextStepBody,
      ctaLabel: email.ctaLabel,
      ctaUrl: email.ctaUrl,
      attachments: [email.attachment],
    });
  } catch (error) {
    logger.error(
      `[Billing Email] Failed to send subscription ${status} email for ${payment?.reference}: ${error.message}`
    );
  }
};

const isReceiptEligible = (payment) =>
  ['completed', 'refunded'].includes(String(payment?.status || '').trim().toLowerCase());

const resolveBillingDocumentType = (payment) =>
  isReceiptEligible(payment) ? 'receipt' : 'invoice';

const assertReceiptEligible = (payment) => {
  if (isReceiptEligible(payment)) return;
  throw new ApiError(
    httpStatus.CONFLICT,
    'Receipt is only available for completed payments. Download invoice instead.'
  );
};

const getLineItems = (payment) => {
  const metadata = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  const invoiceSnapshot =
    metadata.invoiceSnapshot && typeof metadata.invoiceSnapshot === 'object'
      ? metadata.invoiceSnapshot
      : {};
  const lineItems = Array.isArray(invoiceSnapshot.lineItems)
    ? invoiceSnapshot.lineItems
    : Array.isArray(metadata.lineItems)
      ? metadata.lineItems
      : [];
  if (lineItems.length) {
    return lineItems.map((item) => ({
      label: item.label || item.name || item.id || 'Subscription payment',
      period: metadata.billingPeriod ? `${metadata.billingPeriod} billing` : '',
      quantity: item.quantity || 1,
      unitPrice: Number(item.unitPrice ?? item.amount ?? 0),
      amount: Number(item.amount ?? 0),
    }));
  }
  return [
    {
      label: metadata.planName ? `${metadata.planName} subscription` : 'Saby subscription',
      period: metadata.billingPeriod ? `${metadata.billingPeriod} billing` : '',
      quantity: 1,
      unitPrice: Number(payment.total || payment.amount || 0),
      amount: Number(payment.total || payment.amount || 0),
    },
  ];
};

const buildBillingPdf = async ({ payment, type }) => {
  const metadata = payment.metadata && typeof payment.metadata === 'object' ? payment.metadata : {};
  const identity = await resolveBillingIdentity(payment);
  const currency = payment.currency || metadata.currency || 'NGN';
  const paidAt = payment.completedAt || payment.paymentDate || payment.createdAt || new Date();
  const dueAt = payment.createdAt || payment.paymentDate || new Date();
  const isReceipt = type === 'receipt';
  const actionUrl = isReceipt ? getPaymentReviewUrl(payment) : resolveInvoicePaymentUrl(payment);
  const receiptNumber = String(payment.providerRef || payment.reference || payment.id || payment._id || '').replace(/^SUB-/, '');
  const lineItems = getLineItems(payment);
  const subtotal = Number(metadata.subtotal ?? payment.amount ?? payment.total ?? 0);
  const discount = Number(metadata.discount || 0) + Number(metadata.credits || 0);
  const tax = Number(metadata.tax || 0);
  const total = Number(payment.total || payment.amount || subtotal + tax - discount);
  const reference = payment.reference || String(payment._id || payment.id);
  const actionLabel = isReceipt ? 'Review payment' : 'Pay invoice';
  const logoPath = resolveSabyLogoPath();
  const buffer = await createPdfBuffer((doc) => {
    const left = 42;
    const right = 570;
    const contentWidth = right - left;
    const muted = '#64748b';
    const ink = '#0f172a';

    doc.rect(0, 0, 612, 72).fill('#ffffff');
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(20).text(isReceipt ? 'Receipt' : 'Invoice', left, 38);
    if (logoPath) {
      doc.image(logoPath, right - 66, 28, { width: 66 });
    } else {
      doc.roundedRect(right - 58, 30, 58, 24, 7).fill('#5170ff');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('Saby', right - 45, 37, { width: 45 });
    }

    const metaRows = isReceipt
      ? [
          ['Invoice number', reference],
          ['Receipt number', receiptNumber || reference],
          ['Date paid', formatPdfDate(paidAt)],
        ]
      : [
          ['Invoice number', reference],
          ['Date of issue', formatPdfDate(dueAt)],
          ['Date due', formatPdfDate(dueAt)],
        ];
    let y = 96;
    metaRows.forEach(([label, value]) => {
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(8.5).text(label, left, y, { width: 92 });
      fitText(doc.font('Helvetica-Bold'), value, left + 105, y, { width: 245, size: 8.5 });
      y += 14;
    });

    y = 158;
    doc.roundedRect(left, y, contentWidth, 88, 12).fill('#f8fafc');
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text('FROM', left + 16, y + 15);
    doc.fillColor(muted).font('Helvetica-Bold').fontSize(8).text('BILL TO', left + 280, y + 15);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(9);
    identity.issuer.slice(0, 5).forEach((line, index) => {
      doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fillColor(index === 0 ? ink : '#334155');
      fitText(doc, line, left + 16, y + 31 + index * 11, { width: 220, size: 8.3 });
    });
    identity.billTo.slice(0, 5).forEach((line, index) => {
      doc.font(index === 0 ? 'Helvetica-Bold' : 'Helvetica').fillColor(index === 0 ? ink : '#334155');
      fitText(doc, line, left + 280, y + 31 + index * 11, { width: 225, size: 8.3 });
    });

    y = 276;
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(14).text(
      isReceipt
        ? `${formatPdfMoney(total, currency)} paid on ${formatPdfDate(paidAt)}`
        : `${formatPdfMoney(total, currency)} due ${formatPdfDate(dueAt)}`,
      left,
      y,
      { width: 440 }
    );
    if (actionUrl) {
      doc.fillColor('#304ffe').font('Helvetica-Bold').fontSize(9).text(actionLabel, left, y + 27, {
        link: actionUrl,
        underline: true,
        width: 110,
      });
    }

    y = 338;
    doc.roundedRect(left, y - 12, contentWidth, 25, 8).fill('#eef4ff');
    doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8).text('Description', left + 10, y - 4);
    doc.text('Qty', left + 340, y - 4, { width: 34, align: 'right' });
    doc.text('Unit price', left + 378, y - 4, { width: 74, align: 'right' });
    doc.text('Amount', left + 457, y - 4, { width: 69, align: 'right' });
    y += 24;

    lineItems.slice(0, 5).forEach((item) => {
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(8.8);
      fitText(doc, item.label, left + 10, y, { width: 300, size: 8.8 });
      if (item.period) {
        doc.fillColor(muted).font('Helvetica').fontSize(7.6);
        fitText(doc, item.period, left + 10, y + 12, { width: 300, size: 7.6 });
      }
      doc.fillColor(ink).font('Helvetica').fontSize(8.5);
      doc.text(String(item.quantity || 1), left + 340, y, { width: 34, align: 'right' });
      doc.text(formatPdfMoney(item.unitPrice, currency), left + 378, y, { width: 74, align: 'right' });
      doc.text(formatPdfMoney(item.amount, currency), left + 457, y, { width: 69, align: 'right' });
      drawRule(doc, y + 25, left, right, '#e5edf6');
      y += 34;
    });

    const totalRows = [
      ['Subtotal', subtotal],
      ...(discount > 0 ? [['Discount/Credit', -discount]] : []),
      ...(tax > 0 ? [['Tax', tax]] : []),
      ['Total', total],
      [isReceipt ? 'Amount paid' : 'Amount due', total],
    ];
    y = Math.max(y + 4, isReceipt ? 400 : 430);
    totalRows.forEach(([label, amount], index) => {
      const isFinal = index === totalRows.length - 1;
      drawRule(doc, y - 5, 330, right, '#dbe3ef');
      doc.fillColor(ink).font(isFinal ? 'Helvetica-Bold' : 'Helvetica').fontSize(isFinal ? 9 : 8.3);
      doc.text(label, 330, y, { width: 110 });
      doc.text(formatPdfMoney(amount, currency), 442, y, { width: 128, align: 'right' });
      y += 15;
    });

    if (isReceipt) {
      y = Math.max(y + 20, 520);
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('Payment history', left, y);
      y += 31;
      doc.roundedRect(left, y - 12, contentWidth, 25, 8).fill('#eef4ff');
      doc.fillColor('#475569').font('Helvetica-Bold').fontSize(8);
      doc.text('Payment method', left + 10, y - 4);
      doc.text('Date', left + 235, y - 4);
      doc.text('Amount paid', left + 330, y - 4, { width: 82, align: 'right' });
      doc.text('Receipt', left + 450, y - 4);
      y += 26;
      doc.fillColor(ink).font('Helvetica').fontSize(8.6);
      fitText(doc, payment.paymentMethod || '-', left + 10, y, { width: 185, size: 8.6 });
      doc.text(formatPdfDate(paidAt), left + 235, y);
      doc.text(formatPdfMoney(total, currency), left + 330, y, { width: 82, align: 'right' });
      fitText(doc, receiptNumber || reference, left + 450, y, { width: 78, size: 8.4 });
    }

    drawRule(doc, 724, left, right);
    doc.fillColor(muted).font('Helvetica').fontSize(7.5).text('Generated by Saby billing', left, 738);
    doc.text('Page 1 of 1', right - 80, 738, { width: 80, align: 'right' });
  });

  return {
    buffer,
    reference: payment.reference || String(payment.id || payment._id),
  };
};

const assertStatusTransition = (payment, nextStatus) => {
  if (!nextStatus || payment.status === nextStatus) {
    return;
  }

  const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[payment.status] || [];
  if (!allowedTransitions.includes(nextStatus)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Invalid payment status transition: ${payment.status} -> ${nextStatus}`
    );
  }
};

const applyStatusTimestamps = (payment, status) => {
  const now = new Date();
  if (status === 'processing') {
    payment.processedAt = now;
  }
  if (status === 'completed') {
    payment.completedAt = now;
  }
  if (status === 'cancelled') {
    payment.cancelledAt = now;
  }
  if (status === 'refunded') {
    payment.refundedAt = now;
  }
  if (status === 'failed') {
    payment.failedAt = now;
  }
};

const validatePaymentAmounts = (paymentBody) => {
  if (
    typeof paymentBody.amount === 'number' &&
    typeof paymentBody.total === 'number' &&
    paymentBody.total < paymentBody.amount
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'total amount cannot be less than amount'
    );
  }
};

/**
 * Create a new payment
 * @param {Object} paymentBody
 * @returns {Promise<Payment>}
 */
const createPayment = async (paymentBody) => {
  validatePaymentAmounts(paymentBody);
  try {
    const payment = await Payment.create(paymentBody);
    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'created',
      fromStatus: null,
      toStatus: payment.status,
      userId: payment.userId,
      source: 'api',
      dedupeKey: `payment-created:${payment.id}`,
      metadata: {
        purpose: payment.purpose,
        beneficiaryType: payment.beneficiaryType,
        amount: payment.amount,
        total: payment.total,
        currency: payment.currency,
      },
    });
    return payment;
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.reference) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Payment with this reference already exists'
      );
    }
    if (error?.code === 11000 && error?.keyPattern?.idempotencyKey) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Duplicate idempotency key for this tenant'
      );
    }
    throw error;
  }
};

/**
 * Create payment with idempotency support
 * @param {Object} paymentBody
 * @returns {Promise<{payment: Payment, created: boolean}>}
 */
const createOrGetPayment = async (paymentBody) => {
  validatePaymentAmounts(paymentBody);
  const { tenantId, idempotencyKey } = paymentBody;

  if (tenantId && idempotencyKey) {
    const existingPayment = await Payment.findOne({ tenantId, idempotencyKey });
    if (existingPayment) {
      return { payment: existingPayment, created: false };
    }
  }

  try {
    const payment = await createPayment(paymentBody);
    return { payment, created: true };
  } catch (error) {
    if (tenantId && idempotencyKey && error?.code === 11000 && error?.keyPattern?.idempotencyKey) {
      const existingPayment = await Payment.findOne({ tenantId, idempotencyKey });
      if (existingPayment) {
        return { payment: existingPayment, created: false };
      }
    }
    throw error;
  }
};

/**
 * Get payment by id
 * @param {ObjectId} id
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const getPaymentById = async (id, tenantId) => {
  const payment = await Payment.findOne(
    buildScopedFilter({ _id: id }, tenantId)
  );
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  return payment;
};

/**
 * Get payment by reference
 * @param {string} reference
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const getPaymentByReference = async (reference, tenantId) => {
  const payment = await Payment.findOne(
    buildScopedFilter({ reference }, tenantId)
  );
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  return payment;
};

/**
 * Update payment by id
 * @param {ObjectId} paymentId
 * @param {Object} updateBody
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const updatePaymentById = async (
  paymentId,
  updateBody,
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  const previousStatus = payment.status;
  if (updateBody.status) {
    assertStatusTransition(payment, updateBody.status);
    applyStatusTimestamps(payment, updateBody.status);
  }

  const nextAmount =
    typeof updateBody.amount === 'number' ? updateBody.amount : payment.amount;
  const nextTotal =
    typeof updateBody.total === 'number' ? updateBody.total : payment.total;
  if (
    typeof nextAmount === 'number' &&
    typeof nextTotal === 'number' &&
    nextTotal < nextAmount
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'total amount cannot be less than amount'
    );
  }

  Object.assign(payment, updateBody);
  await payment.save();

  if (updateBody.status && updateBody.status !== previousStatus) {
    await paymentEventService.appendPaymentEvent({
      tenantId: payment.tenantId,
      payment,
      eventType: 'status_changed',
      fromStatus: previousStatus,
      toStatus: payment.status,
      userId: context.userId || payment.userId,
      source: context.source || 'api',
      sourceRef: context.sourceRef || null,
      dedupeKey:
        context.dedupeKey ||
        `status-change:${payment.id}:${previousStatus}->${payment.status}:${Date.now()}`,
      metadata: {
        reason:
          updateBody.failureReason ||
          updateBody.cancellationReason ||
          context.reason ||
        null,
      },
    });

    if (payment.purpose === 'subscription' && payment.status === 'failed') {
      await sendSubscriptionBillingNotification(payment, 'failed');
    }
  }

  return payment;
};

/**
 * Delete payment by id
 * @param {ObjectId} paymentId
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const deletePaymentById = async (paymentId, tenantId) => {
  const payment = await getPaymentById(paymentId, tenantId);
  await payment.remove();
  return payment;
};

/**
 * Query for payments
 * @param {Object} filter - Mongoose filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {string} [tenantId]
 * @returns {Promise<QueryResult>}
 */
const queryPayments = async (filter, options, tenantId) =>
  Payment.paginate(buildScopedFilter(filter, tenantId), options);

/**
 * Get payments by status
 * @param {string} status - Payment status
 * @param {string} [tenantId]
 * @returns {Promise<Array<Payment>>}
 */
const getPaymentsByStatus = async (status, tenantId) =>
  Payment.find(buildScopedFilter({ status }, tenantId));

/**
 * Get payments by user
 * @param {string} userId
 * @param {string} [tenantId]
 * @returns {Promise<Array<Payment>>}
 */
const getPaymentsByUser = async (userId, tenantId) =>
  Payment.find(buildScopedFilter({ userId }, tenantId));

/**
 * Process payment
 * @param {ObjectId} paymentId
 * @param {Object} paymentDetails
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const processPayment = async (
  paymentId,
  paymentDetails = {},
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'processing');
  const previousStatus = payment.status;

  payment.status = 'processing';
  applyStatusTimestamps(payment, 'processing');
  payment.paymentDetails = {
    ...payment.paymentDetails,
    ...(paymentDetails.paymentDetails || paymentDetails),
  };
  if (paymentDetails.providerRef) {
    payment.providerRef = paymentDetails.providerRef;
  }
  if (paymentDetails.metadata) {
    payment.metadata = { ...payment.metadata, ...paymentDetails.metadata };
  }

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'processing_started',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey:
      context.dedupeKey || `processing-started:${payment.id}:${payment.status}`,
    metadata: {
      providerRef: payment.providerRef || null,
    },
  });
  return payment;
};

/**
 * Complete payment
 * @param {ObjectId} paymentId
 * @param {Object} completionDetails
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const completePayment = async (
  paymentId,
  completionDetails = {},
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'completed');
  const previousStatus = payment.status;

  payment.status = 'completed';
  applyStatusTimestamps(payment, 'completed');
  payment.completionDetails = {
    ...payment.completionDetails,
    ...(completionDetails.completionDetails || completionDetails),
  };
  if (completionDetails.providerRef) {
    payment.providerRef = completionDetails.providerRef;
  }
  if (completionDetails.metadata) {
    payment.metadata = { ...payment.metadata, ...completionDetails.metadata };
  }

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'completed',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey: context.dedupeKey || `payment-completed:${payment.id}`,
    metadata: {
      providerRef: payment.providerRef || null,
    },
  });

  try {
    await paymentRemittanceService.enqueueIfEligible(payment, {
      trigger: 'payment.service.completePayment',
    });
  } catch (error) {
    logger.error(
      `[Payment Remittance] Failed to queue remittance for payment ${payment.reference}: ${error.message}`
    );
  }

  await sendSubscriptionBillingNotification(payment, 'completed');

  return payment;
};

/**
 * Cancel payment
 * @param {ObjectId} paymentId
 * @param {string} reason
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const cancelPayment = async (paymentId, reason, tenantId, context = {}) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'cancelled');
  const previousStatus = payment.status;

  payment.status = 'cancelled';
  applyStatusTimestamps(payment, 'cancelled');
  payment.cancellationReason = reason;

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'cancelled',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey: context.dedupeKey || `payment-cancelled:${payment.id}`,
    metadata: {
      reason: reason || null,
    },
  });
  return payment;
};

/**
 * Refund payment
 * @param {ObjectId} paymentId
 * @param {Object} refundDetails
 * @param {string} [tenantId]
 * @returns {Promise<Payment>}
 */
const refundPayment = async (
  paymentId,
  refundDetails = {},
  tenantId,
  context = {}
) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertStatusTransition(payment, 'refunded');
  const previousStatus = payment.status;

  if (
    typeof refundDetails.amount === 'number' &&
    Number(refundDetails.amount) !== Number(payment.total)
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Partial refunds are not supported in this flow; refund amount must match total'
    );
  }

  payment.status = 'refunded';
  applyStatusTimestamps(payment, 'refunded');
  payment.refundDetails = {
    ...payment.refundDetails,
    ...(refundDetails.refundDetails || refundDetails),
  };
  if (refundDetails.reason) {
    payment.refundDetails.reason = refundDetails.reason;
  }
  if (refundDetails.amount) {
    payment.refundDetails.amount = refundDetails.amount;
  }
  if (refundDetails.metadata) {
    payment.metadata = { ...payment.metadata, ...refundDetails.metadata };
  }

  await payment.save();
  await paymentEventService.appendPaymentEvent({
    tenantId: payment.tenantId,
    payment,
    eventType: 'refunded',
    fromStatus: previousStatus,
    toStatus: payment.status,
    userId: context.userId || payment.userId,
    source: context.source || 'api',
    sourceRef: context.sourceRef || null,
    dedupeKey: context.dedupeKey || `payment-refunded:${payment.id}`,
    metadata: {
      reason: payment.refundDetails?.reason || null,
      amount: payment.refundDetails?.amount || null,
    },
  });
  return payment;
};

/**
 * Generate payment receipt
 * @param {ObjectId} paymentId
 * @param {string} [tenantId]
 * @returns {Promise<Object>} - PDF receipt document
 */
const generatePaymentReceipt = async (paymentId, tenantId) => {
  const payment = await getPaymentById(paymentId, tenantId);
  assertReceiptEligible(payment);
  const document = await buildBillingPdf({ payment, type: 'receipt' });
  return {
    fileName: `saby-receipt-${safeReferencePart(document.reference)}.pdf`,
    contentType: 'application/pdf',
    content: document.buffer,
  };
};

const generatePaymentReceiptByReference = async (reference, tenantId) => {
  const payment = await getPaymentByReference(reference, tenantId);
  assertReceiptEligible(payment);
  const document = await buildBillingPdf({ payment, type: 'receipt' });
  return {
    fileName: `saby-receipt-${safeReferencePart(document.reference)}.pdf`,
    contentType: 'application/pdf',
    content: document.buffer,
  };
};

const generatePaymentInvoice = async (paymentId, tenantId) => {
  const payment = await getPaymentById(paymentId, tenantId);
  const document = await buildBillingPdf({ payment, type: 'invoice' });
  return {
    fileName: `saby-invoice-${safeReferencePart(document.reference)}.pdf`,
    contentType: 'application/pdf',
    content: document.buffer,
  };
};

const generatePaymentInvoiceByReference = async (reference, tenantId) => {
  const payment = await getPaymentByReference(reference, tenantId);
  const document = await buildBillingPdf({ payment, type: 'invoice' });
  return {
    fileName: `saby-invoice-${safeReferencePart(document.reference)}.pdf`,
    contentType: 'application/pdf',
    content: document.buffer,
  };
};

const buildBillingDocumentResponse = async (payment) => {
  const type = resolveBillingDocumentType(payment);
  const document = await buildBillingPdf({ payment, type });
  return {
    type,
    fileName: `saby-${type}-${safeReferencePart(document.reference)}.pdf`,
    contentType: 'application/pdf',
    content: document.buffer,
  };
};

const generatePaymentBillingDocument = async (paymentId, tenantId) => {
  const payment = await getPaymentById(paymentId, tenantId);
  return buildBillingDocumentResponse(payment);
};

const generatePaymentBillingDocumentByReference = async (reference, tenantId) => {
  const payment = await getPaymentByReference(reference, tenantId);
  return buildBillingDocumentResponse(payment);
};

module.exports = {
  createPayment,
  createOrGetPayment,
  getPaymentById,
  getPaymentByReference,
  updatePaymentById,
  deletePaymentById,
  queryPayments,
  getPaymentsByStatus,
  getPaymentsByUser,
  processPayment,
  completePayment,
  cancelPayment,
  refundPayment,
  generatePaymentInvoice,
  generatePaymentInvoiceByReference,
  generatePaymentBillingDocument,
  generatePaymentBillingDocumentByReference,
  generatePaymentReceipt,
  generatePaymentReceiptByReference,
  isReceiptEligible,
  resolveBillingDocumentType,
  resolveInvoicePaymentUrl,
};
