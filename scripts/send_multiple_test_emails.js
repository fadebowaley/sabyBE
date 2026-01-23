const nodemailer = require('nodemailer');

// Gmail credentials
const GMAIL_USER = 'fadebowaley@gmail.com';
const GMAIL_PASSWORD = 'tfdz xyzy rpui geks'; // App password
const TO_EMAIL = 'sendo@jmsfagribusiness.com';
const PROJECT_ID = 'proj_xzN3KGnRNP3G';

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASSWORD,
  },
});

// Test data for different emails
const testData = [
  {
    name: 'John Doe',
    email: 'john.doe@example.com',
    phone: '+1234567890',
    message: 'First test email - Basic validation test with standard data.',
  },
  {
    name: 'Jane Smith',
    email: 'jane.smith@example.com',
    phone: '+1987654321',
    message: 'Second test email - Testing with different user information.',
  },
  {
    name: 'Mike Johnson',
    email: 'mike.johnson@example.com',
    phone: '+1555123456',
    message: 'Third test email - Validation test with another unique dataset.',
  },
  {
    name: 'Sarah Wilson',
    email: 'sarah.wilson@example.com',
    phone: '+1444567890',
    message:
      'Fourth test email - Testing form field validation with varied input.',
  },
  {
    name: 'David Brown',
    email: 'david.brown@example.com',
    phone: '+1333789456',
    message:
      'Fifth test email - Comprehensive validation testing with new data.',
  },
  {
    name: 'Emily Davis',
    email: 'emily.davis@example.com',
    phone: '+1222345678',
    message:
      'Sixth test email - Testing email validation flow with different sender info.',
  },
  {
    name: 'Robert Miller',
    email: 'robert.miller@example.com',
    phone: '+1111567890',
    message:
      'Seventh test email - Validation test with unique contact information.',
  },
  {
    name: 'Lisa Garcia',
    email: 'lisa.garcia@example.com',
    phone: '+1999876543',
    message: 'Eighth test email - Testing system with varied form submissions.',
  },
  {
    name: 'James Rodriguez',
    email: 'james.rodriguez@example.com',
    phone: '+1888765432',
    message:
      'Ninth test email - Validation flow testing with different user data.',
  },
  {
    name: 'Maria Martinez',
    email: 'maria.martinez@example.com',
    phone: '+1777654321',
    message:
      'Tenth test email - Testing email ingestion with unique submission data.',
  },
  {
    name: 'Thomas Anderson',
    email: 'thomas.anderson@example.com',
    phone: '+1666543210',
    message:
      'Eleventh test email - Validation testing with varied form field data.',
  },
  {
    name: 'Jennifer Taylor',
    email: 'jennifer.taylor@example.com',
    phone: '+1555432109',
    message:
      'Twelfth test email - Testing system performance with multiple submissions.',
  },
  {
    name: 'Christopher Lee',
    email: 'christopher.lee@example.com',
    phone: '+1444321098',
    message:
      'Thirteenth test email - Validation flow testing with different datasets.',
  },
  {
    name: 'Amanda White',
    email: 'amanda.white@example.com',
    phone: '+1333210987',
    message:
      'Fourteenth test email - Testing email validation with unique information.',
  },
  {
    name: 'Daniel Clark',
    email: 'daniel.clark@example.com',
    phone: '+1222109876',
    message:
      'Fifteenth test email - Validation testing with varied form submissions.',
  },
  {
    name: 'Nicole Lewis',
    email: 'nicole.lewis@example.com',
    phone: '+1111098765',
    message:
      'Sixteenth test email - Testing system with different user data sets.',
  },
  {
    name: 'Kevin Hall',
    email: 'kevin.hall@example.com',
    phone: '+1999987654',
    message:
      'Seventeenth test email - Validation flow testing with unique contact info.',
  },
  {
    name: 'Stephanie Young',
    email: 'stephanie.young@example.com',
    phone: '+1888876543',
    message:
      'Eighteenth test email - Testing email ingestion with varied submissions.',
  },
  {
    name: 'Brian King',
    email: 'brian.king@example.com',
    phone: '+1777765432',
    message:
      'Nineteenth test email - Validation testing with different form data.',
  },
  {
    name: 'Rachel Scott',
    email: 'rachel.scott@example.com',
    phone: '+1666654321',
    message:
      'Twentieth test email - Final validation test with comprehensive data set.',
  },
];

// Function to create email template
function createEmailTemplate(data, emailNumber) {
  return {
    from: GMAIL_USER,
    to: TO_EMAIL,
    subject: `Test Email #${emailNumber} - Validation Testing (${data.name})`,
    text: `Project ID: ${PROJECT_ID}

Full Name: ${data.name}
Email Address: ${data.email}
Phone Number: ${data.phone}
Message: ${data.message}

Test Information:
- Email Number: ${emailNumber}/20
- Sender: fadebowaley@gmail.com
- Expected Tenant ID: 7vR-Ldacit
- Project ID: ${PROJECT_ID}
- Validation should complete successfully

Debug Details:
- Username: fadebowaley@gmail.com
- Password: tfdz xyzy rpui geks (app password)
- Database connection should be established
- Debug logging is enabled

This is test email #${emailNumber} of 20 for comprehensive validation testing.`,

    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test Email #${emailNumber} - Validation Testing</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Test Email #${emailNumber} - Validation Testing</h2>

        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #495057;">Project Information</h3>
            <p><strong>Project ID:</strong> ${PROJECT_ID}</p>
            <p><strong>Test Email:</strong> ${emailNumber}/20</p>
        </div>

        <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #155724;">Form Data</h3>
            <p><strong>Full Name:</strong> ${data.name}</p>
            <p><strong>Email Address:</strong> ${data.email}</p>
            <p><strong>Phone Number:</strong> ${data.phone}</p>
            <p><strong>Message:</strong> ${data.message}</p>
        </div>

        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #856404;">Test Details</h3>
            <p><strong>Sender:</strong> fadebowaley@gmail.com</p>
            <p><strong>Expected Tenant ID:</strong> 7vR-Ldacit</p>
            <p><strong>Project ID:</strong> ${PROJECT_ID}</p>
            <p><strong>Validation Status:</strong> Should complete successfully</p>
        </div>

        <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #0c5460;">Expected Validation Flow</h3>
            <ol>
                <li>Email authorization (sender validation)</li>
                <li>Project ID lookup (to find tenant ID)</li>
                <li>Tenant access validation</li>
                <li>Project status validation</li>
                <li>Form field validation</li>
            </ol>
        </div>

        <div style="background-color: #f8d7da; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #721c24;">Debug Information</h3>
            <p><strong>Username:</strong> fadebowaley@gmail.com</p>
            <p><strong>Password:</strong> tfdz xyzy rpui geks (app password)</p>
            <p><strong>Email Number:</strong> ${emailNumber}/20</p>
            <p><strong>Database Connection:</strong> Should be properly established</p>
        </div>

        <p style="text-align: center; color: #6c757d; font-size: 14px; margin-top: 30px;">
            Test email #${emailNumber} of 20 for comprehensive validation testing.
        </p>
    </div>
</body>
</html>
    `,
  };
}

// Function to send a single email
async function sendEmail(emailTemplate, emailNumber) {
  try {
    console.log(`📧 Sending test email #${emailNumber}...`);

    const info = await transporter.sendMail(emailTemplate);

    console.log(`✅ Email #${emailNumber} sent successfully!`);
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Subject: ${emailTemplate.subject}`);
    console.log(`   Recipient: ${emailTemplate.to}`);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Error sending email #${emailNumber}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Function to send all emails with delay
async function sendAllEmails() {
  console.log('🚀 Starting to send 20 test emails...');
  console.log('📋 Configuration:');
  console.log(`   - From: ${GMAIL_USER}`);
  console.log(`   - To: ${TO_EMAIL}`);
  console.log(`   - Project ID: ${PROJECT_ID}`);
  console.log(`   - Expected Tenant: 7vR-Ldacit`);
  console.log('');

  const results = [];
  const delay = 2000; // 2 seconds between emails to avoid rate limiting

  for (let i = 0; i < testData.length; i++) {
    const data = testData[i];
    const emailNumber = i + 1;
    const emailTemplate = createEmailTemplate(data, emailNumber);

    const result = await sendEmail(emailTemplate, emailNumber);
    results.push({ emailNumber, ...result });

    // Add delay between emails (except for the last one)
    if (i < testData.length - 1) {
      console.log(`⏳ Waiting ${delay / 1000} seconds before next email...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // Summary
  console.log('\n📊 Email Sending Summary:');
  console.log('========================');
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`✅ Successful: ${successful}/20`);
  console.log(`❌ Failed: ${failed}/20`);

  if (failed > 0) {
    console.log('\n❌ Failed emails:');
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`   Email #${r.emailNumber}: ${r.error}`);
      });
  }

  console.log('\n🔍 Next Steps:');
  console.log('1. Check email ingestion logs: pm2 logs email-ingestor');
  console.log('2. Monitor validation process for all 20 emails');
  console.log('3. Verify database connection and validation flow');
  console.log('4. Check if all validation steps complete successfully');
  console.log('5. Look for any patterns in validation errors');

  return results;
}

// Run the email sending
sendAllEmails().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
