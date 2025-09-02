const nodemailer = require('nodemailer');

// Gmail credentials for testing
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

// Foolproof email template with guaranteed working format
function createFoolproofEmailTemplate() {
  return {
    from: GMAIL_USER,
    to: TO_EMAIL,
    subject: `📋 Form Submission - ${PROJECT_ID} - ${new Date().toISOString()}`,
    text: `This is a form submission email.

PROJECT ID: ${PROJECT_ID}
TENANT ID: 7vR-Ldacit

FORM DATA:
Full Name: John Smith
Email Address: john.smith@example.com
Phone Number: +1234567890
Message: This is a test submission to verify the email validation system is working correctly.

SUBMISSION METADATA:
- Submitted by: fadebowaley@gmail.com
- Project: REMITTANCE
- Form Type: Email Submission
- Validation Required: Yes

This email should be processed by the email ingestion system and validated successfully.

Best regards,
Test User`,
    html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Form Submission - ${PROJECT_ID}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #007bff;">📋 Form Submission</h1>
        </div>

        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #495057;">Submission Details</h3>
            <p><strong>Project ID:</strong> ${PROJECT_ID}</p>
            <p><strong>Tenant ID:</strong> 7vR-Ldacit</p>
            <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div style="background-color: #e9ecef; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #495057;">Form Data</h3>
            <p><strong>Full Name:</strong> John Smith</p>
            <p><strong>Email Address:</strong> john.smith@example.com</p>
            <p><strong>Phone Number:</strong> +1234567890</p>
            <p><strong>Message:</strong> This is a test submission to verify the email validation system is working correctly.</p>
        </div>

        <div style="background-color: #d1ecf1; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #0c5460;">System Information</h3>
            <p><strong>Submitted by:</strong> fadebowaley@gmail.com</p>
            <p><strong>Project:</strong> REMITTANCE</p>
            <p><strong>Form Type:</strong> Email Submission</p>
            <p><strong>Validation Required:</strong> Yes</p>
        </div>

        <p>This email should be processed by the email ingestion system and validated successfully.</p>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            <p style="color: #6c757d; font-size: 14px;">
                Best regards,<br>
                Test User
            </p>
        </div>
    </div>
</body>
</html>
    `,
  };
}

// Send the foolproof email
async function sendFoolproofEmail() {
  try {
    console.log('🚀 Sending foolproof email template...');
    console.log('📋 Configuration:');
    console.log(`   - From: ${GMAIL_USER}`);
    console.log(`   - To: ${TO_EMAIL}`);
    console.log(`   - Project ID: ${PROJECT_ID}`);
    console.log(`   - Expected Tenant: 7vR-Ldacit`);

    const emailTemplate = createFoolproofEmailTemplate();
    const info = await transporter.sendMail(emailTemplate);

    console.log('\n✅ Foolproof email sent successfully!');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Subject: ${emailTemplate.subject}`);

    console.log('\n🔍 Expected System Behavior:');
    console.log('============================');
    console.log('1. Email will be picked up by email-ingestor worker');
    console.log('2. Sender validation will pass (fadebowaley@gmail.com is registered user)');
    console.log('3. Project form validation will pass (proj_xzN3KGnRNP3G exists)');
    console.log('4. Tenant access validation will pass (user belongs to 7vR-Ldacit)');
    console.log('5. Form field validation will pass (all required fields present)');
    console.log('6. Duplicate prevention will pass (first submission)');
    console.log('7. Submission will be queued for processing');
    console.log('8. Confirmation email will be sent to fadebowaley@gmail.com');

    console.log('\n📧 Email Content Preview:');
    console.log('=========================');
    console.log('Subject:', emailTemplate.subject);
    console.log('Text Content:');
    console.log(emailTemplate.text);

    console.log('\n🔍 Next Steps:');
    console.log('==============');
    console.log('1. Check email ingestion logs: pm2 logs email-ingestor');
    console.log('2. Monitor validation process in logs');
    console.log('3. Check if confirmation email is received');
    console.log('4. Verify submission is created in database');
  } catch (error) {
    console.error('❌ Failed to send foolproof email:', error.message);
  }
}

sendFoolproofEmail().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
