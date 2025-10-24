/**
 * Test Email Notifications
 *
 * Tests all email templates and notification triggers
 * Make sure SMTP is configured in .env before running
 */

const emailService = require('./src/services/email.service');
const logger = require('./src/config/logger');

// Configuration
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function testAllEmailTemplates() {
  console.log(
    `\n${colors.cyan}╔════════════════════════════════════════════════════════════╗${colors.reset}`
  );
  console.log(
    `${colors.cyan}║     EMAIL NOTIFICATION TEMPLATES - TEST SUITE             ║${colors.reset}`
  );
  console.log(
    `${colors.cyan}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
  );

  console.log(
    `${colors.blue}ℹ${colors.reset} Test emails will be sent to: ${TEST_EMAIL}\n`
  );

  try {
    // Test 1: Submission Confirmation
    console.log(
      `${colors.cyan}▶${colors.reset} Test 1: Submission Confirmation`
    );
    await emailService.sendSubmissionConfirmation(TEST_EMAIL, {
      userName: 'John Doe',
      submissionId: 'test-sub-123',
      projectName: 'Test PERM Project',
      submittedAt: new Date(),
    });
    console.log(
      `${colors.green}✅${colors.reset} Submission confirmation sent\n`
    );

    // Test 2: PERM Critical Alert (< 40%)
    console.log(`${colors.cyan}▶${colors.reset} Test 2: PERM Critical Alert`);
    await emailService.sendPERMCriticalAlert(TEST_EMAIL, {
      nodeName: 'Downtown Branch',
      month: '2025-10',
      compliance: 30,
      eventsSubmitted: 2,
      eventsRequired: 5,
      daysRemaining: 10,
      submissionId: 'test-perm-123',
    });
    console.log(`${colors.green}✅${colors.reset} Critical alert sent\n`);

    // Test 3: PERM Warning (40-79%)
    console.log(`${colors.cyan}▶${colors.reset} Test 3: PERM Warning`);
    await emailService.sendPERMWarning(TEST_EMAIL, {
      nodeName: 'Downtown Branch',
      month: '2025-10',
      compliance: 60,
      eventsSubmitted: 3,
      eventsRequired: 5,
      daysRemaining: 10,
      submissionId: 'test-perm-456',
    });
    console.log(`${colors.green}✅${colors.reset} Warning sent\n`);

    // Test 4: PERM Completion (100%)
    console.log(`${colors.cyan}▶${colors.reset} Test 4: PERM Completion`);
    await emailService.sendPERMCompletion(TEST_EMAIL, {
      nodeName: 'Downtown Branch',
      month: '2025-10',
      eventsRequired: 5,
      events: [
        'Sunday Service',
        'Bible Study',
        'Prayer Meeting',
        'Youth Service',
        'Women Fellowship',
      ],
      submissionId: 'test-perm-789',
    });
    console.log(`${colors.green}✅${colors.reset} Completion email sent\n`);

    // Test 5: Late Submission Warning
    console.log(
      `${colors.cyan}▶${colors.reset} Test 5: Late Submission Warning`
    );
    await emailService.sendLateSubmissionWarning(TEST_EMAIL, {
      nodeName: 'Downtown Branch',
      month: '2025-09',
      compliance: 40,
      eventsSubmitted: 2,
      eventsRequired: 5,
      daysOverdue: 5,
      submissionId: 'test-late-123',
    });
    console.log(
      `${colors.green}✅${colors.reset} Late submission warning sent\n`
    );

    // Test 6: Weekly Reminder
    console.log(`${colors.cyan}▶${colors.reset} Test 6: Weekly Reminder`);
    await emailService.sendWeeklyReminder(TEST_EMAIL, {
      nodeName: 'Downtown Branch',
      month: '2025-10',
      compliance: 60,
      eventsSubmitted: 3,
      eventsRequired: 5,
      daysRemaining: 15,
      events: [
        { name: 'Sunday Service - Week 1', submitted: true },
        { name: 'Sunday Service - Week 2', submitted: true },
        { name: 'Sunday Service - Week 3', submitted: true },
        { name: 'Sunday Service - Week 4', submitted: false },
        { name: 'Bible Study - Oct 10', submitted: false },
      ],
      submissionId: 'test-reminder-123',
    });
    console.log(`${colors.green}✅${colors.reset} Weekly reminder sent\n`);

    // Test 7: Month-End Summary
    console.log(`${colors.cyan}▶${colors.reset} Test 7: Month-End Summary`);
    await emailService.sendMonthEndSummary(TEST_EMAIL, {
      organizationName: 'Test Organization',
      month: '2025-10',
      overallCompliance: 85,
      totalNodes: 10,
      compliantNodes: 7,
      nonCompliantNodes: 3,
      nodes: [
        {
          name: 'Downtown Branch',
          compliance: 100,
          eventsSubmitted: 5,
          eventsRequired: 5,
          status: 'complete',
        },
        {
          name: 'Uptown Branch',
          compliance: 80,
          eventsSubmitted: 4,
          eventsRequired: 5,
          status: 'partial',
        },
        {
          name: 'Eastside Branch',
          compliance: 40,
          eventsSubmitted: 2,
          eventsRequired: 5,
          status: 'incomplete',
        },
      ],
    });
    console.log(`${colors.green}✅${colors.reset} Month-end summary sent\n`);

    // Test 8: Submission Failed
    console.log(`${colors.cyan}▶${colors.reset} Test 8: Submission Failed`);
    await emailService.sendSubmissionFailed(TEST_EMAIL, {
      userName: 'John Doe',
      submissionId: 'test-failed-123',
      errorMessage: 'Database connection timeout',
      attempts: 5,
    });
    console.log(`${colors.green}✅${colors.reset} Failure notification sent\n`);

    // Success!
    console.log(
      `${colors.green}╔════════════════════════════════════════════════════════════╗${colors.reset}`
    );
    console.log(
      `${colors.green}║              🎉 ALL EMAIL TESTS PASSED! 🎉                ║${colors.reset}`
    );
    console.log(
      `${colors.green}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
    );

    console.log(
      `${colors.blue}ℹ${colors.reset} Check your inbox at: ${TEST_EMAIL}`
    );
    console.log(
      `${colors.blue}ℹ${colors.reset} You should have received 8 test emails\n`
    );

    console.log('📧 Email Summary:');
    console.log('  1. ✅ Submission Received (Purple)');
    console.log('  2. ⚠️  URGENT: Low Compliance (Red)');
    console.log('  3. ⚠️  Compliance Warning (Orange)');
    console.log('  4. 🎉 100% Compliance (Green)');
    console.log('  5. 🚨 Late Submission (Dark Red)');
    console.log('  6. 📅 Weekly Reminder (Blue)');
    console.log('  7. 📊 Monthly Summary (Purple Executive)');
    console.log('  8. ❌ Submission Failed (Red Error)\n');

    process.exit(0);
  } catch (error) {
    console.log(
      `${colors.red}╔════════════════════════════════════════════════════════════╗${colors.reset}`
    );
    console.log(
      `${colors.red}║              ❌ EMAIL TEST FAILED! ❌                      ║${colors.reset}`
    );
    console.log(
      `${colors.red}╚════════════════════════════════════════════════════════════╝${colors.reset}\n`
    );

    console.error(`${colors.red}❌${colors.reset} Error: ${error.message}`);
    console.error(
      `${colors.yellow}⚠️${colors.reset}  Make sure SMTP is configured in .env:\n`
    );
    console.log('   SMTP_HOST=smtp.gmail.com');
    console.log('   SMTP_PORT=587');
    console.log('   SMTP_USERNAME=your-email@gmail.com');
    console.log('   SMTP_PASSWORD=your-app-password');
    console.log('   EMAIL_FROM=noreply@yourapp.com\n');

    process.exit(1);
  }
}

// Run tests
testAllEmailTemplates();

