# 📧 Production Email Notification Setup

**Complete Guide for Email Notifications**

---

## 📊 CURRENT STATE

### ✅ What Exists:
- ✅ Basic email service (`email.service.js`)
- ✅ Nodemailer configured
- ✅ PERM notification worker structure
- ✅ Notification queue service
- ✅ Reset password emails
- ✅ OTP emails
- ✅ Verification emails

### ❌ What's Missing:
- ❌ Email service not configured in workers
- ❌ No submission confirmation emails
- ❌ No PERM compliance alert emails
- ❌ No daily digest emails
- ❌ No error alert emails
- ❌ No email templates
- ❌ No email tracking/analytics

---

## 🔧 STEP 1: Configure Email Service in Workers

### Update PERM Notification Worker:

```javascript
// src/workers/permNotification.worker.js

const { Worker, QueueEvents } = require('bullmq');
const { getRedisConnectionOptions } = require('../config/redis');
const logger = require('../config/logger');
const emailService = require('../services/email.service'); // ✅ Import real service
const { permNotificationService } = require('../services');

const PERM_NOTIFICATION_QUEUE_NAME = 'permNotificationQueue';

const createPermNotificationWorker = () => {
  const worker = new Worker(
    PERM_NOTIFICATION_QUEUE_NAME,
    async (job) => {
      logger.info(`📧 Processing PERM notification job: ${job.id}`);

      const notification = job.data;
      const {
        notification_type,
        recipient_email,
        recipient_name,
        subject,
        message,
        node_name,
        month,
        compliance_percentage,
        events_submitted,
        events_required,
      } = notification;

      try {
        // ✅ Send email using actual email service
        if (recipient_email) {
          let emailSubject = subject;
          let emailBody = message;

          // Customize based on notification type
          switch (notification_type) {
            case 'incomplete_alert':
              emailSubject = `⚠️ URGENT: Incomplete PERM Submission - ${node_name}`;
              emailBody = `
Dear ${recipient_name || 'Admin'},

This is an urgent alert regarding your PERM submission for ${month}.

Current Status:
- Node: ${node_name}
- Compliance: ${compliance_percentage}%
- Events Submitted: ${events_submitted}/${events_required}
- Status: Incomplete

Please complete your submission as soon as possible to avoid compliance issues.

View Details: ${process.env.CLIENT_URL}/submissions/${notification.submission_id}

Best regards,
PERM System
              `;
              break;

            case 'completion_confirmation':
              emailSubject = `✅ PERM Submission Complete - ${node_name}`;
              emailBody = `
Dear ${recipient_name || 'Admin'},

Congratulations! Your PERM submission for ${month} is now 100% complete.

Summary:
- Node: ${node_name}
- Compliance: 100%
- Events Submitted: ${events_required}/${events_required}
- Status: Complete

Thank you for your timely submission!

Best regards,
PERM System
              `;
              break;

            case 'late_submission_warning':
              emailSubject = `⚠️ Late Submission Warning - ${node_name}`;
              emailBody = `
Dear ${recipient_name || 'Admin'},

Your PERM submission for ${month} is overdue.

Current Status:
- Node: ${node_name}
- Compliance: ${compliance_percentage}%
- Days Overdue: ${notification.days_overdue || 'N/A'}

Please submit immediately to avoid penalties.

Best regards,
PERM System
              `;
              break;
          }

          // Send email
          await emailService.sendEmail(
            recipient_email,
            emailSubject,
            emailBody
          );

          // Update notification status
          if (permNotificationService.updateNotificationStatus) {
            await permNotificationService.updateNotificationStatus(
              notification.id,
              'sent',
              `Email sent to ${recipient_email}`
            );
          }

          logger.info(
            `✅ PERM notification sent: ${notification_type} to ${recipient_email}`
          );
        } else {
          logger.warn(
            `⚠️  No recipient email provided for notification ${notification.id}`
          );
        }

        return { success: true, notification_id: notification.id };
      } catch (error) {
        logger.error(`❌ PERM notification failed: ${error.message}`);

        // Update notification status to failed
        if (permNotificationService.updateNotificationStatus) {
          await permNotificationService.updateNotificationStatus(
            notification.id,
            'failed',
            error.message
          );
        }

        throw error;
      }
    },
    {
      connection: getRedisConnectionOptions(),
      concurrency: 5,
      // ✅ Retry failed email sends
      settings: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info(`✅ PERM notification worker completed job: ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    logger.error(
      `❌ PERM notification worker failed job: ${job.id}`,
      err.message
    );
  });

  return worker;
};

if (require.main === module) {
  logger.info('🚀 Starting PERM notification worker (standalone mode)...');
  createPermNotificationWorker();
}

module.exports = { createPermNotificationWorker };
```

---

## 🎨 STEP 2: Create Email Templates

### Create Template Service:

```javascript
// src/services/emailTemplate.service.js

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');

class EmailTemplateService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/emails');
    this.cache = new Map();
  }

  /**
   * Load and compile email template
   */
  async loadTemplate(templateName) {
    // Check cache
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName);
    }

    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);
      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);

      // Cache the compiled template
      this.cache.set(templateName, compiledTemplate);

      return compiledTemplate;
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error);
      return null;
    }
  }

  /**
   * Render template with data
   */
  async render(templateName, data) {
    const template = await this.loadTemplate(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    return template(data);
  }
}

module.exports = new EmailTemplateService();
```

### Create Template Files:

```handlebars
<!-- src/templates/emails/submission-confirmation.hbs -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background: #f9f9f9; }
    .button { background: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; border-radius: 4px; }
    .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Submission Received</h1>
    </div>
    
    <div class="content">
      <p>Dear {{userName}},</p>
      
      <p>Your submission has been received successfully!</p>
      
      <h3>Submission Details:</h3>
      <ul>
        <li><strong>Submission ID:</strong> {{submissionId}}</li>
        <li><strong>Project:</strong> {{projectName}}</li>
        <li><strong>Submitted:</strong> {{submittedAt}}</li>
        <li><strong>Status:</strong> Queued for Processing</li>
      </ul>
      
      <p>Your submission is now being processed and you will receive updates via email.</p>
      
      <p>
        <a href="{{statusUrl}}" class="button">View Submission Status</a>
      </p>
    </div>
    
    <div class="footer">
      <p>© 2025 PERM System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
```

```handlebars
<!-- src/templates/emails/perm-compliance-alert.hbs -->
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { padding: 20px; text-align: center; }
    .header.critical { background: #f44336; color: white; }
    .header.warning { background: #ff9800; color: white; }
    .header.success { background: #4CAF50; color: white; }
    .content { padding: 20px; background: #f9f9f9; }
    .progress-bar { background: #e0e0e0; border-radius: 10px; height: 30px; position: relative; }
    .progress-fill { background: {{progressColor}}; height: 100%; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; }
    .button { background: #2196F3; color: white; padding: 12px 24px; text-decoration: none; display: inline-block; border-radius: 4px; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header {{alertLevel}}">
      <h1>{{alertIcon}} {{alertTitle}}</h1>
    </div>
    
    <div class="content">
      <p>Dear {{nodeName}} Administrator,</p>
      
      <p>{{alertMessage}}</p>
      
      <h3>Compliance Status:</h3>
      <div class="progress-bar">
        <div class="progress-fill" style="width: {{compliance}}%;">
          {{compliance}}%
        </div>
      </div>
      
      <ul>
        <li><strong>Node:</strong> {{nodeName}}</li>
        <li><strong>Month:</strong> {{month}}</li>
        <li><strong>Events Submitted:</strong> {{eventsSubmitted}}/{{eventsRequired}}</li>
        <li><strong>Days Remaining:</strong> {{daysRemaining}}</li>
      </ul>
      
      <p>
        <a href="{{submissionUrl}}" class="button">Complete Submission</a>
      </p>
    </div>
    
    <div class="footer">
      <p>This is an automated notification from the PERM System.</p>
    </div>
  </div>
</body>
</html>
```

---

## 🔔 STEP 3: Trigger Email Notifications

### Update Submission Worker to Trigger Emails:

```javascript
// src/workers/submission.worker.js

// After successful submission, trigger confirmation email
if (result && result.submission) {
  // Queue confirmation email
  await notificationQueue.add('submission-confirmation', {
    userId: userId,
    submissionId: result.submission.id,
    projectName: project_name,
    tenantId: tenantId,
  });
}

// For PERM submissions, trigger compliance alerts
if (isPERMSubmission && result.compliance) {
  const compliance = result.compliance.event_compliance_percentage;
  
  // Trigger alert based on compliance level
  if (compliance < 40) {
    await notificationQueue.add('perm-critical-alert', {
      nodeId: nodeId,
      submissionId: result.submission.id,
      compliance: compliance,
      month: month,
      tenantId: tenantId,
    });
  } else if (compliance === 100) {
    await notificationQueue.add('perm-completion', {
      nodeId: nodeId,
      submissionId: result.submission.id,
      month: month,
      tenantId: tenantId,
    });
  }
}
```

---

## 📧 STEP 4: Environment Configuration

### Update `.env`:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourapp.com

# Email Features
EMAIL_ENABLED=true
SEND_CONFIRMATION_EMAILS=true
SEND_PERM_ALERTS=true
SEND_DAILY_DIGEST=true

# Admin Emails
ADMIN_EMAIL=admin@yourapp.com
TECH_TEAM_EMAIL=tech@yourapp.com

# Client URL (for email links)
CLIENT_URL=https://yourapp.com
```

---

## 🧪 STEP 5: Test Email Notifications

### Create Test Script:

```javascript
// test-email-notifications.js

const emailService = require('./src/services/email.service');
const logger = require('./src/config/logger');

async function testEmails() {
  console.log('🧪 Testing Email Notifications...\n');

  try {
    // Test 1: Basic email
    console.log('📧 Test 1: Sending basic email...');
    await emailService.sendEmail(
      'test@example.com',
      'Test Email',
      'This is a test email from the system.'
    );
    console.log('✅ Basic email sent\n');

    // Test 2: Submission confirmation
    console.log('📧 Test 2: Sending submission confirmation...');
    // Add your test here

    // Test 3: PERM alert
    console.log('📧 Test 3: Sending PERM alert...');
    // Add your test here

    console.log('\n✅ All email tests passed!');
  } catch (error) {
    console.error('\n❌ Email test failed:', error.message);
  }
}

testEmails();
```

---

## 📋 EMAIL NOTIFICATION CHECKLIST

### Implement These Notifications:

- [ ] 1. **Submission Confirmation** - Sent immediately after submission
- [ ] 2. **PERM Critical Alert** - < 40% compliance
- [ ] 3. **PERM Warning Alert** - 40-79% compliance
- [ ] 4. **PERM Completion** - 100% compliance
- [ ] 5. **Late Submission Warning** - Overdue submissions
- [ ] 6. **Daily Digest** - Daily summary for admins
- [ ] 7. **Weekly Summary** - Weekly compliance report
- [ ] 8. **Error Alerts** - System errors to tech team
- [ ] 9. **Password Reset** - ✅ Already implemented
- [ ] 10. **Email Verification** - ✅ Already implemented
- [ ] 11. **OTP** - ✅ Already implemented

---

## 🚀 QUICK START

```bash
# 1. Install dependencies (if not already installed)
npm install handlebars

# 2. Create email templates directory
mkdir -p src/templates/emails

# 3. Update worker with email integration
# (Apply code changes from Step 1)

# 4. Configure environment variables
# (Update .env with SMTP settings)

# 5. Test emails
node test-email-notifications.js

# 6. Restart application
npm run dev
```

---

**Status:** Ready to implement  
**Estimated Time:** 4-6 hours  
**Priority:** HIGH


