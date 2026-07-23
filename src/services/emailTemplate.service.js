/**
 * Saby email template service.
 *
 * Provides one branded email shell and layout-specific content sections for all
 * backend email correspondence.
 */

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const logger = require('../config/logger');
const config = require('../config/config');

const SABY_EMAIL_LOGO_CID = 'saby-email-logo';
const SABY_EMAIL_LOGO_PATH = path.resolve(__dirname, '../../public/Sabyblack.png');
const SOCIAL_ASSET_DIR = path.resolve(__dirname, '../../public/email-assets');

const SOCIAL_LINKS = [
  {
    label: 'Facebook',
    url: 'https://facebook.com/sabyglobal',
    cid: 'saby-social-facebook',
    filename: 'social-facebook.png',
  },
  {
    label: 'X',
    url: 'https://x.com/sabyglobal',
    cid: 'saby-social-x',
    filename: 'social-x.png',
  },
  {
    label: 'LinkedIn',
    url: 'https://linkedin.com/company/sabyglobal',
    cid: 'saby-social-linkedin',
    filename: 'social-linkedin.png',
  },
  {
    label: 'Instagram',
    url: 'https://instagram.com/sabyglobal',
    cid: 'saby-social-instagram',
    filename: 'social-instagram.png',
  },
  {
    label: 'Discord',
    url: 'https://discord.gg/sabyglobal',
    cid: 'saby-social-discord',
    filename: 'social-discord.png',
  },
];

const LAYOUT_PRESETS = {
  default: {
    label: 'Saby notification',
    icon: 'SBY',
    sectionTitle: 'Notification details',
  },
  security: {
    label: 'Security notice',
    icon: 'KEY',
    sectionTitle: 'Security details',
    nextStepTitle: 'Security tip',
    nextStepBody: 'Saby will never ask for your password by email.',
  },
  securityCode: {
    label: 'Verification code',
    icon: 'OTP',
    sectionTitle: 'Code details',
  },
  billingReceipt: {
    label: 'Payment receipt',
    icon: 'PAY',
    sectionTitle: 'Receipt details',
    attachmentNote: 'Receipt attached as PDF.',
  },
  billingFailure: {
    label: 'Billing attention required',
    icon: 'PAY',
    sectionTitle: 'Invoice details',
    attachmentNote: 'Invoice attached as PDF.',
    nextStepTitle: 'Next step',
    nextStepBody: 'Retry payment from your billing page to keep paid workspace features active.',
  },
  workspaceAccess: {
    label: 'Workspace access',
    icon: 'TEAM',
    sectionTitle: 'Access details',
  },
  submissionStatus: {
    label: 'Submission update',
    icon: 'IN',
    sectionTitle: 'Submission details',
    statusSteps: ['Received', 'Validation checks', 'Processing update'],
  },
  validationIssue: {
    label: 'Validation required',
    icon: 'FIX',
    sectionTitle: 'Issue details',
    issueTitle: 'Items to fix',
    nextStepTitle: 'Next step',
    nextStepBody: 'Review the listed items, correct the submission, and send the updated information back through Saby.',
  },
  complianceAlert: {
    label: 'Compliance action required',
    icon: 'PERM',
    sectionTitle: 'Compliance details',
    statusSteps: ['Review gap', 'Complete events', 'Confirm compliance'],
  },
  complianceDigest: {
    label: 'Executive summary',
    icon: 'SUM',
    sectionTitle: 'Summary metrics',
    listTitle: 'Nodes needing attention',
  },
  approvalAction: {
    label: 'Approval workflow',
    icon: 'APP',
    sectionTitle: 'Approval details',
    statusSteps: ['Review submission', 'Record decision', 'Notify workflow'],
  },
  approvalResult: {
    label: 'Approval update',
    icon: 'APP',
    sectionTitle: 'Workflow details',
  },
  operationalAlert: {
    label: 'Anomaly alert',
    icon: 'ALT',
    sectionTitle: 'Alert details',
    nextStepTitle: 'Recommended action',
    nextStepBody: 'Investigate the metric movement, confirm the source, and resolve any operational issue in Saby.',
  },
  adminIncident: {
    label: 'System alert',
    icon: 'SYS',
    sectionTitle: 'Diagnostic details',
  },
  channelSubmission: {
    label: 'Channel submission',
    icon: 'CH',
    sectionTitle: 'Submission source',
  },
};

const PURPOSE_TO_LAYOUT = {
  auth: 'security',
  billing: 'billingFailure',
  subscription: 'billingReceipt',
  submission: 'submissionStatus',
  compliance: 'complianceAlert',
  approval: 'approvalAction',
  alert: 'operationalAlert',
  access: 'workspaceAccess',
};

const normalizeUrlBase = () => String(config.clientUrl || 'https://saby.ai').replace(/\/+$/, '');

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stripHtml = (value) =>
  String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const toArray = (value) => {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined && entry !== '');
  if (value === null || value === undefined || value === '') return [];
  return [value];
};

const normalizeRows = (rows = []) =>
  toArray(rows)
    .map((row) => {
      if (Array.isArray(row)) return { label: row[0], value: row[1] };
      return row;
    })
    .filter((row) => row && row.label !== undefined && row.value !== undefined && row.value !== null);

const renderParagraphs = (body) =>
  toArray(body)
    .map((entry) => `<p style="margin:0 0 18px 0;">${escapeHtml(entry).replace(/\n/g, '<br>')}</p>`)
    .join('');

const renderLabel = (label) => `
  <p style="margin:0 0 18px 0;color:#595959;font-size:12px;font-weight:900;letter-spacing:0.2em;text-transform:uppercase;">${escapeHtml(label)}</p>`;

const renderIconBlock = (icon) => `
  <td width="74" height="74" bgcolor="#111111" align="center" valign="middle" style="width:74px;height:74px;background:#111111;border-radius:24px;color:#ffffff;font-size:16px;line-height:1;font-weight:900;letter-spacing:-0.04em;font-family:Arial,Helvetica,sans-serif;">
    ${escapeHtml(icon || 'SBY')}
  </td>`;

const renderDetailsRows = (rows = [], title = 'Details') => {
  const values = normalizeRows(rows);
  if (!values.length) return '';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;margin:30px 0 0 0;background:#f5f5f3;border:1px solid #deded8;border-radius:24px;overflow:hidden;">
      <tr>
        <td colspan="2" style="padding:22px 22px 10px 22px;color:#111111;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;font-weight:900;">${escapeHtml(title)}</td>
      </tr>
      ${values
        .map(
          (row, index) => `
            <tr>
              <td style="padding:${index === 0 ? '12px' : '14px'} 22px 14px 22px;border-top:${index === 0 ? '0' : '1px solid #deded8'};color:#6b6b6b;font-size:12px;text-transform:uppercase;letter-spacing:0.11em;width:38%;font-weight:800;">${escapeHtml(row.label)}</td>
              <td style="padding:${index === 0 ? '12px' : '14px'} 22px 14px 22px;border-top:${index === 0 ? '0' : '1px solid #deded8'};color:#111111;font-size:15px;font-weight:800;line-height:1.45;">${escapeHtml(row.value)}</td>
            </tr>`
        )
        .join('')}
    </table>`;
};

const renderMetricCards = (cards = []) => {
  const values = normalizeRows(cards);
  if (!values.length) return '';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:12px;margin:28px -12px 0 -12px;">
      ${values
        .reduce((rows, card, index) => {
          if (index % 2 === 0) rows.push([]);
          rows[rows.length - 1].push(card);
          return rows;
        }, [])
        .map(
          (row) => `
            <tr>
              ${row
                .map(
                  (card) => `
                    <td width="50%" valign="top" style="background:#111111;border-radius:22px;padding:20px;color:#ffffff;">
                      <p style="margin:0 0 10px 0;color:#bdbdbd;font-size:11px;text-transform:uppercase;letter-spacing:0.16em;font-weight:900;">${escapeHtml(card.label)}</p>
                      <p style="margin:0;color:#ffffff;font-size:26px;line-height:1.1;font-weight:900;letter-spacing:-0.04em;">${escapeHtml(card.value)}</p>
                    </td>`
                )
                .join('')}
              ${row.length === 1 ? '<td width="50%"></td>' : ''}
            </tr>`
        )
        .join('')}
    </table>`;
};

const renderCodeBlock = (code) => {
  if (!code) return '';
  const spacedCode = String(code).split('').join(' ');
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:28px 0 4px 0;">
      <tr>
        <td align="center" bgcolor="#111111" style="background:#111111;border-radius:26px;padding:34px 20px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
          <p style="margin:0 0 12px 0;color:#bdbdbd;font-size:12px;text-transform:uppercase;letter-spacing:0.18em;font-weight:900;">Verification code</p>
          <p style="margin:0;color:#ffffff;font-size:44px;line-height:1;font-weight:900;letter-spacing:0.18em;">${escapeHtml(spacedCode)}</p>
        </td>
      </tr>
    </table>`;
};

const renderStatusSteps = (steps = []) => {
  const values = toArray(steps);
  if (!values.length) return '';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:30px 0 0 0;">
      <tr>
        ${values
          .map(
            (step, index) => `
              <td valign="top" style="width:${Math.floor(100 / values.length)}%;padding:0 ${index === values.length - 1 ? '0' : '10px'} 0 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td style="height:5px;background:#111111;border-radius:999px;font-size:1px;line-height:1px;">&nbsp;</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 0 0 0;color:#3a3a3a;font-size:12px;line-height:1.35;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(step)}</td>
                  </tr>
                </table>
              </td>`
          )
          .join('')}
      </tr>
    </table>`;
};

const renderIssueItems = (items = [], title = 'Items to review') => {
  const values = toArray(items);
  if (!values.length) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:separate;border-spacing:0;margin:30px 0 0 0;background:#ffffff;border:2px solid #111111;border-radius:24px;overflow:hidden;">
      <tr>
        <td style="padding:20px 22px 8px 22px;color:#111111;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;font-weight:900;">${escapeHtml(title)}</td>
      </tr>
      ${values
        .map(
          (item, index) => `
            <tr>
              <td style="padding:${index === 0 ? '10px' : '14px'} 22px 16px 22px;border-top:${index === 0 ? '0' : '1px solid #e6e6e0'};color:#2b2b2b;font-size:15px;line-height:1.55;">${escapeHtml(item)}</td>
            </tr>`
        )
        .join('')}
    </table>`;
};

const renderList = (items = [], title = '') => {
  const values = toArray(items);
  if (!values.length) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:30px 0 0 0;">
      ${title ? `<tr><td style="padding:0 0 12px 0;color:#111111;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;font-weight:900;">${escapeHtml(title)}</td></tr>` : ''}
      <tr>
        <td>
          <ul style="margin:0;padding:0 0 0 20px;color:#2b2b2b;font-size:15px;line-height:1.65;">
            ${values.map((item) => `<li style="margin:0 0 8px 0;">${escapeHtml(item)}</li>`).join('')}
          </ul>
        </td>
      </tr>
    </table>`;
};

const renderAttachmentNote = (note) => {
  if (!note) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:24px 0 0 0;">
      <tr>
        <td style="padding:17px 20px;background:#111111;border-radius:999px;color:#ffffff;font-size:13px;line-height:1.45;font-weight:800;letter-spacing:0.02em;">${escapeHtml(note)}</td>
      </tr>
    </table>`;
};

const renderNextStep = ({ nextStepTitle, nextStepBody }) => {
  if (!nextStepTitle && !nextStepBody) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:28px 0 0 0;">
      <tr>
        <td style="padding:22px 24px;background:#eeeeea;border-left:6px solid #111111;border-radius:18px;color:#2b2b2b;">
          ${nextStepTitle ? `<p style="margin:0 0 8px 0;color:#111111;font-size:13px;text-transform:uppercase;letter-spacing:0.16em;font-weight:900;">${escapeHtml(nextStepTitle)}</p>` : ''}
          ${nextStepBody ? `<p style="margin:0;color:#2b2b2b;font-size:15px;line-height:1.6;">${escapeHtml(nextStepBody)}</p>` : ''}
        </td>
      </tr>
    </table>`;
};

const renderCta = ({ ctaLabel, ctaUrl }) => {
  if (!ctaLabel || !ctaUrl) return '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:34px 0 4px 0;">
      <tr>
        <td bgcolor="#111111" style="border-radius:999px;">
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:18px 42px;border-radius:999px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:900;letter-spacing:0.22em;text-transform:uppercase;">${escapeHtml(ctaLabel)}</a>
        </td>
      </tr>
    </table>`;
};

const buildFooterLinks = ({ showManageNotifications = false } = {}) => {
  const baseUrl = normalizeUrlBase();
  const links = [
    { label: 'Privacy policy', url: `${baseUrl}/privacy-policy` },
    { label: 'Contact us', url: `${baseUrl}/contact` },
  ];
  if (showManageNotifications) {
    links.unshift({ label: 'Manage notifications', url: `${baseUrl}/settings` });
  }
  return links;
};

const renderSocialLinks = () => `
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:separate;border-spacing:10px 0;margin:0 auto 28px auto;">
    <tr>
      ${SOCIAL_LINKS.map(
        (item) => `
          <td width="42" height="42" align="center" valign="middle" style="width:42px;height:42px;">
            <a href="${escapeHtml(item.url)}" aria-label="${escapeHtml(item.label)}" style="display:block;text-decoration:none;">
              <img src="cid:${item.cid}" width="42" height="42" alt="${escapeHtml(item.label)}" style="display:block;border:0;outline:none;text-decoration:none;width:42px;height:42px;">
            </a>
          </td>`
      ).join('')}
    </tr>
  </table>`;

const renderFooter = ({ footerNote, showManageNotifications }) => {
  const links = buildFooterLinks({ showManageNotifications });
  return `
    <tr>
      <td style="padding:34px 24px 52px 24px;text-align:center;color:#8a8a8a;font-family:Arial,Helvetica,sans-serif;">
        <p style="margin:0 0 16px 0;font-size:18px;font-weight:900;color:#a9a9a9;">Need help with Saby?</p>
        <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;">Contact <a href="mailto:hello@saby.ai" style="color:#cfcfcf;text-decoration:none;">hello@saby.ai</a>${footerNote ? `<br>${escapeHtml(footerNote)}` : ''}</p>
        ${renderSocialLinks()}
        <p style="margin:0;font-size:13px;line-height:1.7;">
          ${links
            .map((link) => `<a href="${escapeHtml(link.url)}" style="color:#a9a9a9;text-decoration:none;">${escapeHtml(link.label)}</a>`)
            .join(' &bull; ')}
        </p>
      </td>
    </tr>`;
};

const resolveLayout = (payload = {}) => {
  if (payload.layout && LAYOUT_PRESETS[payload.layout]) return payload.layout;
  if (payload.purpose && PURPOSE_TO_LAYOUT[payload.purpose]) return PURPOSE_TO_LAYOUT[payload.purpose];
  return 'default';
};

const deriveCode = (payload, detailsRows) => {
  if (payload.code) return payload.code;
  if (payload.otp) return payload.otp;
  const codeRow = detailsRows.find((row) => /code/i.test(String(row.label || '')));
  return codeRow ? codeRow.value : '';
};

const normalizePayload = (payload = {}) => {
  const subject = payload.subject || payload.title || 'Saby notification';
  const layout = resolveLayout(payload);
  const preset = LAYOUT_PRESETS[layout] || LAYOUT_PRESETS.default;
  const detailsRows = normalizeRows(payload.detailsRows || payload.summaryRows || []);
  const metricCards = normalizeRows(payload.metricCards || []);
  const statusSteps = toArray(payload.statusSteps || preset.statusSteps || []);
  const issueItems = toArray(payload.issueItems || []);
  const listItems = toArray(payload.listItems || []);

  return {
    title: payload.title || subject,
    preheader: payload.preheader || '',
    headline: payload.headline || subject,
    body: payload.body || '',
    bodyHtml: payload.bodyHtml || '',
    layout,
    label: payload.label || payload.eyebrow || preset.label,
    icon: payload.icon || preset.icon,
    ctaLabel: payload.ctaLabel || '',
    ctaUrl: payload.ctaUrl || '',
    detailsRows,
    metricCards,
    statusSteps,
    issueItems,
    issueTitle: payload.issueTitle || preset.issueTitle || 'Items to review',
    listItems,
    listTitle: payload.listTitle || preset.listTitle || '',
    attachmentNote: payload.attachmentNote || preset.attachmentNote || '',
    nextStepTitle: payload.nextStepTitle || preset.nextStepTitle || '',
    nextStepBody: payload.nextStepBody || payload.secondaryText || preset.nextStepBody || '',
    sectionTitle: payload.sectionTitle || preset.sectionTitle || 'Details',
    code: deriveCode(payload, detailsRows),
    footerNote: payload.footerNote || '',
    showManageNotifications: Boolean(payload.showManageNotifications),
  };
};

const renderSabyEmail = (payload = {}) => {
  const data = normalizePayload(payload);
  const preheader = data.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(data.preheader)}</div>`
    : '';
  const bodyHtml = data.bodyHtml || renderParagraphs(data.body);
  const detailsRows = data.layout === 'securityCode'
    ? data.detailsRows.filter((row) => !/^verification code$/i.test(String(row.label || '').trim()))
    : data.detailsRows;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(data.title)}</title>
</head>
<body style="margin:0;padding:0;background:#242424;">
  ${preheader}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#242424;" data-saby-email-shell="true" data-saby-email-layout="${escapeHtml(data.layout)}">
    <tr>
      <td align="center" style="padding:42px 18px 0 18px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;max-width:720px;background:#f8f8f8;">
          <tr>
            <td style="padding:0 0 0 58px;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td width="168" height="168" bgcolor="#000000" align="center" valign="middle" style="width:168px;height:168px;background:#000000;">
                    <img src="cid:${SABY_EMAIL_LOGO_CID}" width="88" height="88" alt="Saby" style="display:block;border:0;outline:none;text-decoration:none;width:88px;height:88px;border-radius:50%;">
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:64px 58px 66px 58px;font-family:Arial,Helvetica,sans-serif;color:#1b1b1b;">
              <h1 style="margin:0 0 32px 0;font-size:42px;line-height:1.05;font-weight:900;letter-spacing:-0.055em;color:#111111;">${escapeHtml(data.headline)}</h1>
              <div style="font-size:17px;line-height:1.72;color:#2b2b2b;">${bodyHtml}</div>
              ${renderCodeBlock(data.layout === 'securityCode' ? data.code : '')}
              ${renderMetricCards(data.metricCards)}
              ${renderDetailsRows(detailsRows, data.sectionTitle)}
              ${renderStatusSteps(data.statusSteps)}
              ${renderIssueItems(data.issueItems, data.issueTitle)}
              ${renderList(data.listItems, data.listTitle)}
              ${renderAttachmentNote(data.attachmentNote)}
              ${renderNextStep(data)}
              ${renderCta(data)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
    ${renderFooter(data)}
  </table>
</body>
</html>`;
};

const renderSabyText = (payload = {}) => {
  const data = normalizePayload(payload);
  const parts = [data.headline];
  const bodyText = data.bodyHtml ? stripHtml(data.bodyHtml) : toArray(data.body).join('\n\n');
  if (bodyText) parts.push(bodyText);
  if (data.layout === 'securityCode' && data.code) parts.push(`Verification code: ${data.code}`);
  const metricCards = data.metricCards.map((row) => `${row.label}: ${row.value}`);
  if (metricCards.length) parts.push(metricCards.join('\n'));
  const rows = data.detailsRows.map((row) => `${row.label}: ${row.value}`);
  if (rows.length) parts.push(rows.join('\n'));
  const steps = data.statusSteps.map((step) => `- ${step}`);
  if (steps.length) parts.push(`Workflow:\n${steps.join('\n')}`);
  const issues = data.issueItems.map((item) => `- ${item}`);
  if (issues.length) parts.push(`${data.issueTitle}:\n${issues.join('\n')}`);
  const listItems = data.listItems.map((item) => `- ${item}`);
  if (listItems.length) parts.push(`${data.listTitle || 'Items'}:\n${listItems.join('\n')}`);
  if (data.attachmentNote) parts.push(data.attachmentNote);
  if (data.nextStepTitle || data.nextStepBody) {
    parts.push([data.nextStepTitle, data.nextStepBody].filter(Boolean).join('\n'));
  }
  if (data.ctaUrl) parts.push(`${data.ctaLabel || 'Open Saby'}: ${data.ctaUrl}`);
  parts.push('Support: hello@saby.ai');
  return parts.filter(Boolean).join('\n\n');
};

const buildLegacyTemplatePayload = (templateName, data = {}) => {
  const common = {
    footerNote: 'This message was sent by Saby.',
  };

  const mappings = {
    'submission-confirmation': () => ({
      ...common,
      title: 'Submission received',
      preheader: `Your submission to ${data.projectName || 'Saby'} has been received.`,
      label: 'Submission received',
      layout: 'submissionStatus',
      icon: 'IN',
      headline: 'Your submission is in Saby.',
      body: [
        `We have received your submission to ${data.projectName || 'your project'} and placed it in the processing queue.`,
        'Saby will review the data, run validation checks, and notify you when the next update is available.',
      ],
      detailsRows: [
        ['Project', data.projectName || 'N/A'],
        ['Submission ID', data.submissionId || 'N/A'],
        ['Received', data.submittedAt || 'N/A'],
        ['Status', 'Received and queued'],
      ],
      ctaLabel: 'View status',
      ctaUrl: data.statusUrl,
    }),
    'submission-processing': () => ({
      ...common,
      title: 'Submission processing',
      preheader: 'Your submission is being processed.',
      label: 'Submission processing',
      layout: 'submissionStatus',
      icon: 'RUN',
      headline: 'Saby is processing your submission.',
      body: [
        `Your submission to ${data.projectName || 'your project'} is now being processed. We are checking the data and preparing the result.`,
        'You will receive another update if action is required or once processing is complete.',
      ],
      detailsRows: [
        ['Project', data.projectName || 'N/A'],
        ['Submission ID', data.submissionId || 'N/A'],
        ['Status', data.status || 'Processing'],
        ['Updated', data.updatedAt || data.submittedAt || 'N/A'],
      ],
      ctaLabel: 'Check status',
      ctaUrl: data.statusUrl,
    }),
    'submission-failed': () => ({
      ...common,
      title: 'Submission failed',
      preheader: `Submission ${data.submissionId || ''} could not be processed.`,
      label: 'Submission issue',
      layout: 'validationIssue',
      icon: 'FIX',
      headline: 'We could not process this submission.',
      body: [
        'Saby could not complete processing for this submission after multiple attempts.',
        'Please review the issue below and resubmit the data. If the issue continues, contact support.',
      ],
      detailsRows: [
        ['Submission ID', data.submissionId || 'N/A'],
        ['Project', data.projectName || 'N/A'],
        ['Attempts', data.attempts || 'N/A'],
        ['Error', data.errorMessage || 'Processing failed'],
      ],
      ctaLabel: 'Try again',
      ctaUrl: data.retryUrl,
    }),
    'perm-critical-alert': () => ({
      ...common,
      title: 'Urgent compliance alert',
      preheader: `${data.nodeName || 'A node'} is critically below compliance target.`,
      label: 'Compliance action required',
      layout: 'complianceAlert',
      icon: 'PERM',
      headline: 'Immediate compliance action is required.',
      body: [
        `Submission compliance for ${data.nodeName || 'this node'} is critically low for ${data.month || 'the current period'}. This requires immediate attention from the responsible team.`,
        'Complete the remaining events before the deadline to avoid unresolved compliance gaps.',
      ],
      metricCards: [
        ['Compliance', `${data.compliance || 0}%`],
        ['Remaining', data.eventsRemaining || 0],
      ],
      detailsRows: [
        ['Compliance', `${data.compliance || 0}%`],
        ['Submitted', `${data.eventsSubmitted || 0}/${data.eventsRequired || 0}`],
        ['Remaining', data.eventsRemaining || 0],
        ['Days remaining', data.daysRemaining || 0],
      ],
      ctaLabel: 'Complete now',
      ctaUrl: data.submissionUrl,
      showManageNotifications: true,
    }),
    'perm-warning': () => ({
      ...common,
      title: 'Compliance warning',
      preheader: `${data.nodeName || 'A node'} needs compliance attention.`,
      label: 'Compliance warning',
      layout: 'complianceAlert',
      icon: 'PERM',
      headline: 'Your compliance level needs attention.',
      body: [
        `Your PERM submission for ${data.month || 'the current period'} is below the expected threshold.`,
        'Please update the remaining events so your node can stay on track before the reporting deadline.',
      ],
      metricCards: [
        ['Compliance', `${data.compliance || 0}%`],
        ['Days remaining', data.daysRemaining || 0],
      ],
      detailsRows: [
        ['Compliance', `${data.compliance || 0}%`],
        ['Submitted', `${data.eventsSubmitted || 0}/${data.eventsRequired || 0}`],
        ['Remaining', data.eventsRemaining || 0],
        ['Days remaining', data.daysRemaining || 0],
      ],
      ctaLabel: 'Update submission',
      ctaUrl: data.submissionUrl,
      showManageNotifications: true,
    }),
    'perm-completion': () => ({
      ...common,
      title: 'Compliance achieved',
      preheader: `${data.nodeName || 'A node'} reached 100% compliance.`,
      label: 'Compliance complete',
      layout: 'complianceDigest',
      icon: 'DONE',
      headline: 'Compliance achieved.',
      body: [
        `Your team has achieved 100% compliance for ${data.month || 'the current period'}.`,
        'Saby has recorded the completed submission and the report is available for review.',
      ],
      detailsRows: [
        ['Node', data.nodeName || 'N/A'],
        ['Month', data.month || 'N/A'],
        ['Required events', `${data.eventsRequired || 0}/${data.eventsRequired || 0}`],
        ['Status', 'Complete'],
      ],
      listTitle: 'Completed events',
      listItems: toArray(data.events),
      ctaLabel: 'View report',
      ctaUrl: data.reportUrl,
      showManageNotifications: true,
    }),
    'perm-late-submission': () => ({
      ...common,
      title: 'Late submission warning',
      preheader: `${data.nodeName || 'A node'} is ${data.daysOverdue || 0} days overdue.`,
      label: 'Submission overdue',
      layout: 'complianceAlert',
      icon: 'LATE',
      headline: 'This submission is overdue.',
      body: [
        `Your PERM submission for ${data.month || 'the current period'} is overdue. Please complete the outstanding events as soon as possible.`,
        "Late submissions may affect your organization's compliance visibility and reporting accuracy.",
      ],
      metricCards: [
        ['Days overdue', data.daysOverdue || 0],
        ['Compliance', `${data.compliance || 0}%`],
      ],
      detailsRows: [
        ['Node', data.nodeName || 'N/A'],
        ['Month', data.month || 'N/A'],
        ['Compliance', `${data.compliance || 0}%`],
        ['Events submitted', `${data.eventsSubmitted || 0}/${data.eventsRequired || 0}`],
        ['Days overdue', data.daysOverdue || 0],
      ],
      ctaLabel: 'Submit now',
      ctaUrl: data.submissionUrl,
      showManageNotifications: true,
    }),
    'perm-weekly-reminder': () => ({
      ...common,
      title: 'Weekly submission reminder',
      preheader: `Continue your PERM submission for ${data.month || 'the current period'}.`,
      label: 'Weekly reminder',
      layout: 'complianceAlert',
      icon: 'PERM',
      headline: 'Keep your compliance progress moving.',
      body: [
        `This is your weekly reminder to continue the PERM submission for ${data.month || 'the current period'}.`,
        'Review the remaining events and update your submission while there is still time.',
      ],
      detailsRows: [
        ['Compliance', `${data.compliance || 0}%`],
        ['Submitted', `${data.eventsSubmitted || 0}/${data.eventsRequired || 0}`],
        ['Days remaining', data.daysRemaining || 0],
      ],
      listTitle: 'Submission checklist',
      listItems: toArray(data.events).map((event) =>
        typeof event === 'string' ? event : `${event.name || 'Event'}${event.date ? ` - ${event.date}` : ''}${event.submitted ? ' - submitted' : ''}`
      ),
      ctaLabel: 'Continue submission',
      ctaUrl: data.submissionUrl,
      showManageNotifications: true,
    }),
    'perm-month-end-summary': () => ({
      ...common,
      title: 'Monthly compliance summary',
      preheader: `Your organization's compliance summary for ${data.month || 'the current period'} is ready.`,
      label: 'Executive summary',
      layout: 'complianceDigest',
      icon: 'SUM',
      headline: 'Monthly compliance summary.',
      body: [
        `Here is your compliance summary for ${data.month || 'the current period'} across all reporting nodes.`,
        'Use this summary to identify compliant nodes, unresolved gaps, and follow-up priorities.',
      ],
      metricCards: [
        ['Overall compliance', `${data.overallCompliance || 0}%`],
        ['Total nodes', data.totalNodes || 0],
        ['Compliant nodes', data.compliantNodes || 0],
        ['Non-compliant nodes', data.nonCompliantNodes || 0],
      ],
      detailsRows: [
        ['Overall compliance', `${data.overallCompliance || 0}%`],
        ['Total nodes', data.totalNodes || 0],
        ['Compliant nodes', data.compliantNodes || 0],
        ['Non-compliant nodes', data.nonCompliantNodes || 0],
      ],
      listTitle: 'Nodes needing attention',
      listItems: toArray(data.nodes).slice(0, 10).map((node) =>
        `${node.name || 'Node'}: ${node.compliance || 0}% (${node.eventsSubmitted || 0}/${node.eventsRequired || 0})`
      ),
      ctaLabel: 'View dashboard',
      ctaUrl: data.dashboardUrl,
      showManageNotifications: true,
    }),
  };

  const builder = mappings[templateName];
  return builder ? builder() : null;
};

class EmailTemplateService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/emails');
    this.cache = new Map();
    this.registerHelpers();
  }

  registerHelpers() {
    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('gt', (a, b) => a > b);
    Handlebars.registerHelper('formatDate', (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });
    Handlebars.registerHelper('formatDateTime', (date) => {
      if (!date) return '';
      return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    });
  }

  async loadTemplate(templateName) {
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName);
    }

    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);
      if (!fs.existsSync(templatePath)) {
        logger.error(`Template not found: ${templatePath}`);
        return null;
      }

      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);
      this.cache.set(templateName, compiledTemplate);
      logger.info(`Template loaded: ${templateName}`);
      return compiledTemplate;
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error.message);
      return null;
    }
  }

  async render(templateName, data) {
    const sabyPayload = buildLegacyTemplatePayload(templateName, data);
    if (sabyPayload) {
      return renderSabyEmail(sabyPayload);
    }

    const template = await this.loadTemplate(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    try {
      return template(data);
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error.message);
      throw error;
    }
  }

  renderSabyEmail(payload) {
    return renderSabyEmail(payload);
  }

  renderSabyText(payload) {
    return renderSabyText(payload);
  }

  getLogoAttachment() {
    if (!fs.existsSync(SABY_EMAIL_LOGO_PATH)) {
      return null;
    }
    return {
      filename: 'saby-logo.png',
      path: SABY_EMAIL_LOGO_PATH,
      cid: SABY_EMAIL_LOGO_CID,
    };
  }

  getSocialAttachments() {
    return SOCIAL_LINKS.map((item) => {
      const iconPath = path.join(SOCIAL_ASSET_DIR, item.filename);
      if (!fs.existsSync(iconPath)) return null;
      return {
        filename: item.filename,
        path: iconPath,
        cid: item.cid,
      };
    }).filter(Boolean);
  }

  getBrandAttachments() {
    return [this.getLogoAttachment(), ...this.getSocialAttachments()].filter(Boolean);
  }

  isSabyEmail(html) {
    return String(html || '').includes('data-saby-email-shell="true"');
  }

  clearCache() {
    this.cache.clear();
    logger.info('Template cache cleared');
  }
}

module.exports = new EmailTemplateService();
module.exports.SABY_EMAIL_LOGO_CID = SABY_EMAIL_LOGO_CID;
module.exports.SABY_EMAIL_LOGO_PATH = SABY_EMAIL_LOGO_PATH;
module.exports.SOCIAL_LINKS = SOCIAL_LINKS;
