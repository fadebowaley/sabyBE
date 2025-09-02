// smtp.handler.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.yourdomain.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendReply({ to, subject, text }) {
  return transporter.sendMail({
    from: `"Ingestor System" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  });
}

module.exports = { sendReply };
