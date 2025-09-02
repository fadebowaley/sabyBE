const config = require('./config');

const whatsappConfig = {
  // WhatsApp Business API settings
  phoneNumberId: config.whatsapp.phoneNumberId,
  accessToken: config.whatsapp.accessToken,
  verifyToken: config.whatsapp.verifyToken,

  // Admin settings
  adminEmail: 'fadebowaley@gmail.com',
  adminPhone: '+2348145045108',

  // Support settings
  supportEmail: 'support@haloforms.com',
  supportPhone: '+2348145045108',
  supportWebsite: 'https://haloforms.com/support',
  supportWhatsApp: 'https://wa.me/2348145045108',

  // Business hours (WAT - West Africa Time)
  businessHours: {
    start: '09:00',
    end: '18:00',
    timezone: 'WAT',
    days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  },

  // Email templates
  emailTemplates: {
    senderSubject: 'Form Submission Confirmation - {projectName}',
    adminSubject: 'New Form Submission - {projectName}',

    senderTemplate: `Dear {userName},

Thank you for your submission to {projectName}.

We have successfully received your data and it has been queued for processing. You will receive another notification once processing is complete.

Submission Details:
- Project: {projectName}
- Submission ID: {jobId}
- Received: {timestamp}
- Status: Queued for processing

Your submission data:
{submissionData}

If you have any questions, please contact our support team.

Best regards,
Halo Forms Team`,

    adminTemplate: `New form submission received:

Project: {projectName}
User: {userName} ({userEmail})
Phone: {userPhone}
Submission ID: {jobId}
Received: {timestamp}

Submission Data:
{submissionData}

User Details:
- Name: {userName}
- Email: {userEmail}
- Phone: {userPhone}
- Tenant: {tenantId}
- User ID: {userId}

This submission has been queued for processing.

Best regards,
Halo Forms System`,
  },

  // Web App settings
  webApp: {
    url: `${config.baseUrl || 'http://localhost:3000'}/whatsapp-webapp`,
    title: 'Halo Forms',
    description: 'Complete your forms with our modern interface',
  },

  // Message settings
  messages: {
    welcome: {
      title: '🎉 Welcome to Halo Forms!',
      subtitle: 'Complete forms quickly and easily',
    },
    help: {
      title: '❓ Halo Forms Bot Help',
      subtitle: 'Everything you need to know',
    },
    support: {
      title: '🆘 Support Center',
      subtitle: "We're here to help",
    },
  },

  // Rate limiting
  rateLimit: {
    maxRequestsPerMinute: 30,
    maxRequestsPerHour: 100,
  },

  // Session settings
  session: {
    timeoutMinutes: 30,
    maxRetries: 3,
  },

  // WhatsApp Business API specific settings
  api: {
    version: 'v18.0',
    baseUrl: 'https://graph.facebook.com',
    webhookPath: '/webhook',
    messageTypes: {
      text: 'text',
      image: 'image',
      document: 'document',
      audio: 'audio',
      video: 'video',
      location: 'location',
      contact: 'contact',
      sticker: 'sticker',
      interactive: 'interactive',
    },
    interactiveTypes: {
      button: 'button',
      list: 'list',
    },
  },
};

module.exports = whatsappConfig;
