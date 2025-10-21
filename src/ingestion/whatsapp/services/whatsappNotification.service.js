const axios = require('axios');
const config = require('../../../config/config');
const logger = require('../../../config/logger');
const emailService = require('../../../services/email.service');

// WhatsApp Business API configuration
const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';
const PHONE_NUMBER_ID = config.whatsapp.phoneNumberId;
const ACCESS_TOKEN = config.whatsapp.accessToken;

/**
 * WhatsApp Notification Service
 * Handles sending notifications and responses to users via WhatsApp Business API
 */

class WhatsAppNotificationService {
  constructor() {
    this.apiUrl = WHATSAPP_API_URL;
    this.phoneNumberId = PHONE_NUMBER_ID;
    this.accessToken = ACCESS_TOKEN;
  }

  /**
   * Send a simple text message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message text
   * @returns {Promise<Object>} API response
   */
  async sendTextMessage(phoneNumber, message) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'text',
          text: {
            body: message,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`✅ Text message sent to ${phoneNumber}`);
      return response.data;
    } catch (error) {
      logger.error(
        `❌ Error sending text message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send a message with buttons
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message text
   * @param {Array} buttons - Array of button objects
   * @returns {Promise<Object>} API response
   */
  async sendButtonMessage(phoneNumber, message, buttons) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: message,
            },
            action: {
              buttons: buttons.map((button, index) => ({
                type: 'reply',
                reply: {
                  id: `button_${index}`,
                  title: button.text,
                },
              })),
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`✅ Button message sent to ${phoneNumber}`);
      return response.data;
    } catch (error) {
      logger.error(
        `❌ Error sending button message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send a message with a list
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message text
   * @param {string} buttonText - Button text
   * @param {Array} items - Array of list items
   * @returns {Promise<Object>} API response
   */
  async sendListMessage(phoneNumber, message, buttonText, items) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/${this.phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: {
              text: message,
            },
            action: {
              button: buttonText,
              sections: [
                {
                  title: 'Available Options',
                  rows: items.map((item, index) => ({
                    id: item.id || `item_${index}`,
                    title: item.title,
                    description: item.description || '',
                  })),
                },
              ],
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`✅ List message sent to ${phoneNumber}`);
      return response.data;
    } catch (error) {
      logger.error(
        `❌ Error sending list message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send enhanced welcome message with better UI
   */
  async sendEnhancedWelcomeMessage(phoneNumber) {
    const welcomeMessage = `🎉 *Welcome to Halo Forms!*

I'm your personal form assistant that helps you complete forms quickly and easily.

*What I can do:*
• 📋 Complete forms with a modern interface
• 📱 Use our beautiful Web App for better experience
• 📊 Track your submission status
• 🔔 Get instant notifications

*Quick Commands:*
start - Start a new form
help - Show help and commands
support - Get support
status - Check your status
menu - Show main menu
reset - Reset your session

*Ready to get started?* Share your phone number to authenticate and access your forms.`;

    const buttons = [
      { text: '📱 Share Phone Number' },
      { text: '🌐 Use Web App' },
      { text: '❓ Help' },
      { text: '🆘 Support' },
    ];

    await this.sendButtonMessage(phoneNumber, welcomeMessage, buttons);
  }

  /**
   * Send comprehensive help message
   */
  async sendHelpMessage(phoneNumber) {
    const helpMessage = `❓ Halo Forms Help

Menu Options:
1. Start Forms
2. Help
3. Status
4. Support

How to use:
1. Send 1 to start forms
2. Choose project number
3. Fill out form
4. Submit data

Need help? Send 4 for support`;

    // Use simple text message instead of buttons
    await this.sendTextMessage(phoneNumber, helpMessage);
  }

  /**
   * Send support message with contact information
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendSupportMessage(phoneNumber) {
    try {
      const supportMessage = `🆘 Support Center

Need help with Halo Forms?

Contact Options:
📧 Email: support@haloforms.com
📱 WhatsApp: +234 814 504 5108
🌐 Website: https://haloforms.com/support

Business Hours:
🕘 9 AM - 6 PM WAT (Monday - Friday)

Please mention your phone number: ${phoneNumber} for faster assistance.

Commands you can use:
• /start - Start over
• /help - Get help
• /status - Check status
• /reset - Reset session`;

      // Use simple text message instead of buttons
      await this.sendTextMessage(phoneNumber, supportMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending support message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send status message
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendStatusMessage(phoneNumber) {
    try {
      const statusMessage = `📊 Your Status

Current Session:
• Status: Active
• Phone: ${phoneNumber}
• Last Activity: ${new Date().toLocaleString()}

Recent Activity:
• Forms completed: 0
• Pending submissions: 0
• Total submissions: 0

Need to check something specific? Contact support for detailed information.

Commands you can use:
• /start - Start over
• /help - Get help
• /support - Contact support
• /reset - Reset session`;

      // Use simple text message instead of buttons
      await this.sendTextMessage(phoneNumber, statusMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending status message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send main menu
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendMainMenu(phoneNumber) {
    try {
      const menuMessage = `🏠 *Main Menu*

What would you like to do?

*Form Management:*
• Start a new form submission
• Check your current status
• View recent submissions

*Support & Help:*
• Get help and instructions
• Contact support team
• Reset your session`;

      const buttons = [
        { text: '📋 Start New Form' },
        { text: '📊 My Status' },
        { text: '❓ Help' },
        { text: '🆘 Support' },
        { text: '🔄 Reset Session' },
      ];

      await this.sendButtonMessage(phoneNumber, menuMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending main menu to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send reset confirmation
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendResetConfirmation(phoneNumber) {
    try {
      const resetMessage = `🔄 Reset Session

Your session has been reset successfully!

This has:
• Cleared all current form progress
• Removed project selection
• Started fresh authentication

You can now start over with /start command.

Available Commands:
• /start - Start the bot
• /help - Get help
• /status - Check status
• /support - Contact support`;

      // Use simple text message instead of buttons
      await this.sendTextMessage(phoneNumber, resetMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending reset confirmation to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send welcome message
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeMessage(phoneNumber) {
    try {
      const welcomeMessage = `🎉 Welcome to Halo Forms!

I'll help you fill out forms quickly.

Your phone number: ${phoneNumber}

Menu Options:
1. Start Forms
2. Help
3. Status
4. Support

Send 1, 2, 3, or 4 to continue!`;

      // Use simple text message instead of buttons
      await this.sendTextMessage(phoneNumber, welcomeMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending welcome message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send authentication success message with project list
   * @param {string} phoneNumber - Recipient phone number
   * @param {Object} user - User object
   * @param {Array} availableProjects - Available projects
   * @returns {Promise<Object>} Send result
   */
  async sendAuthenticationSuccess(phoneNumber, user, availableProjects) {
    try {
      const userName = user.firstname || user.name || 'User';

      const projectOptions = availableProjects
        .map(
          (project, index) =>
            `${index + 1}. ${
              project.configuration?.projectName || project.projectId
            }`
        )
        .join('\n');

      const message = `🎉 Welcome back, ${userName}!

✅ Authentication successful
📱 Phone: ${user.phoneNumber}
🏢 Tenant: ${user.tenantId}

📋 Available Projects (${availableProjects.length}):

${projectOptions}

Send the number of your choice (1, 2, 3, etc.)`;

      // Use simple text message instead of list
      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending authentication success to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send authentication failure message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} reason - Failure reason
   * @returns {Promise<Object>} Send result
   */
  async sendAuthenticationFailure(phoneNumber, reason) {
    try {
      const failureMessage = `❌ Authentication Failed

${reason}

What you can do:
• Check if your phone number is correct
• Contact your administrator for access
• Try again with a different number
• Contact support for assistance

Commands you can use:
• /start - Try again
• /help - Get help
• /support - Contact support
• /reset - Reset session

Need help? Contact our support team.`;

      // Use simple text message instead of buttons
      await this.sendTextMessage(phoneNumber, failureMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending authentication failure to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send form question
   * @param {string} phoneNumber - Recipient phone number
   * @param {Object} question - Question object
   * @param {number} step - Current step
   * @param {number} totalSteps - Total steps
   * @returns {Promise<Object>} Send result
   */
  async sendFormQuestion(phoneNumber, question, step, totalSteps) {
    try {
      const questionLabel =
        question.properties?.label || question.label || `Question ${step + 1}`;
      const isRequired = question.properties?.required ? ' *' : '';
      const questionType = question.type;
      const description = question.properties?.description || '';

      let message = `📝 *Question ${step + 1} of ${totalSteps}*\n\n`;
      message += `*${questionLabel}${isRequired}*\n\n`;

      // Add description if available
      if (description) {
        message += `${description}\n\n`;
      }

      // Add question type specific instructions
      switch (questionType) {
        case 'email':
          message += `Please provide a valid email address.`;
          break;
        case 'phone':
          message += `Please provide a valid phone number.`;
          break;
        case 'number':
          message += `Please provide a number.`;
          break;
        case 'date':
          message += `Please provide a date (YYYY-MM-DD format).`;
          break;
        case 'select':
        case 'radio':
          const options = question.properties?.options || [];
          if (options.length > 0) {
            message += `Please select one option:\n${options
              .map((opt, i) => `${i + 1}. ${opt}`)
              .join('\n')}`;
          } else {
            message += `Please provide your selection.`;
          }
          break;
        case 'checkbox':
          const checkboxOptions = question.properties?.options || [];
          if (checkboxOptions.length > 0) {
            message += `Please select one or more options:\n${checkboxOptions
              .map((opt, i) => `${i + 1}. ${opt}`)
              .join('\n')}`;
          } else {
            message += `Please provide your selections.`;
          }
          break;
        case 'file':
          message += `Please send a file (image or document).`;
          break;
        case 'textarea':
          message += `Please provide a detailed answer.`;
          break;
        default:
          message += `Please provide your answer.`;
      }

      if (isRequired) {
        message += `\n\n*This field is required.*`;
      }

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending form question to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send validation error message
   * @param {string} phoneNumber - Recipient phone number
   * @param {Object} validationError - Validation error object
   * @returns {Promise<Object>} Send result
   */
  async sendValidationError(phoneNumber, validationError) {
    try {
      const errorMessage = `❌ *Validation Error*

*Field:* ${validationError.field}
*Error:* ${validationError.error}

Please correct the error and try again.`;

      const buttons = [{ text: '🔄 Try Again' }, { text: '❓ Help' }];

      await this.sendButtonMessage(phoneNumber, errorMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending validation error to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send form completion message
   * @param {string} phoneNumber - Recipient phone number
   * @param {Object} projectForm - Project form object
   * @returns {Promise<Object>} Send result
   */
  async sendFormCompletion(phoneNumber, projectForm) {
    try {
      const completionMessage = `🎉 *Form Completed!*

*Project:* ${projectForm.configuration?.projectName || projectForm.projectId}
*Questions:* ${projectForm.elements?.length || 0}

Your form is ready for submission. What would you like to do?`;

      const buttons = [
        { text: '✅ Submit Form' },
        { text: '📋 Review Answers' },
        { text: '🔄 Start Over' },
        { text: '❌ Cancel' },
      ];

      await this.sendButtonMessage(phoneNumber, completionMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending form completion to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send submission success message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} jobId - Submission job ID
   * @param {Object} projectForm - Project form object
   * @returns {Promise<Object>} Send result
   */
  async sendSubmissionSuccess(phoneNumber, jobId, projectForm = null) {
    try {
      const successMessage = `✅ *Form Submitted Successfully!*

*Project:* ${projectForm?.configuration?.projectName || 'Your Project'}
*Submission ID:* ${jobId}
*Status:* Submitted for processing

*What happens next:*
• Your data is being processed
• You'll receive an email confirmation
• Processing usually takes 5-10 minutes

Thank you for using Halo Forms!`;

      const buttons = [
        { text: '📋 Submit Another' },
        { text: '🏠 Main Menu' },
        { text: '📊 Check Status' },
      ];

      await this.sendButtonMessage(phoneNumber, successMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending submission success to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send submission failure message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} error - Error message
   * @returns {Promise<Object>} Send result
   */
  async sendSubmissionFailure(phoneNumber, error) {
    try {
      const failureMessage = `❌ *Submission Failed*

*Error:* ${error}

*What you can do:*
• Try submitting again
• Contact support for assistance
• Check your internet connection

We apologize for the inconvenience.`;

      const buttons = [
        { text: '🔄 Try Again' },
        { text: '📞 Contact Support' },
        { text: '🏠 Main Menu' },
      ];

      await this.sendButtonMessage(phoneNumber, failureMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending submission failure to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send error message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} error - Error message
   * @returns {Promise<Object>} Send result
   */
  async sendErrorMessage(phoneNumber, error) {
    try {
      const errorMessage = `❌ Error

${error}

Please try again or contact support if the problem persists.

Commands you can use:
/start - Start over
/help - Get help
/support - Contact support
/reset - Reset session`;

      // Use simple text message instead of buttons
      await this.sendTextMessage(phoneNumber, errorMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending error message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send message with clear keyboard (no buttons)
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} message - Message text
   * @returns {Promise<Object>} Send result
   */
  async sendMessageWithClearKeyboard(phoneNumber, message) {
    try {
      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending message with clear keyboard to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send project selection message
   * @param {string} phoneNumber - Recipient phone number
   * @param {Array} projects - Available projects
   * @returns {Promise<Object>} Send result
   */
  async sendProjectSelection(phoneNumber, projects) {
    try {
      const projectList = projects.map((project, index) => ({
        id: `project_${project.projectId}`,
        title: project.configuration?.projectName || project.projectId,
        description: `Project ${index + 1}`,
      }));

      const message = `📋 *Select a Project*

Choose a project to start filling out forms:

*Available Projects (${projects.length}):*`;

      await this.sendListMessage(
        phoneNumber,
        message,
        '📋 Select Project',
        projectList
      );
    } catch (error) {
      logger.error(
        `❌ Error sending project selection to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send authentication prompt
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendAuthenticationPrompt(phoneNumber) {
    try {
      const promptMessage = `🔐 *Authentication Required*

To access forms, you need to authenticate first.

Please share your phone number to continue.`;

      const buttons = [
        { text: '📱 Share Phone Number' },
        { text: '❓ Help' },
        { text: '🆘 Support' },
      ];

      await this.sendButtonMessage(phoneNumber, promptMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending authentication prompt to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send enhanced welcome message
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendEnhancedWelcomeMessage(phoneNumber) {
    try {
      const welcomeMessage = `🎉 *Welcome to Halo Forms Bot!*

I'm here to help you fill out forms and submit data easily.

*What can I do for you?*
• Fill out forms and surveys
• Submit data securely
• Track your submissions
• Get help and support

*Quick Start:*
1. I'll authenticate you automatically using your WhatsApp number
2. Choose from available forms
3. Fill out the form step by step
4. Submit your data

*Available Commands:*
/start - Start over
/help - Get help
/support - Contact support
/status - Check your status
/menu - Show main menu
/forms - List available forms

Let's get started! I'm processing your authentication...`;

      await this.sendTextMessage(phoneNumber, welcomeMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending enhanced welcome message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send help message
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendHelpMessage(phoneNumber) {
    try {
      const helpMessage = `❓ *Help & Support*

*How to use the bot:*

1. **Start**: Type /start to begin
2. **Authentication**: I'll authenticate you automatically
3. **Select Form**: Choose from available forms
4. **Fill Form**: Answer questions step by step
5. **Submit**: Review and submit your data

*Available Commands:*
/start - Start the bot
/help - Show this help message
/support - Contact support team
/status - Check your submission status
/menu - Show main menu
/reset - Reset your session
/cancel - Cancel current operation
/forms - List available forms
/projects - List available projects

*Need more help?*
Type /support to contact our support team.

*Tips:*
• You can type /cancel anytime to stop
• Use /reset to start fresh
• Check /status to see your progress`;

      await this.sendTextMessage(phoneNumber, helpMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending help message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send support message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendSupportMessage(phoneNumber, userName) {
    try {
      const supportMessage = `🆘 *Support & Contact*

Hello ${userName}! Here's how to get help:

*📧 Email Support:*
support@haloforms.com
Include your phone number: ${phoneNumber}

*📱 WhatsApp Support:*
+234 814 504 5108
Mention your phone number for faster assistance

*⏰ Business Hours:*
Monday - Friday: 9 AM - 6 PM WAT

*🔧 Technical Issues:*
If you're experiencing technical problems:
1. Try /reset to restart
2. Check your internet connection
3. Contact support with details

*📋 Before Contacting Support:*
• Your phone number: ${phoneNumber}
• Current session status
• Error message (if any)
• What you were trying to do

We'll get back to you within 2-4 hours during business hours.`;

      await this.sendTextMessage(phoneNumber, supportMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending support message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send status message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendStatusMessage(phoneNumber, userName) {
    try {
      const statusMessage = `📊 *Your Status*

Hello ${userName}!

*Account Status:*
✅ Authenticated
📱 Phone: ${phoneNumber}

*Session Status:*
🟢 Active

*Available Actions:*
• Fill out forms
• Check submissions
• Get help

*Quick Actions:*
/forms - List available forms
/menu - Show main menu
/help - Get help
/support - Contact support

Need to start a new form? Type /start to begin!`;

      await this.sendTextMessage(phoneNumber, statusMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending status message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send main menu
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendMainMenu(phoneNumber, userName) {
    try {
      const menuMessage = `🏠 *Main Menu*

Hello ${userName}! What would you like to do?

*Available Options:*`;

      const buttons = [
        { text: '📝 Fill Forms' },
        { text: '📊 My Status' },
        { text: '❓ Help' },
        { text: '🆘 Support' },
      ];

      await this.sendButtonMessage(phoneNumber, menuMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending main menu to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send reset confirmation
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendResetConfirmation(phoneNumber, userName) {
    try {
      const resetMessage = `🔄 *Reset Session*

Hello ${userName}!

Are you sure you want to reset your current session?

*This will:*
• Clear all current form data
• Reset your progress
• Start fresh

*Note:* Any unsaved data will be lost.`;

      const buttons = [{ text: '✅ Yes, Reset' }, { text: '❌ Cancel' }];

      await this.sendButtonMessage(phoneNumber, resetMessage, buttons);
    } catch (error) {
      logger.error(
        `❌ Error sending reset confirmation to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send project list
   * @param {string} phoneNumber - Recipient phone number
   * @param {Array} projects - Available projects
   * @returns {Promise<Object>} Send result
   */
  async sendProjectList(phoneNumber, projects) {
    try {
      const projectOptions = projects
        .map(
          (project, index) =>
            `${index + 1}. ${
              project.configuration?.projectName || project.projectId
            }`
        )
        .join('\n');

      const message = `📋 *Available Projects*

Here are the projects you can access:

${projectOptions}

Send the number of your choice (1, 2, 3, etc.)`;

      // Use simple text message instead of interactive list
      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending project list to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send form selection menu
   * @param {string} phoneNumber - Recipient phone number
   * @param {Array} projects - Available projects (forms)
   * @returns {Promise<Object>} Send result
   */
  async sendFormSelectionMenu(phoneNumber, projects) {
    try {
      const formOptions = projects
        .map(
          (project, index) =>
            `${index + 1}. ${
              project.configuration?.projectName || project.projectId
            }`
        )
        .join('\n');

      const message = `📝 *Available Forms*

Choose a form to fill out:

${formOptions}

Send the number of your choice (1, 2, 3, etc.)`;

      // Use simple text message instead of interactive list
      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending form selection menu to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }
}

module.exports = new WhatsAppNotificationService();
