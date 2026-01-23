/**
 * Simple Email Test - Verify Mailtrap Connection
 */

const nodemailer = require('nodemailer');
const config = require('./src/config/config');

async function testMailtrapConnection() {
  console.log('\n📧 Testing Mailtrap Email Connection...\n');
  
  console.log('Configuration:');
  console.log(`  Host: ${config.email.smtp.host}`);
  console.log(`  Port: ${config.email.smtp.port}`);
  console.log(`  Username: ${config.email.smtp.auth.user}`);
  console.log(`  From: ${config.email.from}\n`);

  try {
    // Create transporter
    const transport = nodemailer.createTransport(config.email.smtp);
    
    // Verify connection
    console.log('🔍 Step 1: Verifying connection...');
    await transport.verify();
    console.log('✅ Connection verified!\n');
    
    // Send test email
    console.log('📤 Step 2: Sending test email...');
    const info = await transport.sendMail({
      from: config.email.from,
      to: 'test@example.com',
      subject: '🧪 Test Email from Saby Backend',
      text: 'This is a test email to verify Mailtrap integration.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
          <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h1 style="color: #667eea; margin: 0;">🧪 Test Email</h1>
            <p style="font-size: 16px; color: #333; line-height: 1.6;">
              This is a test email from your Saby Backend to verify Mailtrap integration is working correctly.
            </p>
            <div style="background: #e7f3ff; padding: 15px; border-left: 4px solid #007bff; border-radius: 4px; margin: 20px 0;">
              <strong>✅ If you received this email, your SMTP configuration is working perfectly!</strong>
            </div>
            <p style="color: #6c757d; font-size: 14px;">
              Sent at: ${new Date().toLocaleString()}<br>
              Environment: ${config.env}
            </p>
          </div>
        </div>
      `,
    });
    
    console.log('✅ Email sent successfully!\n');
    console.log('📊 Email Details:');
    console.log(`   Message ID: ${info.messageId}`);
    console.log(`   Response: ${info.response}`);
    console.log(`   Accepted: ${info.accepted?.join(', ') || 'N/A'}`);
    console.log(`   Rejected: ${info.rejected?.length || 0}`);
    
    console.log('\n🎉 Mailtrap connection is working!\n');
    console.log('📧 Check your Mailtrap inbox:');
    console.log('   1. Go to https://mailtrap.io/inboxes');
    console.log(`   2. Login with account using: ${config.email.smtp.auth.user}`);
    console.log('   3. You should see the test email\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Email test failed!\n');
    console.error(`Error: ${error.message}`);
    
    if (error.code === 'EAUTH') {
      console.error('\n🔴 Authentication failed!');
      console.error('   - Check SMTP_USERNAME is correct');
      console.error('   - Check SMTP_PASSWORD is correct');
      console.error('   - Verify Mailtrap credentials');
    } else if (error.code === 'ECONNECTION') {
      console.error('\n🔴 Connection failed!');
      console.error('   - Check SMTP_HOST and SMTP_PORT');
      console.error('   - Verify network connectivity');
    } else {
      console.error(`\n🔴 Error code: ${error.code}`);
      console.error(`   Stack: ${error.stack}`);
    }
    
    process.exit(1);
  }
}

testMailtrapConnection();


