const httpStatus = require('http-status');
const {
  ReminderTrigger,
  User,
  WorkItem,
  Role,
  ProjectForm,
  ProjectFormSubmission,
} = require('../models');
const config = require('../config/config');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');
const { normalizePhoneToE164 } = require('../utils/phoneNumber');
const emailService = require('./email.service');
const notificationQueueService = require('./notificationQueue.service');
const whatsappNotificationService = require('../ingestion/whatsapp/services/whatsappNotification.service');

const escapeHtml = (value) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveRecipients = async (recipients, user) => {
  const userIds = [
    ...new Set(
      recipients
        .filter((recipient) => recipient.kind === 'user' && recipient.userId)
        .map((recipient) => recipient.userId)
    ),
  ];
  const roleIds = [
    ...new Set(
      recipients
        .filter((recipient) => recipient.kind === 'role' && recipient.roleId)
        .map((recipient) => recipient.roleId)
    ),
  ];
  const formProjectIds = [
    ...new Set(
      recipients
        .filter(
          (recipient) =>
            recipient.kind === 'form_submissions' && recipient.projectId
        )
        .map((recipient) => recipient.projectId)
    ),
  ];

  const [users, roles, forms] = await Promise.all([
    userIds.length > 0
      ? User.find({
          tenantId: user.tenantId,
          deletedAt: null,
          status: true,
          _id: { $in: userIds },
        }).select('_id firstname lastname email phoneNumber')
      : [],
    roleIds.length > 0
      ? Role.find({
          tenantId: user.tenantId,
          _id: { $in: roleIds },
        }).select('_id name')
      : [],
    formProjectIds.length > 0
      ? ProjectForm.find({
          tenantId: user.tenantId,
          deletedAt: null,
          $or: [
            { projectId: { $in: formProjectIds } },
            { formId: { $in: formProjectIds } },
          ],
        }).select('_id projectId formId title publicRef shareRef')
      : [],
  ]);

  const usersById = new Map(
    users.map((member) => [
      String(member._id),
      {
        kind: 'user',
        userId: String(member._id),
        name: [member.firstname, member.lastname].filter(Boolean).join(' '),
        email: member.email || undefined,
        phone: member.phoneNumber || undefined,
      },
    ])
  );

  const rolesById = new Map(roles.map((r) => [String(r._id), r]));

  if (userIds.some((userId) => !usersById.has(userId))) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'One or more reminder recipients are not active members of this tenant'
    );
  }
  if (roleIds.some((roleId) => !rolesById.has(roleId))) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'One or more recipient roles do not exist for this tenant'
    );
  }

  return recipients.map((recipient) => {
    if (recipient.kind === 'all') {
      return {
        kind: 'all',
        name: recipient.name || '@all (All Users)',
      };
    }
    if (recipient.kind === 'role') {
      const foundRole = rolesById.get(String(recipient.roleId));
      const baseName = foundRole?.name || recipient.name || 'Role';
      return {
        kind: 'role',
        roleId: String(recipient.roleId),
        name: baseName.startsWith('Role:') ? baseName : `Role: ${baseName}`,
      };
    }
    if (recipient.kind === 'form_submissions') {
      const foundForm = forms.find(
        (f) =>
          f.projectId === recipient.projectId ||
          f.formId === recipient.projectId ||
          String(f._id) === recipient.projectId
      );
      const baseTitle =
        foundForm?.title ||
        foundForm?.identity?.title ||
        recipient.name ||
        'Form';
      return {
        kind: 'form_submissions',
        projectId: foundForm ? foundForm.projectId : recipient.projectId,
        formId: foundForm?.formId || recipient.formId || undefined,
        name: baseTitle.startsWith('Form:') ? baseTitle : `Form: ${baseTitle}`,
      };
    }
    if (recipient.kind === 'user') return usersById.get(recipient.userId);
    return {
      kind: 'contact',
      name: recipient.name,
      email: recipient.email || undefined,
      phone: recipient.phone
        ? normalizePhoneToE164(recipient.phone, { allowEmpty: false })
        : undefined,
    };
  });
};

const assertEntityAccess = async ({ entityType, entityId }, user) => {
  if (entityType !== 'work-item') return;
  const workItem = await WorkItem.findOne({
    _id: entityId,
    tenantId: user.tenantId,
  });
  if (!workItem) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Reminder entity not found');
  }
};

const createReminderTrigger = async (body, user) => {
  await assertEntityAccess(body, user);
  const recipients = await resolveRecipients(body.recipients, user);
  return ReminderTrigger.create({
    ...body,
    recipients,
    tenantId: user.tenantId,
    createdBy: String(user.id || user._id),
  });
};

const queryReminderTriggers = async ({ entityType, entityId }, user) => {
  const filter = { tenantId: user.tenantId };
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  return ReminderTrigger.find(filter).sort({ scheduledAt: 1 });
};

const deleteReminderTrigger = async (id, user) => {
  const trigger = await ReminderTrigger.findOneAndDelete({
    _id: id,
    tenantId: user.tenantId,
  });
  if (!trigger) throw new ApiError(httpStatus.NOT_FOUND, 'Reminder not found');
};

const suppressEntityReminders = async ({ entityType, entityId, tenantId }) =>
  ReminderTrigger.updateMany(
    {
      entityType,
      entityId: String(entityId),
      tenantId,
      status: { $in: ['pending', 'queued'] },
    },
    {
      $set: { enabled: false, status: 'suppressed' },
      $push: {
        deliveryAttempts: { status: 'suppressed', queuedAt: new Date() },
      },
    }
  );

const getLocalDateTimeParts = (date, timezone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
};

const getTimezoneOffsetMs = (date, timezone) => {
  const local = getLocalDateTimeParts(date, timezone);
  const localUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second
  );
  return localUtc - date.getTime();
};

const getNextYearlyOccurrence = (date, timezone) => {
  const local = getLocalDateTimeParts(date, timezone);
  const year = local.year + 1;
  const lastDayOfMonth = new Date(Date.UTC(year, local.month, 0)).getUTCDate();
  const target = Date.UTC(
    year,
    local.month - 1,
    Math.min(local.day, lastDayOfMonth),
    local.hour,
    local.minute,
    local.second
  );
  const firstPass = new Date(target);
  const secondPass = new Date(
    target - getTimezoneOffsetMs(firstPass, timezone)
  );
  return new Date(target - getTimezoneOffsetMs(secondPass, timezone));
};

const queueDueReminders = async () => {
  const dueTriggers = await ReminderTrigger.find({
    enabled: true,
    status: 'pending',
    scheduledAt: { $lte: new Date() },
  })
    .sort({ scheduledAt: 1 })
    .limit(100);
  return Promise.all(
    dueTriggers.map(async (trigger) => {
      const claimed = await ReminderTrigger.findOneAndUpdate(
        { _id: trigger._id, enabled: true, status: 'pending' },
        { $set: { status: 'queued' } },
        { new: true }
      );
      if (!claimed) return { skipped: true };

      if (claimed.entityType === 'work-item') {
        const item = await WorkItem.findOne({
          _id: claimed.entityId,
          tenantId: claimed.tenantId,
        }).select('status');
        if (!item || ['completed', 'cancelled'].includes(item.status)) {
          await suppressEntityReminders({
            entityType: claimed.entityType,
            entityId: claimed.entityId,
            tenantId: claimed.tenantId,
          });
          return { suppressed: true };
        }
      }

      try {
        const result = await notificationQueueService.queueReminder({
          reminderTriggerId: String(claimed._id),
          scheduledAt: claimed.scheduledAt,
        });
        await ReminderTrigger.updateOne(
          { _id: claimed._id },
          {
            $push: {
              deliveryAttempts: {
                status: 'queued',
                queuedAt: new Date(),
                jobId: String(result.jobId),
              },
            },
          }
        );
        return { queued: true };
      } catch (error) {
        await ReminderTrigger.updateOne(
          { _id: claimed._id },
          {
            $set: { status: 'pending' },
            $push: {
              deliveryAttempts: {
                status: 'failed',
                queuedAt: new Date(),
                error: error.message,
              },
            },
          }
        );
        throw error;
      }
    })
  );
};

const getProviderLabel = (provider) => {
  switch (provider) {
    case 'google_meet':
      return 'Google Meet';
    case 'zoom':
      return 'Zoom';
    case 'jitsi':
      return 'Jitsi Meet';
    default:
      return 'Online Meeting';
  }
};

const deliverReminder = async (reminderTriggerId) => {
  const trigger = await ReminderTrigger.findById(reminderTriggerId);
  if (!trigger || !trigger.enabled || trigger.status === 'suppressed') {
    return { success: true, suppressed: true };
  }

  const hasAllAlias = trigger.recipients.some(
    (recipient) => recipient.kind === 'all'
  );
  let emails = [];
  let phones = [];

  // Extract any form submission recipients
  const formRecipients = trigger.recipients.filter(
    (r) => r.kind === 'form_submissions'
  );
  const formUserEmails = [];
  const formUserPhones = [];
  if (formRecipients.length > 0) {
    const formProjectIds = [
      ...new Set(formRecipients.map((r) => r.projectId).filter(Boolean)),
    ];
    if (formProjectIds.length > 0) {
      const forms = await ProjectForm.find({
        tenantId: trigger.tenantId,
        deletedAt: null,
        $or: [
          { projectId: { $in: formProjectIds } },
          { formId: { $in: formProjectIds } },
        ],
      }).select('projectId formId smartMappings');

      const formsByProjectId = new Map();
      forms.forEach((f) => {
        if (f.projectId) formsByProjectId.set(f.projectId, f);
        if (f.formId) formsByProjectId.set(f.formId, f);
      });

      const submissions = await ProjectFormSubmission.find({
        tenantId: trigger.tenantId,
        deletedAt: null,
        projectId: { $in: formProjectIds },
      }).select('projectId submissionData');

      submissions.forEach((sub) => {
        const data = sub.submissionData || {};
        const form = formsByProjectId.get(sub.projectId);

        // Extract Email
        const emailKey = form?.smartMappings?.fields?.email;
        const emailCandidates = [
          emailKey,
          'email',
          'email_address',
          'emailAddress',
          'user_email',
          'contact_email',
        ].filter(Boolean);

        const matchedKey = emailCandidates.find(
          (k) => data[k] && typeof data[k] === 'string' && data[k].includes('@')
        );
        let foundEmail = matchedKey
          ? data[matchedKey].trim().toLowerCase()
          : '';
        if (!foundEmail) {
          const fallbackVal = Object.values(data).find(
            (v) =>
              typeof v === 'string' &&
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(v)
          );
          if (fallbackVal) {
            const m = fallbackVal.match(
              /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
            );
            if (m) {
              foundEmail = m[0].toLowerCase();
            }
          }
        }
        if (foundEmail) {
          formUserEmails.push(foundEmail);
        }

        // Extract Phone (for WhatsApp)
        const phoneKey =
          form?.smartMappings?.fields?.phone ||
          form?.smartMappings?.fields?.whatsapp;
        const phoneCandidates = [
          phoneKey,
          'phone',
          'phoneNumber',
          'telephone',
          'mobile',
          'whatsapp',
        ].filter(Boolean);

        const matchedPhoneKey = phoneCandidates.find(
          (k) =>
            data[k] && typeof data[k] === 'string' && data[k].trim().length >= 7
        );
        let rawPhone = matchedPhoneKey ? data[matchedPhoneKey].trim() : '';
        if (!rawPhone) {
          const fallbackPhoneVal = Object.values(data).find(
            (v) =>
              typeof v === 'string' && /^\+?[0-9\s().-]{7,25}$/.test(v.trim())
          );
          if (fallbackPhoneVal) {
            rawPhone = fallbackPhoneVal.trim();
          }
        }
        if (rawPhone) {
          const normalized = normalizePhoneToE164(rawPhone, {
            allowEmpty: false,
          });
          if (normalized) {
            formUserPhones.push(normalized);
          }
        }
      });
    }
  }

  if (hasAllAlias) {
    const activeTenantUsers = await User.find({
      tenantId: trigger.tenantId,
      deletedAt: null,
      status: true,
      $or: [
        { email: { $exists: true, $ne: '' } },
        { phoneNumber: { $exists: true, $ne: '' } },
      ],
    }).select('email phoneNumber');

    const tenantUserEmails = activeTenantUsers
      .map((user) => user.email?.trim().toLowerCase())
      .filter(Boolean);

    const tenantUserPhones = activeTenantUsers
      .map((user) =>
        user.phoneNumber
          ? normalizePhoneToE164(user.phoneNumber, { allowEmpty: false })
          : ''
      )
      .filter(Boolean);

    const contactEmails = trigger.recipients
      .filter((recipient) => recipient.kind === 'contact')
      .map((recipient) => recipient.email?.trim().toLowerCase())
      .filter(Boolean);

    const contactPhones = trigger.recipients
      .filter((recipient) => recipient.kind === 'contact')
      .map((recipient) =>
        recipient.phone
          ? normalizePhoneToE164(recipient.phone, { allowEmpty: false })
          : ''
      )
      .filter(Boolean);

    emails = [
      ...new Set([...tenantUserEmails, ...contactEmails, ...formUserEmails]),
    ];
    phones = [
      ...new Set([...tenantUserPhones, ...contactPhones, ...formUserPhones]),
    ];
  } else {
    const roleRecipients = trigger.recipients.filter((r) => r.kind === 'role');
    let roleUserEmails = [];
    let roleUserPhones = [];
    if (roleRecipients.length > 0) {
      const roleIds = roleRecipients.map((r) => r.roleId).filter(Boolean);
      if (roleIds.length > 0) {
        const activeRoleUsers = await User.find({
          tenantId: trigger.tenantId,
          deletedAt: null,
          status: true,
          roles: { $in: roleIds },
          $or: [
            { email: { $exists: true, $ne: '' } },
            { phoneNumber: { $exists: true, $ne: '' } },
          ],
        }).select('email phoneNumber');
        roleUserEmails = activeRoleUsers
          .map((user) => user.email?.trim().toLowerCase())
          .filter(Boolean);
        roleUserPhones = activeRoleUsers
          .map((user) =>
            user.phoneNumber
              ? normalizePhoneToE164(user.phoneNumber, { allowEmpty: false })
              : ''
          )
          .filter(Boolean);
      }
    }

    const directEmails = trigger.recipients
      .map((recipient) => recipient.email?.trim().toLowerCase())
      .filter(Boolean);

    const directPhones = trigger.recipients
      .map((recipient) =>
        recipient.phone
          ? normalizePhoneToE164(recipient.phone, { allowEmpty: false })
          : ''
      )
      .filter(Boolean);

    emails = [
      ...new Set([...roleUserEmails, ...formUserEmails, ...directEmails]),
    ];
    phones = [
      ...new Set([...roleUserPhones, ...formUserPhones, ...directPhones]),
    ];
  }

  const hasEmailChannel = trigger.channels.includes('email');
  const hasWhatsappChannel = trigger.channels.includes('whatsapp');

  if (hasEmailChannel && !emails.length && !hasWhatsappChannel) {
    const error = 'Reminder has no email-capable recipients';
    await ReminderTrigger.updateOne(
      { _id: trigger._id },
      {
        $set: { status: 'failed' },
        $push: {
          deliveryAttempts: { status: 'failed', queuedAt: new Date(), error },
        },
      }
    );
    throw new Error(error);
  }

  if (hasWhatsappChannel && !phones.length && !hasEmailChannel) {
    const error = 'Reminder has no WhatsApp-capable recipients';
    await ReminderTrigger.updateOne(
      { _id: trigger._id },
      {
        $set: { status: 'failed' },
        $push: {
          deliveryAttempts: { status: 'failed', queuedAt: new Date(), error },
        },
      }
    );
    throw new Error(error);
  }

  if (!emails.length && !phones.length) {
    const error = 'Reminder has no reachable email or WhatsApp recipients';
    await ReminderTrigger.updateOne(
      { _id: trigger._id },
      {
        $set: { status: 'failed' },
        $push: {
          deliveryAttempts: { status: 'failed', queuedAt: new Date(), error },
        },
      }
    );
    throw new Error(error);
  }

  const workItem =
    trigger.entityType === 'work-item'
      ? await WorkItem.findOne({
          _id: trigger.entityId,
          tenantId: trigger.tenantId,
        })
      : null;
  if (workItem && ['completed', 'cancelled'].includes(workItem.status)) {
    await suppressEntityReminders({
      entityType: trigger.entityType,
      entityId: trigger.entityId,
      tenantId: trigger.tenantId,
    });
    return { success: true, suppressed: true };
  }
  const title = workItem?.title || 'Scheduled reminder';
  const meeting = workItem?.meeting?.enabled ? workItem.meeting : null;
  const formAttachment = workItem?.formAttachment?.enabled
    ? workItem.formAttachment
    : null;
  const rawFormUrl =
    formAttachment?.url ||
    (formAttachment?.shareRef ||
    formAttachment?.publicRef ||
    formAttachment?.projectId
      ? `${config.clientUrl}/s/${
          formAttachment.shareRef ||
          formAttachment.publicRef ||
          formAttachment.projectId
        }`
      : '');
  const formUrl =
    rawFormUrl && rawFormUrl.startsWith('/')
      ? `${config.clientUrl}${rawFormUrl}`
      : rawFormUrl;

  const publicAgendaUrl = workItem
    ? `${config.clientUrl}${workItem.shareCode ? `/a/${workItem.shareCode}` : `/agenda/${workItem._id}`}`
    : null;

  const detailsRows = [];
  if (publicAgendaUrl) {
    detailsRows.push({
      label: 'Event Agenda',
      value: publicAgendaUrl,
    });
  }
  if (meeting && meeting.joinUrl) {
    const providerName = getProviderLabel(meeting.provider);
    detailsRows.push({
      label: `${providerName} Meeting`,
      value: `${meeting.joinUrl}${
        meeting.passcode ? ` (Passcode: ${meeting.passcode})` : ''
      }`,
    });
  }
  if (formAttachment && formUrl) {
    detailsRows.push({
      label: 'Attached Form',
      value: formAttachment.title || 'Attached Form',
    });
  }

  let bodyHtml = '';

  // 1. AI-Finetuned Agenda Section
  if (workItem && (workItem.aiAgenda?.summary || publicAgendaUrl)) {
    const agendaSummary = workItem.aiAgenda?.summary;
    const objectives = Array.isArray(workItem.aiAgenda?.objectives)
      ? workItem.aiAgenda.objectives.slice(0, 3)
      : [];

    bodyHtml += `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 16px 0;border:1px solid #e0e7ff;border-radius:12px;background:#f8faff;overflow:hidden;">
        <tr>
          <td style="padding:20px 24px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#4f46e5;margin-bottom:6px;">
              ✨ AI-Prepared Agenda & Briefing
            </div>
            <div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:8px;">
              ${escapeHtml(title)}
            </div>
            ${
              agendaSummary
                ? `<div style="font-size:13px;line-height:1.6;color:#334155;margin-bottom:12px;">${escapeHtml(
                    agendaSummary
                  )}</div>`
                : ''
            }
            ${
              objectives.length > 0
                ? `<div style="font-size:12px;font-weight:600;color:#475569;margin-bottom:6px;">Key Focus Points:</div>
                   <ul style="margin:0 0 14px 0;padding-left:18px;font-size:12px;line-height:1.6;color:#475569;">
                     ${objectives
                       .map((obj) => `<li>${escapeHtml(obj)}</li>`)
                       .join('')}
                   </ul>`
                : ''
            }
            ${
              publicAgendaUrl
                ? `<div style="margin-top:6px;">
                    <a href="${escapeHtml(
                      publicAgendaUrl
                    )}" style="display:inline-block;padding:10px 22px;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;border-radius:8px;">View Full Event Agenda &rarr;</a>
                  </div>`
                : ''
            }
          </td>
        </tr>
      </table>
    `;
  }

  // 2. Video Conference Section
  if (meeting && meeting.joinUrl) {
    const providerName = getProviderLabel(meeting.provider);
    bodyHtml += `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px 0;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;overflow:hidden;">
        <tr>
          <td style="padding:18px 22px;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0284c7;margin-bottom:4px;">
              📹 Video Conference &bull; ${escapeHtml(providerName)}
            </div>
            <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:6px;">
              Join with ${escapeHtml(providerName)}
            </div>
            ${
              meeting.meetingId
                ? `<div style="font-size:12px;color:#64748b;margin-bottom:3px;">Meeting ID: <strong style="color:#0f172a;">${escapeHtml(
                    meeting.meetingId
                  )}</strong></div>`
                : ''
            }
            ${
              meeting.passcode
                ? `<div style="font-size:12px;color:#64748b;margin-bottom:6px;">Passcode: <strong style="color:#0f172a;">${escapeHtml(
                    meeting.passcode
                  )}</strong></div>`
                : ''
            }
            <div style="margin-top:10px;">
              <a href="${escapeHtml(
                meeting.joinUrl
              )}" style="display:inline-block;padding:10px 22px;background:#0284c7;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;border-radius:8px;">Join ${escapeHtml(
      providerName
    )} Call &rarr;</a>
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  // 3. Attached Form & Data Capture Barcode Section (Always included when form is attached)
  if (formAttachment && formUrl) {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
      formUrl
    )}`;

    bodyHtml += `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 20px 0;border:1px solid #e2e8f0;border-radius:12px;background:#ffffff;overflow:hidden;">
        <tr>
          <td style="padding:18px 22px;border-bottom:1px solid #f1f5f9;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#059669;margin-bottom:4px;">
              📋 Attached Form &bull; Data Capture Barcode
            </div>
            <div style="font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(
              formAttachment.title || 'Form Check-in / Registration'
            )}</div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:22px 20px;">
            <div style="margin-bottom:12px;">
              <img src="${qrImageUrl}" width="160" height="160" alt="Data Capture Barcode QR" style="display:block;border-radius:10px;border:1px solid #e2e8f0;padding:8px;background:#ffffff;" />
            </div>
            <div style="font-size:12px;color:#64748b;margin-bottom:14px;max-width:280px;line-height:1.5;">
              Scan this barcode on mobile to open data capture form, or present at check-in.
            </div>
            <div>
              <a href="${escapeHtml(
                formUrl
              )}" style="display:inline-block;padding:10px 24px;background:#059669;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;border-radius:8px;">Open Data Capture Form &rarr;</a>
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  try {
    // 1. Deliver Email Reminders
    if (hasEmailChannel && emails.length > 0) {
      let emailCtaLabel = 'View Event Agenda & Details';
      let emailCtaUrl = publicAgendaUrl;
      if (!emailCtaUrl) {
        if (meeting?.joinUrl) {
          emailCtaLabel = `Join ${getProviderLabel(meeting.provider)}`;
          emailCtaUrl = meeting.joinUrl;
        } else if (formAttachment && formUrl) {
          emailCtaLabel = 'Open Attached Form';
          emailCtaUrl = formUrl;
        }
      }

      const batchSize = 25;
      for (let i = 0; i < emails.length; i += batchSize) {
        const batch = emails.slice(i, i + batchSize);
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(
          batch.map((email) =>
            emailService.sendSabyEmail({
              to: email,
              subject: `Reminder: ${title}`,
              preheader: `Reminder due ${trigger.scheduledAt.toLocaleString()}`,
              layout: 'default',
              label: 'Schedule reminder',
              icon: 'REM',
              headline: title,
              body: [
                `This is your scheduled reminder for ${title}.`,
                `Scheduled for ${trigger.scheduledAt.toLocaleString()} (${
                  trigger.timezone
                }).`,
              ],
              ...(bodyHtml ? { bodyHtml } : {}),
              ...(emailCtaLabel && emailCtaUrl
                ? {
                    ctaLabel: emailCtaLabel,
                    ctaUrl: emailCtaUrl,
                    detailsRows,
                  }
                : {}),
            })
          )
        );
      }
    }

    // 2. Deliver WhatsApp Push Reminders
    if (hasWhatsappChannel && phones.length > 0) {
      const providerName = meeting
        ? getProviderLabel(meeting.provider)
        : 'Online Meeting';
      const lines = [
        `🔔 *Scheduled Reminder: ${title}*`,
        ``,
        `📅 *When:* ${trigger.scheduledAt.toLocaleString()} (${
          trigger.timezone
        })`,
      ];

      if (meeting && meeting.joinUrl) {
        lines.push(``, `📹 *Join ${providerName}:*`, meeting.joinUrl);
        if (meeting.meetingId) {
          lines.push(`🆔 *Meeting ID:* ${meeting.meetingId}`);
        }
        if (meeting.passcode) {
          lines.push(`🔑 *Passcode:* ${meeting.passcode}`);
        }
      }

      if (formAttachment && formUrl) {
        lines.push(
          ``,
          `📋 *Attached Form / Pass:*`,
          formAttachment.title || 'Attached Form',
          formUrl
        );
      }

      lines.push(``, `—`, `_Sent via Saby Calendar_`);
      const whatsappMessage = lines.join('\n');

      await Promise.all(
        phones.map(async (phone) => {
          try {
            await whatsappNotificationService.sendTextMessage(
              phone,
              whatsappMessage
            );
          } catch (err) {
            logger.warn(
              `Failed to send WhatsApp reminder to ${phone}: ${err.message}`
            );
          }
        })
      );
    }

    const deliveredAt = new Date();
    const recurring = trigger.recurrence?.frequency === 'yearly';
    await ReminderTrigger.updateOne(
      { _id: trigger._id },
      {
        $set: recurring
          ? {
              status: 'pending',
              scheduledAt: getNextYearlyOccurrence(
                trigger.scheduledAt,
                trigger.timezone
              ),
              lastDeliveredAt: deliveredAt,
            }
          : { status: 'delivered', lastDeliveredAt: deliveredAt },
        $push: {
          deliveryAttempts: {
            status: 'delivered',
            queuedAt: new Date(),
            deliveredAt,
          },
        },
      }
    );
    return {
      success: true,
      emailCount: emails.length,
      whatsappCount: phones.length,
    };
  } catch (error) {
    await ReminderTrigger.updateOne(
      { _id: trigger._id },
      {
        $set: { status: 'failed' },
        $push: {
          deliveryAttempts: {
            status: 'failed',
            queuedAt: new Date(),
            error: error.message,
          },
        },
      }
    );
    throw error;
  }
};

module.exports = {
  createReminderTrigger,
  queryReminderTriggers,
  deleteReminderTrigger,
  suppressEntityReminders,
  queueDueReminders,
  deliverReminder,
};
