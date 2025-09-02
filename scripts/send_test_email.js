const nodemailer = require('nodemailer');

// Gmail credentials
const GMAIL_USER = 'fadebowaley@gmail.com';
const GMAIL_PASSWORD = 'tfdz xyzy rpui geks'; // App password
const TO_EMAIL = 'sendo@jmsfagribusiness.com';

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASSWORD,
  },
});

// Email template for testing validation
const emailTemplate = {
  from: GMAIL_USER,
  to: TO_EMAIL,
  subject: 'Test Email Submission - Validation Flow Testing',
  text: `Project ID: proj_1VOA1DzFtUf2

Full Name: John Doe
Email Address: john.doe@example.com
Phone Number: +1234567890
Message: This is a comprehensive test message for email validation flow testing. The system should now validate in the correct order: 1) Email authorization (sender validation), 2) Project ID lookup (to find tenant ID), 3) Tenant access validation, 4) Project status validation, 5) Form field validation.

Additional Information:
- Sender (fadebowaley@gmail.com) is a registered user with tenant ID: 7vR-Ldacit
- Project form (proj_1VOA1DzFtUf2) exists and belongs to the same tenant
- All required fields are included with valid data
- Database connection should now be properly established
- Debug logging is enabled to track the validation process

Test Details:
- Username: fadebowaley@gmail.com
- Password: tfdz xyzy rpui geks (app password)
- Expected tenant ID: 7vR-Ldacit
- Expected project ID: proj_1VOA1DzFtUf2
- Validation should complete successfully

Please check the email ingestion logs for detailed validation steps.`,

  html: `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test Email Submission - Validation Flow Testing</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2c3e50;">Test Email Submission - Validation Flow Testing</h2>

        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #495057;">Project Information</h3>
            <p><strong>Project ID:</strong> proj_1VOA1DzFtUf2</p>
        </div>

        <div style="background-color: #e8f5e8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #155724;">Form Data</h3>
            <p><strong>Full Name:</strong> John Doe</p>
            <p><strong>Email Address:</strong> john.doe@example.com</p>
            <p><strong>Phone Number:</strong> +1234567890</p>
            <p><strong>Message:</strong> This is a comprehensive test message for email validation flow testing. The system should now validate in the correct order: 1) Email authorization (sender validation), 2) Project ID lookup (to find tenant ID), 3) Tenant access validation, 4) Project status validation, 5) Form field validation.</p>
        </div>

        <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #856404;">Test Details</h3>
            <p><strong>Sender:</strong> fadebowaley@gmail.com</p>
            <p><strong>Expected Tenant ID:</strong> 7vR-Ldacit</p>
            <p><strong>Expected Project ID:</strong> proj_1VOA1DzFtUf2</p>
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
            <p><strong>Database Connection:</strong> Should be properly established</p>
            <p><strong>Debug Logging:</strong> Enabled to track validation process</p>
        </div>

        <p style="text-align: center; color: #6c757d; font-size: 14px; margin-top: 30px;">
            Please check the email ingestion logs for detailed validation steps.
        </p>
    </div>
</body>
</html>
  `,
};

// Send the email
async function sendTestEmail() {
  try {
    console.log('📧 Sending test email...');
    console.log('From:', GMAIL_USER);
    console.log('To:', TO_EMAIL);
    console.log('Subject:', emailTemplate.subject);

    const info = await transporter.sendMail(emailTemplate);

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Preview URL:', nodemailer.getTestMessageUrl(info));

    console.log('\n📋 Email Details:');
    console.log('- Project ID: proj_1VOA1DzFtUf2');
    console.log('- Sender: fadebowaley@gmail.com');
    console.log('- Expected Tenant: 7vR-Ldacit');
    console.log('- All required fields included');

    console.log('\n🔍 Next Steps:');
    console.log('1. Check email ingestion logs: pm2 logs email-ingestor');
    console.log('2. Look for validation steps in the logs');
    console.log('3. Verify database connection is working');
    console.log('4. Check if all validation steps complete successfully');
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.error('Full error:', error);
  }
}

// Run the email sending
sendTestEmail();
