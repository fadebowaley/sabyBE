const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
const mockVerify = jest.fn().mockResolvedValue(true);

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: mockVerify,
    sendMail: mockSendMail,
  })),
}));

jest.mock('../config/config', () => ({
  env: 'test',
  clientUrl: 'https://app.saby.ai',
  email: {
    smtp: {},
    from: 'noreply@saby.ai',
  },
}));

jest.mock('../config/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const emailTemplateService = require('../services/emailTemplate.service');
const emailService = require('../services/email.service');

const socialUrls = [
  'https://facebook.com/sabyglobal',
  'https://x.com/sabyglobal',
  'https://linkedin.com/company/sabyglobal',
  'https://instagram.com/sabyglobal',
  'https://discord.gg/sabyglobal',
];

describe('Saby email template system', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders the premium Saby shell with logo cid, CTA, footer links, and landing social icons', () => {
    const html = emailTemplateService.renderSabyEmail({
      title: 'Test email',
      layout: 'approvalAction',
      label: 'Approval workflow',
      headline: 'Test headline.',
      body: ['A clear message.'],
      detailsRows: [['Submission', 'sub-1']],
      ctaLabel: 'Open Saby',
      ctaUrl: 'https://app.saby.ai/dashboard',
      showManageNotifications: true,
    });

    expect(html).toContain('data-saby-email-shell="true"');
    expect(html).toContain('data-saby-email-layout="approvalAction"');
    expect(html).toContain('cid:saby-email-logo');
    expect(html).not.toContain('width="74" height="74"');
    expect(html).not.toContain('Approval workflow');
    expect(html).toContain('Test headline.');
    expect(html).toContain('Approval details');
    expect(html).toContain('Open Saby');
    expect(html).toContain('https://app.saby.ai/privacy-policy');
    expect(html).toContain('https://app.saby.ai/contact');
    expect(html).toContain('https://app.saby.ai/settings');
    socialUrls.forEach((url) => expect(html).toContain(url));
    expect(html).toContain('cid:saby-social-facebook');
    expect(html).toContain('cid:saby-social-discord');
  });

  test('renders requested layout sections for specific email types', () => {
    const codeHtml = emailTemplateService.renderSabyEmail({
      layout: 'securityCode',
      label: 'Verification code',
      headline: 'Use this code to continue.',
      body: ['Enter the verification code below to continue.'],
      code: '123456',
      detailsRows: [['Code expires', '10 minutes']],
    });
    const receiptHtml = emailTemplateService.renderSabyEmail({
      layout: 'billingReceipt',
      label: 'Payment receipt',
      headline: 'Your subscription is active.',
      body: ['Your Saby Starter subscription has been confirmed.'],
      detailsRows: [['Plan', 'Starter']],
    });
    const complianceHtml = emailTemplateService.renderSabyEmail({
      layout: 'complianceAlert',
      label: 'Compliance action required',
      headline: 'Immediate compliance action is required.',
      body: ['Complete the remaining events before the deadline.'],
      metricCards: [['Compliance', '42%']],
      detailsRows: [['Remaining', 4]],
    });

    expect(codeHtml).toContain('1 2 3 4 5 6');
    expect(codeHtml).toContain('Code details');
    expect(receiptHtml).not.toContain('Payment receipt');
    expect(receiptHtml).toContain('Receipt details');
    expect(receiptHtml).toContain('Receipt attached as PDF.');
    expect(complianceHtml).not.toContain('Compliance action required');
    expect(complianceHtml).toContain('Immediate compliance action is required.');
    expect(complianceHtml).toContain('Review gap');
    expect(complianceHtml).toContain('42%');
  });

  test('keeps existing template names working through the redesigned Saby shell', async () => {
    const html = await emailTemplateService.render('submission-confirmation', {
      userName: 'Ada',
      submissionId: 'sub-1',
      projectName: 'Monthly Report',
      submittedAt: 'July 16, 2026',
      statusUrl: 'https://app.saby.ai/submissions/sub-1',
    });

    expect(html).toContain('data-saby-email-shell="true"');
    expect(html).toContain('data-saby-email-layout="submissionStatus"');
    expect(html).toContain('Your submission is in Saby.');
    expect(html).toContain('Monthly Report');
    expect(html).toContain('sub-1');
  });

  test('sendEmail supports positional calls and attaches all inline brand assets', async () => {
    await emailService.sendEmail(
      'user@example.com',
      'Plain notification',
      'This started as plain text.'
    );

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const message = mockSendMail.mock.calls[0][0];
    expect(message.to).toBe('user@example.com');
    expect(message.text).toContain('This started as plain text.');
    expect(message.html).toContain('data-saby-email-shell="true"');
    expect(message.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cid: 'saby-email-logo' }),
        expect.objectContaining({ cid: 'saby-social-facebook' }),
        expect.objectContaining({ cid: 'saby-social-x' }),
        expect.objectContaining({ cid: 'saby-social-linkedin' }),
        expect.objectContaining({ cid: 'saby-social-instagram' }),
        expect.objectContaining({ cid: 'saby-social-discord' }),
      ])
    );
  });

  test('sendEmail supports object-style calls and preserves attachments', async () => {
    await emailService.sendEmail({
      to: 'billing@example.com',
      subject: 'Invoice ready',
      text: 'Your invoice is ready.',
      attachments: [
        {
          filename: 'invoice.pdf',
          content: Buffer.from('pdf'),
          contentType: 'application/pdf',
        },
      ],
    });

    const message = mockSendMail.mock.calls[0][0];
    expect(message.to).toBe('billing@example.com');
    expect(message.html).toContain('data-saby-email-shell="true"');
    expect(message.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'invoice.pdf' }),
        expect.objectContaining({ cid: 'saby-email-logo' }),
        expect.objectContaining({ cid: 'saby-social-discord' }),
      ])
    );
  });

  test('sendSabyEmail renders text fallback with layout details and CTA', async () => {
    await emailService.sendSabyEmail({
      to: 'security@example.com',
      subject: 'Security code',
      layout: 'securityCode',
      label: 'Verification code',
      headline: 'Use this code to continue.',
      body: ['Enter the verification code below to continue.'],
      code: '123456',
      detailsRows: [['Code expires', '10 minutes']],
      ctaLabel: 'Open Saby',
      ctaUrl: 'https://app.saby.ai',
    });

    const message = mockSendMail.mock.calls[0][0];
    expect(message.text).toContain('Verification code');
    expect(message.text).toContain('Use this code to continue.');
    expect(message.text).toContain('Verification code: 123456');
    expect(message.text).toContain('Code expires: 10 minutes');
    expect(message.text).toContain('Open Saby: https://app.saby.ai');
    expect(message.html).toContain('1 2 3 4 5 6');
  });
});
