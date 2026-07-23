const TelegramBot = require('node-telegram-bot-api');
const config = require('../../../config/config');
const logger = require('../../../config/logger');
const sessionManager = require('../session');
const emailService = require('../../../services/email.service');

/**
 * Telegram Notification Service
 * Handles sending notifications and responses to users via Telegram bot
 */

class TelegramNotificationService {
  constructor() {
    this.bot = new TelegramBot(config.telegram.botToken, { polling: false });
  }

  /**
   * Send enhanced welcome message with better UI
   */
  async sendEnhancedWelcomeMessage(chatId, userName) {
    const welcomeMessage = `🎉 *Welcome to Halo Forms, ${userName}!*

I'm your personal form assistant that helps you complete forms quickly and easily.

*What I can do:*
• 📋 Complete forms with a modern interface
• 📱 Use our beautiful Web App for better experience
• 📊 Track your submission status
• 🔔 Get instant notifications

*Quick Commands:*
/start - Start a new form
/help - Show help and commands
/support - Get support
/status - Check your status
/menu - Show main menu
/reset - Reset your session

*Ready to get started?* Share your phone number to authenticate and access your forms.`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '📱 Share Phone Number',
            request_contact: true,
          },
        ],
        [
          {
            text: '🌐 Use Web App',
            web_app: {
              url: `${
                process.env.BASE_URL || 'http://localhost:3000'
              }/telegram-webapp`,
            },
          },
        ],
        [
          {
            text: '❓ Help',
            callback_data: 'help',
          },
          {
            text: '🆘 Support',
            callback_data: 'support',
          },
        ],
      ],
    };

    await this.bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  /**
   * Send comprehensive help message
   */
  async sendHelpMessage(chatId) {
    const helpMessage = `❓ *Halo Forms Bot Help*

*Available Commands:*
/start - Start the bot and authenticate
/help - Show this help message
/support - Get support and contact info
/status - Check your current status
/menu - Show main menu
/reset - Reset your session

*How to use:*
1️⃣ Send /start to begin
2️⃣ Share your phone number for authentication
3️⃣ Choose a project from the list
4️⃣ Fill out the form questions
5️⃣ Review and submit your answers

*Features:*
• 📱 Modern Web App interface
• 🔐 Secure authentication
• 📊 Real-time progress tracking
• 🔔 Instant notifications
• 📧 Email confirmations

*Need help?* Use /support to contact our team.`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '🚀 Start New Form',
            callback_data: 'start_form',
          },
        ],
        [
          {
            text: '🌐 Open Web App',
            web_app: {
              url: `${
                process.env.BASE_URL || 'http://localhost:3000'
              }/telegram-webapp`,
            },
          },
        ],
        [
          {
            text: '🆘 Contact Support',
            callback_data: 'support',
          },
        ],
      ],
    };

    await this.bot.sendMessage(chatId, helpMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  /**
   * Send support message with contact information
   * @param {string} chatId - Telegram chat ID
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendSupportMessage(chatId, userName) {
    try {
      const supportMessage = `🆘 Support Center

Hello ${userName || 'there'}! Need help with Halo Forms?

Contact Options:
📧 Email: support@haloforms.com
📱 WhatsApp: +234 814 504 5108
🌐 Website: https://haloforms.com/support

Common Issues:
• Can't authenticate? Try /reset then /start
• Form not loading? Check your internet connection
• Submission failed? Contact support with your chat ID: ${chatId}

Response Time:
We typically respond within 2-4 hours during business hours (9 AM - 6 PM WAT).

Emergency Support:
For urgent issues, please call: +234 814 504 5108`;

      const keyboard = {
        keyboard: [
          [{ text: '📧 Email Support' }],
          [{ text: '📱 WhatsApp Support' }],
          [{ text: '🏠 Back to Menu' }],
        ],
        resize_keyboard: true,
      };

      const result = await this.bot.sendMessage(chatId, supportMessage, {
        reply_markup: keyboard,
      });

      logger.info(`✅ Support message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send support message to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send status message with user information
   */
  async sendStatusMessage(chatId, userName) {
    try {
      const session = await sessionManager.getOrCreate(chatId);

      if (!session) {
        await this.bot.sendMessage(
          chatId,
          `📊 *Status for ${userName}*

❌ No active session found.

To get started, use /start to authenticate and begin a new form.`,
          {
            parse_mode: 'Markdown',
          }
        );
        return;
      }

      const statusMessage = `📊 *Status for ${userName}*

*Session Information:*
🆔 Chat ID: \`${chatId}\`
📱 Status: ${session.status}
📍 Step: ${session.currentStep || 'Not started'}
📝 Answers: ${session.answers ? Object.keys(session.answers).length : 0}
🕒 Last Activity: ${
        session.metadata.lastActivity
          ? new Date(session.metadata.lastActivity).toLocaleString()
          : 'N/A'
      }

*Current Project:*
${
  session.projectId
    ? `📋 Project: ${session.projectId}`
    : '❌ No project selected'
}

*Actions:*
Use /menu to see available options or /reset to start fresh.`;

      const keyboard = {
        inline_keyboard: [
          [
            {
              text: '🏠 Main Menu',
              callback_data: 'main_menu',
            },
            {
              text: '🔄 Reset Session',
              callback_data: 'reset_session',
            },
          ],
        ],
      };

      await this.bot.sendMessage(chatId, statusMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      logger.error(`Error sending status message to ${chatId}:`, error);
      await this.sendErrorMessage(
        chatId,
        'Failed to get status. Please try again.'
      );
    }
  }

  /**
   * Send main menu with available projects
   * @param {string} chatId - Telegram chat ID
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendMainMenu(chatId, userName) {
    try {
      // Get user session to check if authenticated
      const session = await sessionManager.getOrCreate(chatId);

      if (!session || !session.userId || !session.tenantId) {
        // User not authenticated, show welcome message
        await this.sendWelcomeMessage(chatId, userName);
        return { success: true, message: 'Welcome message sent' };
      }

      // Get available projects for the user
      const projectFormService = require('../../../services/projectForm.service');
      const availableProjects =
        await projectFormService.getProjectFormsByTenant(session.tenantId, {
          status: 'active',
          'identity.status': 'published',
        });

      if (
        !availableProjects ||
        !availableProjects.results ||
        availableProjects.results.length === 0
      ) {
        const noProjectsMessage = `🏠 Main Menu - ${userName}

❌ No projects available for your account.

Please contact your administrator to get access to forms.`;

        const keyboard = {
          keyboard: [
            [{ text: '🔄 Try Again' }],
            [{ text: '📞 Contact Support' }],
          ],
          resize_keyboard: true,
        };

        const result = await this.bot.sendMessage(chatId, noProjectsMessage, {
          reply_markup: keyboard,
        });

        logger.info(`✅ Main menu sent (no projects) to chat ${chatId}`);
        return { success: true, messageId: result.message_id };
      }

      // Build project list
      const projectList = availableProjects.results
        .map((project, index) => {
          const emoji = ['📋', '📝', '📊', '📈', '📉', '📋'][index % 6];
          return `${emoji} ${
            project.configuration?.projectName || project.projectId
          }`;
        })
        .join('\n');

      const menuMessage = `🏠 Main Menu - ${userName}

Available Projects:
${projectList}

Select a project to start filling out forms, or use the options below.`;

      // Create keyboard with project buttons and other options
      const keyboardRows = [];

      // Add project buttons (max 2 per row)
      for (let i = 0; i < availableProjects.results.length; i += 2) {
        const row = [];
        row.push({
          text:
            availableProjects.results[i].configuration?.projectName ||
            availableProjects.results[i].projectId,
        });

        if (i + 1 < availableProjects.results.length) {
          row.push({
            text:
              availableProjects.results[i + 1].configuration?.projectName ||
              availableProjects.results[i + 1].projectId,
          });
        }
        keyboardRows.push(row);
      }

      // Add separator row
      keyboardRows.push([{ text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' }]);

      // Add other options
      keyboardRows.push(
        [{ text: '📊 My Status' }],
        [{ text: '❓ Help' }, { text: '📞 Contact Support' }],
        [{ text: '🔄 Reset Session' }]
      );

      const keyboard = {
        keyboard: keyboardRows,
        resize_keyboard: true,
      };

      const result = await this.bot.sendMessage(chatId, menuMessage, {
        reply_markup: keyboard,
      });

      logger.info(
        `✅ Main menu sent with ${availableProjects.results.length} projects to chat ${chatId}`
      );
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send main menu to chat ${chatId}:`,
        error.message
      );

      // Fallback to simple menu
      const fallbackMessage = `🏠 Main Menu - ${userName}

❌ Unable to load projects at the moment.

Please try again or contact support.`;

      const fallbackKeyboard = {
        keyboard: [
          [{ text: '🔄 Try Again' }],
          [{ text: '📞 Contact Support' }],
        ],
        resize_keyboard: true,
      };

      try {
        await this.bot.sendMessage(chatId, fallbackMessage, {
          reply_markup: fallbackKeyboard,
        });
        return { success: true, message: 'Fallback menu sent' };
      } catch (fallbackError) {
        logger.error(
          `❌ Failed to send fallback menu to chat ${chatId}:`,
          fallbackError.message
        );
        return { success: false, error: fallbackError.message };
      }
    }
  }

  /**
   * Send reset confirmation
   */
  async sendResetConfirmation(chatId, userName) {
    const resetMessage = `🔄 *Reset Session - ${userName}*

Are you sure you want to reset your current session?

*This will:*
• Clear all your current form progress
• Remove any unsaved answers
• Start fresh from the beginning

*Your data will be:*
✅ Safe and secure
✅ Not deleted from our servers
✅ Available for new submissions

*Note:* This action cannot be undone.`;

    const keyboard = {
      inline_keyboard: [
        [
          {
            text: '✅ Yes, Reset',
            callback_data: 'confirm_reset',
          },
          {
            text: '❌ Cancel',
            callback_data: 'cancel_reset',
          },
        ],
        [
          {
            text: '🏠 Back to Menu',
            callback_data: 'main_menu',
          },
        ],
      ],
    };

    await this.bot.sendMessage(chatId, resetMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard,
    });
  }

  /**
   * Send dual email notifications (to sender and admin)
   */
  async sendDualEmailNotifications(submissionData, user) {
    try {
      console.log(`🔍 [DEBUG] sendDualEmailNotifications called with:`, {
        submissionData: JSON.stringify(submissionData, null, 2),
        user: JSON.stringify(user, null, 2),
      });

      // Email to sender
      const senderEmail = user.email;
      const senderSubject = `Telegram submission received - ${submissionData.project_name}`;
      const senderMessage = `Hello ${user.name || 'User'},

We received your Telegram submission for ${submissionData.project_name}.

Saby will process the submitted content and notify you if any action is required.

Submission Details:
- Project: ${submissionData.project_name}
- Channel: Telegram
- Sender: ${senderEmail}
- Submission ID: ${submissionData.jobId || 'N/A'}
- Received: ${new Date().toLocaleString()}
- Status: Received

Your submission data:
${Object.entries(submissionData.structuredData || {})
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}

If you have any questions, contact hello@saby.ai.`;

      // Email to admin
      const adminEmail = 'fadebowaley@gmail.com';
      const adminSubject = `New Telegram submission - ${submissionData.project_name}`;
      const adminMessage = `A new Telegram submission has been received for ${submissionData.project_name}.

Review the submission in Saby and follow the required workflow.

Project: ${submissionData.project_name}
Channel: Telegram
User: ${user.name || 'Unknown'} (${user.email})
Phone: ${user.phoneNumber || 'N/A'}
Submission ID: ${submissionData.jobId || 'N/A'}
Received: ${new Date().toLocaleString()}

Submission Data:
${Object.entries(submissionData.structuredData || {})
  .map(([key, value]) => `- ${key}: ${value}`)
  .join('\n')}

User Details:
- Name: ${user.name || 'Unknown'}
- Email: ${user.email}
- Phone: ${user.phoneNumber || 'N/A'}
- Tenant: ${submissionData.tenantId}
- User ID: ${user._id}

This submission has been queued for processing.`;

      console.log(`🔍 [DEBUG] Sending email to sender:`, {
        to: senderEmail,
        subject: senderSubject,
        messageLength: senderMessage.length,
      });

      console.log(`🔍 [DEBUG] Sending email to admin:`, {
        to: adminEmail,
        subject: adminSubject,
        messageLength: adminMessage.length,
      });

      // Send both emails
      await Promise.all([
        this.sendEmail(senderEmail, senderSubject, senderMessage, {
          label: 'Telegram submission',
          headline: 'Your Telegram submission is in Saby.',
          detailsRows: [
            ['Project', submissionData.project_name],
            ['Channel', 'Telegram'],
            ['Sender', senderEmail],
            ['Status', 'Received'],
          ],
        }),
        this.sendEmail(adminEmail, adminSubject, adminMessage, {
          label: 'Admin notification',
          headline: 'New Telegram submission received.',
          detailsRows: [
            ['Project', submissionData.project_name],
            ['Channel', 'Telegram'],
            ['Sender', senderEmail],
            ['Tenant', submissionData.tenantId || 'N/A'],
          ],
        }),
      ]);

      console.log(`🔍 [DEBUG] Both emails sent successfully`);
      logger.info(
        `✅ Dual email notifications sent for submission ${submissionData.jobId}`
      );
    } catch (error) {
      console.log(`🔍 [DEBUG] Error in sendDualEmailNotifications:`, error);
      console.log(`🔍 [DEBUG] Error stack:`, error.stack);
      logger.error(`❌ Failed to send dual email notifications:`, error);
    }
  }

  /**
   * Helper function to send email
   */
  async sendEmail(to, subject, message, template = {}) {
    try {
      console.log(`🔍 [DEBUG] sendEmail called with:`, {
        to,
        subject,
        messageLength: message.length,
      });

      await emailService.sendSabyEmail({
        to,
        subject,
        preheader: template.preheader || String(message || '').slice(0, 140),
        layout: 'channelSubmission',
        label: template.label || 'Channel submission',
        icon: 'CH',
        headline: template.headline || subject,
        body: [message],
        detailsRows: template.detailsRows || [],
      });
      console.log(`🔍 [DEBUG] Email service call successful for: ${to}`);
      logger.info(`✅ Email sent successfully to ${to}: ${subject}`);
    } catch (error) {
      console.log(`🔍 [DEBUG] Email service error for ${to}:`, error);
      console.log(`🔍 [DEBUG] Email service error stack:`, error.stack);
      logger.error(`❌ Failed to send email to ${to}:`, error.message);
      throw error;
    }
  }

  /**
   * Send welcome message to user
   * @param {string} chatId - Telegram chat ID
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeMessage(chatId, userName) {
    try {
      const message = `👋 Welcome ${userName || 'there'}!

I'm here to help you submit data through our forms.

To get started:
1. Share your phone number to verify your identity
2. Select a project to work with
3. Fill out the form step by step
4. Submit your data

Let's begin! Please share your phone number.`;

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            [{ text: '📱 Share Phone Number', request_contact: true }],
          ],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Welcome message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send welcome message to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send authentication success message
   * @param {string} chatId - Telegram chat ID
   * @param {Object} user - User object
   * @param {Array} availableProjects - List of available projects
   * @returns {Promise<Object>} Send result
   */
  async sendAuthenticationSuccess(chatId, user, availableProjects) {
    try {
      logger.info(`🔍 Sending authentication success to chat ${chatId}`);
      logger.info(`🔍 User: ${user.firstname || user.name || 'User'}`);
      logger.info(
        `🔍 Available projects: ${
          availableProjects ? availableProjects.length : 'undefined'
        }`
      );

      const message = `✅ Authentication successful!

Hello ${user.firstname || user.name || 'User'}! You're now verified.

Available projects:`;

      // Safety check for availableProjects
      if (!availableProjects || !Array.isArray(availableProjects)) {
        logger.warn(`⚠️ availableProjects is not an array:`, availableProjects);
        availableProjects = [];
      }

      // Log project details for debugging
      availableProjects.forEach((project, index) => {
        logger.info(
          `🔍 Project ${index + 1}: ${
            project.configuration?.projectName || project.projectId
          }`
        );
      });

      const keyboard = availableProjects.map((project) => [
        {
          text: `📋 ${project.configuration?.projectName || project.projectId}`,
        },
      ]);

      logger.info(`🔍 Keyboard structure:`, JSON.stringify(keyboard, null, 2));

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard,
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Authentication success message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send authentication success to chat ${chatId}:`,
        error.message
      );
      logger.error(`❌ Full error details:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send authentication failure message
   * @param {string} chatId - Telegram chat ID
   * @param {string} reason - Failure reason
   * @returns {Promise<Object>} Send result
   */
  async sendAuthenticationFailure(chatId, reason) {
    try {
      const message = `❌ Authentication failed!

Reason: ${reason}

Please contact your administrator to get access to this system.`;

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [[{ text: '🔄 Try Again', request_contact: true }]],
          one_time_keyboard: true,
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Authentication failure message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send authentication failure to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send form question
   * @param {string} chatId - Telegram chat ID
   * @param {Object} question - Question object
   * @param {number} step - Current step number
   * @param {number} totalSteps - Total number of steps
   * @returns {Promise<Object>} Send result
   */
  async sendFormQuestion(chatId, question, step, totalSteps) {
    try {
      const message = `📝 Question ${step + 1} of ${totalSteps}

${question.label || question.properties?.label || 'Please provide your answer:'}

${question.properties?.description || ''}`;

      let replyMarkup = {};

      // Handle different question types
      if (question.type === 'select' || question.type === 'radio') {
        const options = question.properties?.options || [];
        const keyboard = options.map((option) => [{ text: option }]);
        replyMarkup = {
          keyboard,
          resize_keyboard: true,
          one_time_keyboard: true,
        };
      } else if (question.type === 'checkbox') {
        const options = question.properties?.options || [];
        const keyboard = options.map((option) => [{ text: `☐ ${option}` }]);
        keyboard.push([{ text: '✅ Done' }]);
        replyMarkup = {
          keyboard,
          resize_keyboard: true,
        };
      } else if (question.type === 'date') {
        replyMarkup = {
          keyboard: [[{ text: '📅 Select Date' }]],
          resize_keyboard: true,
        };
      } else if (question.type === 'file') {
        replyMarkup = {
          keyboard: [[{ text: '📎 Upload File' }]],
          resize_keyboard: true,
        };
      } else {
        // Text input - show cancel option
        replyMarkup = {
          keyboard: [[{ text: '❌ Cancel' }]],
          resize_keyboard: true,
        };
      }

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: replyMarkup,
      });

      logger.info(
        `✅ Form question sent to chat ${chatId} (step ${
          step + 1
        }/${totalSteps})`
      );
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send form question to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send validation error message
   * @param {string} chatId - Telegram chat ID
   * @param {Object} validationError - Validation error object
   * @returns {Promise<Object>} Send result
   */
  async sendValidationError(chatId, validationError) {
    try {
      const message = `⚠️ Validation Error

${validationError.field || 'Field'}: ${validationError.error}

Please provide a valid answer and try again.`;

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [[{ text: '🔄 Try Again' }]],
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Validation error sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send validation error to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send form completion message
   * @param {string} chatId - Telegram chat ID
   * @param {Object} projectForm - Project form object
   * @returns {Promise<Object>} Send result
   */
  async sendFormCompletion(chatId, projectForm) {
    try {
      const projectName = projectForm.configuration?.projectName || 'the form';
      const message = `✅ Form Completed!

You have successfully filled out ${projectName}.

Please review your answers and submit when ready.`;

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            [{ text: '📋 Review Answers' }],
            [{ text: '✅ Submit Form' }],
            [{ text: '🔄 Start Over' }],
          ],
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Form completion message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send form completion to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send submission success message
   * @param {string} chatId - Telegram chat ID
   * @param {string} jobId - Submission job ID
   * @param {Object} projectForm - Project form object (optional)
   * @returns {Promise<Object>} Send result
   */
  async sendSubmissionSuccess(chatId, jobId, projectForm = null) {
    try {
      const projectName =
        projectForm?.configuration?.projectName || 'Unknown Project';

      const message = `✅ Submission Successful!

Your data has been successfully submitted to ${projectName}.

Submission ID: ${jobId || 'N/A'}
Submitted: ${new Date().toLocaleString()}

You will receive a confirmation email shortly.

Thank you for using our service!`;

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            [{ text: '📋 Submit Another' }],
            [{ text: '🏠 Main Menu' }],
          ],
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Submission success message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send submission success to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send submission failure message
   * @param {string} chatId - Telegram chat ID
   * @param {string} error - Error message
   * @returns {Promise<Object>} Send result
   */
  async sendSubmissionFailure(chatId, error) {
    try {
      const message = `❌ Submission Failed!

We encountered an error while processing your submission:

${error}

Please try again or contact support if the problem persists.`;

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            [{ text: '🔄 Try Again' }],
            [{ text: '📞 Contact Support' }],
          ],
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Submission failure message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send submission failure to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Send error message
   * @param {string} chatId - Telegram chat ID
   * @param {string} error - Error message
   * @returns {Promise<Object>} Send result
   */
  async sendErrorMessage(chatId, error) {
    try {
      const message = `❌ Error

Something went wrong: ${error}

Please try again or contact support.`;

      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          keyboard: [
            [{ text: '🔄 Try Again' }],
            [{ text: '📞 Contact Support' }],
          ],
          resize_keyboard: true,
        },
      });

      logger.info(`✅ Error message sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send error message to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Clear keyboard and send message
   * @param {string} chatId - Telegram chat ID
   * @param {string} message - Message text
   * @returns {Promise<Object>} Send result
   */
  async sendMessageWithClearKeyboard(chatId, message) {
    try {
      const result = await this.bot.sendMessage(chatId, message, {
        reply_markup: {
          remove_keyboard: true,
        },
      });

      logger.info(`✅ Message with clear keyboard sent to chat ${chatId}`);
      return { success: true, messageId: result.message_id };
    } catch (error) {
      logger.error(
        `❌ Failed to send message with clear keyboard to chat ${chatId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }
  }
}

module.exports = new TelegramNotificationService();
