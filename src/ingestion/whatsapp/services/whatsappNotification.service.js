const axios = require('axios');
const config = require('../../../config/config');
const logger = require('../../../config/logger');

function buildFieldHint(field = {}) {
  if (Array.isArray(field.options) && field.options.length > 0) {
    return `Options: ${field.options.join(', ')}`;
  }

  switch (field.type) {
    case 'boolean':
      return 'Options: yes / no';
    case 'date':
      return 'Format: YYYY-MM-DD';
    case 'number': {
      const parts = [];
      if (field.min !== undefined) {
        parts.push(`min ${field.min}`);
      }
      if (field.max !== undefined) {
        parts.push(`max ${field.max}`);
      }
      return parts.length ? parts.join(', ') : 'Enter a number';
    }
    case 'phone':
      return 'Include country code (e.g., +234...)';
    case 'email':
      return 'Use a valid email address';
    default:
      return field.maxLength ? `Max ${field.maxLength} chars` : '';
  }
}

function extractOptionLabels(properties = {}) {
  const rawOptions = properties.options || properties.choices || [];
  if (!Array.isArray(rawOptions)) {
    return [];
  }
  return rawOptions
    .map((option) => {
      if (typeof option === 'string') {
        return option;
      }
      if (option && typeof option === 'object') {
        return option.label || option.value || null;
      }
      return null;
    })
    .filter((value) => typeof value === 'string' && value.trim().length > 0);
}

function maskEmailAddress(email = '') {
  if (typeof email !== 'string' || !email.includes('@')) {
    return email;
  }
  const [local, domain] = email.split('@');
  if (!local) {
    return `***@${domain}`;
  }
  if (local.length <= 2) {
    return `${local.charAt(0)}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

const TEMPLATE_TOKEN_REGEX = /\{([A-Z0-9_]+)\}/gi;

function formatMessageTemplate(template, context = {}) {
  if (!template || typeof template !== 'string') {
    return '';
  }

  const tokenMap = Object.entries(context).reduce((acc, [key, value]) => {
    acc[key.toUpperCase()] =
      value === undefined || value === null ? '' : String(value);
    return acc;
  }, {});

  return template.replace(TEMPLATE_TOKEN_REGEX, (match, token) => {
    const replacement = tokenMap[token.toUpperCase()];
    return replacement !== undefined ? replacement : match;
  });
}

function buildProjectContext(projectForm, extra = {}) {
  const projectName =
    projectForm?.configuration?.projectName ||
    projectForm?.projectId ||
    'Project';
  const projectId =
    projectForm && projectForm.projectId ? projectForm.projectId : '';
  const formReference =
    projectForm && projectForm.formReference ? projectForm.formReference : '';
  const tenantId =
    projectForm && projectForm.tenantId ? projectForm.tenantId : '';
  const context = {
    PROJECT_NAME: projectName,
    PROJECT_ID: projectId,
    FORM_REFERENCE: formReference,
    TENANT_ID: tenantId,
  };

  Object.entries(extra).forEach(([key, value]) => {
    context[key.toUpperCase()] =
      value === undefined || value === null ? '' : String(value);
  });

  return context;
}

function getWhatsappConfigFromForm(projectForm) {
  if (!projectForm) {
    return {};
  }
  const metadata =
    typeof projectForm.get === 'function'
      ? projectForm.get('metadata')
      : projectForm.metadata;

  if (!metadata) {
    return {};
  }

  const integrations =
    typeof metadata.get === 'function'
      ? metadata.get('integrations')
      : metadata.integrations;

  if (Array.isArray(integrations)) {
    return {};
  }

  if (integrations && typeof integrations === 'object') {
    return integrations.whatsapp || {};
  }

  return {};
}

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
      const errorMessage = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || 'Unknown error';
      logger.error(
        `❌ Error sending text message to ${phoneNumber}: ${errorMessage}`
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
      const errorMessage = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || 'Unknown error';
      logger.error(
        `❌ Error sending button message to ${phoneNumber}: ${errorMessage}`
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
   * Prompt the user to authenticate with password or OTP.
   * @param {string} phoneNumber
   * @param {string} email
   */
  async sendPasscodePrompt(phoneNumber, phoneNumberDigits = '') {
    const sanitized =
      typeof phoneNumberDigits === 'string'
        ? phoneNumberDigits.replace(/\D/g, '')
        : '';
    const maskedReference =
      sanitized.length >= 2
        ? sanitized.slice(-2).padStart(sanitized.length, '•')
        : 'your registered number';
    const message = `🔑 *Verify it’s you*

Reply with the *last 6 digits* of your registered phone number.

Registered number (masked): ${maskedReference}

Example: 123456`;
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Provide OTP verification instructions.
   * @param {string} phoneNumber
   * @param {string} destination
   */
  async sendOtpVerificationPrompt(phoneNumber, destination = '') {
    const message = `📩 *Email verification required*

We sent a one-time code to ${destination || 'your registered email'}.

Reply with:
• \`code 123456\` – the OTP from your email/SMS
• or the *last 6 digits* of your registered phone number if the OTP doesn’t arrive.

Need a new code? Type “otp” to resend.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Prompt the user to authenticate with password.
   * @param {string} phoneNumber
   * @param {string} email
   */
  async sendLoginPrompt(phoneNumber, email) {
    const message = `🔐 *Login Required*

Account email: ${email || 'not on file'}

Reply with: \`password your_password\`

You can also type /logout at any time to end this session.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Notify user that login was successful.
   * @param {string} phoneNumber
   * @param {string} method - 'passcode' or 'otp'
   */
  async sendLoginSuccess(phoneNumber, method = 'passcode') {
    let message;
    switch (method) {
      case 'otp':
        message = '🔑 OTP verified successfully. You’re good to continue.';
        break;
      default:
        message = '🔓 Passcode accepted. You’re good to continue.';
    }

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Notify user of a failed login attempt.
   * @param {string} phoneNumber
   * @param {number} attemptsLeft
   */
  async sendPasscodeFailure(phoneNumber, attemptsLeft) {
    const message =
      attemptsLeft > 0
        ? `❌ That passcode didn’t work. You have ${attemptsLeft} attempt${
            attemptsLeft === 1 ? '' : 's'
          } left before we recommend using an OTP.`
        : `❌ That passcode didn’t work. Type “otp” to receive a verification code or contact support if you’re stuck.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Confirm that an OTP has been sent.
   * @param {string} phoneNumber
   * @param {string} destination
   */
  async sendOtpSentConfirmation(phoneNumber, destination) {
    const message = `📩 OTP sent to ${destination}.
Enter it as “code 123456”. If you don’t receive it promptly, you can type “otp” to resend or reply with the last 6 digits of your registered phone number.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Warn that the supplied OTP was invalid.
   * @param {string} phoneNumber
   */
  async sendOtpInvalid(phoneNumber) {
    const message =
      '❌ That code is invalid or expired. Type “otp” to request a new one or reply with the last 6 digits of your phone number.';
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendPasswordResetIntro(
    phoneNumber,
    destination = 'your registered email or phone'
  ) {
    const message = `🔒 *Password reset*

We sent a verification code to ${destination}.

Reply with \`code 123456\` to continue, type “otp” to resend the code, or “cancel” to abort.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendPasswordResetDeliveryFailure(phoneNumber) {
    const message = `⚠️ *Password reset temporarily unavailable*

We couldn't send a reset code right now. Please try again later.

You'll be returned to the main menu so you can continue with other tasks.

If this keeps happening, please contact support.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendPasswordResetEmailUnavailable(phoneNumber, email) {
    const masked = maskEmailAddress(email);
    const message = `📧 *Email delivery unavailable*

We couldn't email the reset code to ${masked}.

A code was sent via SMS instead. Reply with \`code 123456\` using the SMS code, or type “otp” to resend.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendPasswordResetCodeVerified(phoneNumber) {
    const message = `✅ *Code verified*

Now reply with \`password_new YourNewPassword1\`.

Use at least 8 characters with letters and numbers.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendPasswordResetSuccess(phoneNumber) {
    const message = `🎉 *Password updated*

Your account password has been changed. For security, please confirm your passcode to continue.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendPasswordResetCancelled(phoneNumber) {
    const message = `ℹ️ Password reset cancelled. No changes were made.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendPasswordResetInvalidPassword(phoneNumber) {
    const message = `⚠️ Password must be at least 8 characters long and include letters and numbers.

Try again with \`password_new YourNewPassword1\`.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendLogoutSuccess(phoneNumber) {
    const message = `✅ *Signed out successfully*

Your WhatsApp session is closed.

Send /start whenever you want to sign back in.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendSessionExpired(phoneNumber) {
    const message = `⏱️ *Session expired*

For your security, please log in again.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Notify the user that the session is locked and requires passcode.
   * @param {string} phoneNumber
   * @param {string} email
   */
  async sendSessionLockNotice(phoneNumber, email) {
    const message = `🔐 Session locked for your security.

Reply with your passcode (password ...) or type “otp” to continue.
Account email: ${email || 'not on file'}`;
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Send welcome message
   * @param {string} phoneNumber - Recipient phone number
   * @returns {Promise<Object>} Send result
   */
  async sendWelcomeMessage(phoneNumber) {
    try {
      const welcomeMessage = `👋 Welcome to Saby!

I can help you submit data right here.

Reply with:
1. Fill a form
2. Help
3. Status
4. Support`;

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
  async sendAuthenticationSuccess(
    phoneNumber,
    user = {},
    availableProjects = []
  ) {
    try {
      const userName =
        user.displayName || user.firstname || user.name || 'User';
      const tenantId = user.tenantId || 'Unknown Tenant';
      const sabyId = user.sabyId || user.haloId || 'Not set';
      const phone = user.phoneNumber || 'Unknown';

      const projectOptions = availableProjects
        .map(
          (project, index) =>
            `${index + 1}. ${
              project.configuration?.projectName || project.projectId
            }`
        )
        .join('\n');

      const message = `🎉 Welcome back, ${userName}!

✅ Authentication confirmed
🆔 Saby ID: ${sabyId}
📱 Phone: ${phone}
🏢 Tenant: ${tenantId}

📋 Available Projects (${availableProjects.length}):

${projectOptions}

Reply with the number of your choice (1, 2, 3, etc.)`;

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
  async sendAuthenticationFailure(phoneNumber, reason = '') {
    try {
      const reasonText = reason ? `Here’s what we know: ${reason}\n\n` : '';
      const failureMessage = `🙋‍♂️ We couldn’t find your account yet.

${reasonText}Let’s get you to the right place:
• /menu – back to the main menu
• /help – tips and FAQs
• /support – talk to our team

If you believe you already have access, please reach out to an admin to confirm your details.`;

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
   * Prompt the user to verify their account details.
   */
  async sendVerificationPrompt(phoneNumber, profile = {}) {
    try {
      const message = `🔐 *Please confirm your account details*

👤 Name: ${profile.displayName || 'Unknown'}
🆔 Saby ID: ${profile.sabyId || 'Not set'}
📧 Email: ${profile.email || 'Not provided'}
📱 Phone: ${profile.phoneNumber || 'Not provided'}
🏢 Tenant: ${profile.tenantId || 'Not set'}

Reply with:
• *Yes* to confirm
• *No* if something is incorrect
• */profile* to review again
• */verify* to refresh these details`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending verification prompt to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Notify the user that verification succeeded.
   */
  async sendVerificationSuccess(phoneNumber, profile = {}) {
    try {
      const message = `✅ *Details confirmed!*

Great, ${profile.displayName || 'there'} — your account details are verified.
Let’s continue to form selection.`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending verification success to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Inform the user that details are incorrect and provide guidance.
   */
  async sendVerificationMismatch(phoneNumber) {
    try {
      const message = `⚠️ The details on file do not match what you expected.

You can:
• Use */update profile* to request a change (coming soon)
• Contact your administrator to correct your information
• Reply */verify* after updates are made`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending verification mismatch message to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Show a profile summary to the user.
   */
  async sendProfileSummary(phoneNumber, profile = {}) {
    try {
      const message = `🪪 *Your Profile Summary*

👤 Name: ${profile.displayName || 'Unknown'}
🆔 Saby ID: ${profile.sabyId || 'Not set'}
📧 Email: ${profile.email || 'Not provided'}
📱 Phone: ${profile.phoneNumber || 'Not provided'}
🏢 Tenant: ${profile.tenantId || 'Not set'}
🎭 Roles: ${
        profile.roles && profile.roles.length > 0
          ? profile.roles.filter(Boolean).join(', ')
          : 'None assigned'
      }

Use */verify* to refresh these details.`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending profile summary to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Generic informational helper.
   */
  async sendInfoMessage(phoneNumber, message) {
    try {
      return await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending info message to ${phoneNumber}:`,
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
      const placeholder = question.properties?.placeholder || '';

      let labelHint = '';
      switch (questionType) {
        case 'number':
          labelHint = ' (numeric value)';
          break;
        case 'date':
          labelHint = ' (YYYY-MM-DD)';
          break;
        default:
          labelHint = '';
      }

      let message = `📝 *Question ${step + 1} of ${totalSteps}*\n\n`;
      message += `*${questionLabel}${labelHint}${isRequired}*\n\n`;

      // Add description if available
      if (description) {
        message += `${description}\n\n`;
      }

      if (placeholder) {
        message += `_Hint:_ ${placeholder}\n\n`;
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
        case 'radio': {
          const options = question.properties?.options || [];
          if (options.length > 0) {
            message += `Please select one option:\n${options
              .map((opt, i) => `${i + 1}. ${opt}`)
              .join('\n')}`;
          } else {
            message += `Please provide your selection.`;
          }
          break;
        }
        case 'checkbox': {
          const checkboxOptions = question.properties?.options || [];
          if (checkboxOptions.length > 0) {
            message += `Please select one or more options:\n${checkboxOptions
              .map((opt, i) => `${i + 1}. ${opt}`)
              .join('\n')}`;
          } else {
            message += `Please provide your selections.`;
          }
          break;
        }
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
   * Send a rich summary of the collected answers with batching instructions
   * @param {string} phoneNumber
   * @param {Object} projectForm
   * @param {Array<{ index: number, label: string, value: string }>} summaryItems
   */
  async sendBatchSummary(phoneNumber, projectForm, summaryItems = []) {
    try {
      const header = `📝 *Review Your Submission*

*Project:* ${projectForm.configuration?.projectName || projectForm.projectId}
*Questions Answered:* ${summaryItems.length}
`;

      const list = summaryItems
        .map(
          (item) =>
            `*${item.index}. ${item.label}*\n${
              item.value && item.value.trim().length > 0
                ? item.value
                : '❌ Not provided'
            }`
        )
        .join('\n\n');

      const footer = `\nReply with:
1. Confirm
2. Edit {#}
3. Delete {#}
4. Review
5. Cancel`;

      const summaryMessage = `${header}${list}${footer}`;
      await this.sendTextMessage(phoneNumber, summaryMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending batch summary to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send single-prompt batch input instructions
   * @param {string} phoneNumber
   * @param {Object} projectForm
   * @param {Array} template
   */
  async sendFormIntro(phoneNumber, projectForm, whatsappConfig = {}) {
    try {
      const context = buildProjectContext(projectForm);
      const messagesConfig = whatsappConfig.messages || {};

      const welcomeMessage = formatMessageTemplate(
        messagesConfig.welcome,
        context
      ).trim();
      if (welcomeMessage) {
        await this.sendTextMessage(phoneNumber, welcomeMessage);
      }

      const instructions = formatMessageTemplate(
        whatsappConfig.instructions,
        context
      ).trim();
      if (instructions) {
        await this.sendTextMessage(phoneNumber, instructions);
      }
      const templateRaw = Array.isArray(whatsappConfig.template)
        ? whatsappConfig.template
        : [];
      const templateLines = templateRaw
        .map((line) => formatMessageTemplate(line, context).trim())
        .filter(Boolean);
      if (templateLines.length > 0) {
        const projectName = projectForm?.configuration?.projectName || 'Form';
        const templateMessage = `📝 *${projectName}*\n\n${templateLines.join(
          '\n'
        )}`;
        await this.sendTextMessage(phoneNumber, templateMessage);
      }
    } catch (error) {
      logger.error(
        `❌ Error sending form intro to ${phoneNumber}:`,
        error.message
      );
    }
  }

  /**
   * Send single-prompt batch input instructions
   * @param {string} phoneNumber
   * @param {Object} projectForm
   * @param {Array} template
   */
  async sendBatchInputInstructions(
    phoneNumber,
    projectForm,
    template = [],
    whatsappConfig = {}
  ) {
    const projectName = projectForm.configuration?.projectName || 'Form';
    const hasCustomTemplate =
      Array.isArray(whatsappConfig.template) &&
      whatsappConfig.template.some(
        (line) => typeof line === 'string' && line.trim()
      );

    if (hasCustomTemplate) {
      // Intro already delivered the custom template, no need for fallback.
      return;
    }

    if (!Array.isArray(template) || template.length === 0) {
      const fallback = `📝 *${projectName}*

Please reply with your answers using "key: value" format (one per line).`;
      await this.sendTextMessage(phoneNumber, fallback);
      return;
    }

    const fieldLines = template
      .map((item) => {
        const key = item.key || item.id || `field_${item.index}`;
        const options = extractOptionLabels(item.properties || {});
        const hint = buildFieldHint({
          type: item.type,
          options,
          maxLength: item.properties?.maxLength,
          min: item.properties?.min,
          max: item.properties?.max,
        });
        const hintPart = hint ? ` (${hint})` : '';
        const aliasPart =
          Array.isArray(item.displayAliases) && item.displayAliases.length > 0
            ? `\nAliases: ${item.displayAliases.join(', ')}`
            : '';
        return `${key}: ${item.label}${hintPart}${aliasPart}`;
      })
      .join('\n\n');

    const message = `📝 *${projectName}*

Send any fields to change as \`field: value\`. One per line.

Available fields:
${fieldLines}`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Send instructions after user selects the edit answers button
   * @param {string} phoneNumber
   */
  async sendBatchEditInstructions(phoneNumber) {
    const message = `✏️ *Edit Answers*

Use these codes:
• 2 {#} – edit a question (e.g. "2 3")
• 3 {#} – delete a question (e.g. "3 2")
• 4 – view the summary
• 5 – cancel`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Helper to format values for summary display
   * @param {*} answer
   * @returns {string}
   */
  formatSummaryValue(answer) {
    if (answer === null || answer === undefined) {
      return '❌ Not provided';
    }
    if (typeof answer === 'object') {
      if (answer.fileName || answer.filename) {
        return `📎 File: ${answer.fileName || answer.filename}`;
      }
      if (answer.url) {
        return `🔗 ${answer.url}`;
      }
      try {
        return `\`\`\`\n${JSON.stringify(answer, null, 2)}\n\`\`\``;
      } catch (error) {
        return String(answer);
      }
    }
    return String(answer);
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
      const whatsappConfig = getWhatsappConfigFromForm(projectForm);
      const context = buildProjectContext(projectForm, { jobId });
      const customMessage = formatMessageTemplate(
        whatsappConfig?.messages?.success,
        context
      ).trim();

      if (customMessage) {
        await this.sendTextMessage(phoneNumber, customMessage);
      }

      const successMessage = `✅ *Submitted*

Project: ${projectForm?.configuration?.projectName || 'Project'}
Job: ${jobId}

Next?
1. Again
2. Menu
3. Status`;

      await this.sendTextMessage(phoneNumber, successMessage);
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
  async sendSubmissionFailure(phoneNumber, error, projectForm = null) {
    try {
      const whatsappConfig = getWhatsappConfigFromForm(projectForm);
      const context = buildProjectContext(projectForm, { error });
      const customMessage = formatMessageTemplate(
        whatsappConfig?.messages?.error,
        context
      ).trim();

      const failureMessage =
        customMessage ||
        `❌ *Submission Failed*

*Error:* ${error || 'Unknown issue'}

Reply with a number:
1. Try submission again
2. Edit or review answers
3. Return to main menu (/menu)
4. Contact support (/support)

We'll keep your draft so you can pick up where you stopped.`;

      await this.sendTextMessage(phoneNumber, failureMessage);
    } catch (err) {
      logger.error(
        `❌ Error sending submission failure to ${phoneNumber}:`,
        err.message
      );
      throw err;
    }
  }

  /**
   * Send error message
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} error - Error message
   * @returns {Promise<Object>} Send result
   */
  async sendErrorMessage(phoneNumber, error, projectForm = null) {
    try {
      const whatsappConfig = getWhatsappConfigFromForm(projectForm);
      const context = buildProjectContext(projectForm, { error });
      const customMessage = formatMessageTemplate(
        whatsappConfig?.messages?.error,
        context
      ).trim();

      const errorMessage =
        customMessage ||
        `⚠️ Something didn’t go as expected.

${error}

What now?
• /menu – return to the main menu
• /help – see guidance
• /support – contact support

We’ll keep your spot while you retry.`;

      await this.sendTextMessage(phoneNumber, errorMessage);
    } catch (err) {
      logger.error(
        `❌ Error sending error message to ${phoneNumber}:`,
        err.message
      );
      throw err;
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
      const welcomeMessage = `👋 *Welcome to Saby!*

I’ll verify your access and guide you through any form you choose.

Type \`start\` to begin or \`menu\` to see everything I can do.`;

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
      const helpMessage = `❓ *Need help with Saby?*

Here’s what each shortcut does:

• 1 – *Authentication*: resend OTP, enter passcode, or verify your details.
• 2 – *Profile & Update*: review or edit your profile info, reset sessions.
• 3 – *Unit & Update*: select your reporting unit or update unit information.
• 4 – *Project & Forms*: list available projects, resume forms, submit answers.
• 5 – *Support & Status*: contact support, read help tips, or check your status.
• CANCEL – Abort the current flow and return to the main menu.
• 21 – *Main Menu*: show the full navigation menu again anytime.

Type the number that matches what you need.`;
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
  async sendSupportMessage(phoneNumber, userName = 'there') {
    try {
      const safeName = userName || 'there';
      const supportMessage = `🆘 *Saby Support*

Hi ${safeName}, reach us via:
• Email: support@saby.ai
• WhatsApp: +234 814 504 5108

Need anything else?
• 20 – Back to Support menu
• 21 – Main menu`;

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
  async sendStatusMessage(phoneNumber, userName = 'User') {
    try {
      const safeName = userName || 'User';
      const statusMessage = `📊 *Saby status*
Hi ${safeName}, you’re signed in with ${phoneNumber}.

Next steps:
• 20 – Back to Support menu
• 21 – Main menu`;

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
  async sendMainMenu(phoneNumber, userName = 'there') {
    try {
      const safeName = userName || 'there';
      const menuMessage = `🏠 *Saby Main Menu*
Hi ${safeName}! Reply with a number to continue.
Use 20 to go back, 21 to refresh this menu.
CANCEL – Cancel the current flow and return here.

1. Authentication – passcode, OTP, verification
2. Profile & Update – view or edit your details
3. Unit & Update – manage your assigned unit
4. Project & Forms – pick or review submissions
5. Support – help, status, or contact the team

After you open a section, use the two-digit shortcuts shown (e.g., 11, 22).`;

      await this.sendTextMessage(phoneNumber, menuMessage);
    } catch (error) {
      logger.error(
        `❌ Error sending main menu to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Send authentication submenu
   * @param {string} phoneNumber
   */
  async sendAuthenticationMenu(phoneNumber) {
    const message = `🔐 *Authentication*
Reply with:
11 – Logout (/logout)
12 – Reset password (/resetpassword)
13 – Verify account (/verify)
20 – Back to previous menu
21 – Main menu
CANCEL – Cancel current flow`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Send profile submenu
   * @param {string} phoneNumber
   */
  async sendProfileMenu(phoneNumber) {
    const message = `🪪 *Profile & Update*
Reply with:
22 – View your profile (/profile)
23 – Update profile details (/update profile)
24 – Reset this session (/reset)
20 – Back to previous menu
21 – Main menu
CANCEL – Cancel current flow`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Send unit submenu
   * @param {string} phoneNumber
   */
  async sendUnitMenu(phoneNumber) {
    const message = `🏢 *Unit & Update*
Reply with:
31 – Switch active unit (/node)
32 – Update unit information (/unit)
20 – Back to previous menu
21 – Main menu
CANCEL – Cancel current flow`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Send projects/forms submenu
   * @param {string} phoneNumber
   */
  async sendProjectMenu(phoneNumber) {
    const message = `📁 *Project & Forms*
Reply with:
41 – Browse available forms & projects (/forms)
43 – Review or submit answers (/submit)
20 – Back to previous menu
21 – Main menu
CANCEL – Cancel current flow`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Send support submenu
   * @param {string} phoneNumber
   */
  async sendSupportMenu(phoneNumber) {
    const message = `🆘 *Support*
Reply with:
51 – Contact support (/support)
52 – Help guide (/help)
53 – Session status (/status)
20 – Back to previous menu
21 – Main menu
CANCEL – Cancel current flow`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Send reset confirmation
   * @param {string} phoneNumber - Recipient phone number
   * @param {string} userName - User's name
   * @returns {Promise<Object>} Send result
   */
  async sendResetConfirmation(phoneNumber, userName) {
    try {
      const resetMessage = `🔄 *Reset session?*

${userName}, this will clear your current answers. Continue?`;

      const buttons = [{ text: '✅ Reset' }, { text: '❌ Cancel' }];

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
   * Prompt user to select a node/location
   */
  async sendNodeSelectionPrompt(phoneNumber, nodes = []) {
    try {
      const options = nodes
        .map((node, index) => {
          const parts = [node.name || `Node ${index + 1}`];
          if (node.city) parts.push(node.city);
          if (node.country) parts.push(node.country);
          return `${index + 1}. ${parts.join(' • ')} ${
            node.isMain ? '(Primary)' : ''
          }`;
        })
        .join('\n');

      const message = `🏢 *Select Location / Node*

Please choose where you’re reporting from:

${options}

Reply with the number, name, or code of your chosen location.`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending node selection prompt to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Prompt the user to choose which unit to update.
   */
  async sendNodeUpdateSelectionPrompt(phoneNumber, nodes = []) {
    const list = nodes
      .map((node, index) => {
        const parts = [node.name || node.nodeId || `Unit ${index + 1}`];
        if (node.city || node.state) {
          parts.push(
            [node.city, node.state, node.country].filter(Boolean).join(', ')
          );
        }
        return `${index + 1}. ${parts.filter(Boolean).join(' • ')}`;
      })
      .join('\n');

    const message = `🏢 *Update a unit*

Reply with the number or name of the unit you want to update:

${list}

Type *cancel* to go back.`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Prompt the user to choose which field of the unit to update.
   */
  async sendNodeUpdateFieldPrompt(phoneNumber, nodeName, fields = []) {
    const list = fields
      .map(
        (field, idx) =>
          `${idx + 1}. ${field.label}${
            field.description ? ` — ${field.description}` : ''
          }`
      )
      .join('\n');

    const message = `✏️ *${nodeName}: choose what to update*

${list}

Reply with the number or name of the item you want to change, or type *cancel* to go back.`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Prompt the user for a new value for the selected unit field.
   */
  async sendNodeUpdateValuePrompt(phoneNumber, nodeName, field) {
    const message = `📝 *Update ${nodeName}*

Reply with the new value for *${field.label}*.
${field.description ? `\nHint: ${field.description}` : ''}

Type *cancel* to abort.`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Confirm successful unit update.
   */
  async sendNodeUpdateSuccess(phoneNumber, nodeName, fieldLabel, value) {
    const message = `✅ *Unit updated*

${nodeName} — ${fieldLabel} is now "${value}".

Use /menu if you need anything else.`;

    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Notify the user that the unit update flow was cancelled.
   */
  async sendNodeUpdateCancelled(phoneNumber) {
    await this.sendTextMessage(
      phoneNumber,
      '🟡 Unit update cancelled. Use /menu to continue.'
    );
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
      const errorMessage = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || 'Unknown error';
      logger.error(
        `❌ Error sending form selection menu to ${phoneNumber}: ${errorMessage}`
      );
      throw error;
    }
  }

  async sendProfileUpdatePrompt(phoneNumber, fields = []) {
    try {
      const options = fields
        .map((field, index) => `${index + 1}. ${field.label}`)
        .join('\n');

      const message = `🛠️ *Profile Update Wizard*

Which detail would you like to change?

${options}

Reply with the number or name of the field you want to update, or type *cancel* to exit.`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending profile update prompt to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  async sendProfileBulkInstructions(phoneNumber, fields = []) {
    const fieldLines = fields
      .map((field) => {
        const hint = buildFieldHint(field);
        const sampleValue = field.sampleValue || field.label || field.key;
        return `\`${field.key}: ${sampleValue}\`${hint ? ` — ${hint}` : ''}`;
      })
      .join('\n');

    const message = `🛠️ *Profile Bulk Update*

Send any fields to change as \`field: value\`. One per line. Example:
\`firstname: Jane\`
\`maritalStatus: Married\`

${fieldLines}

Type *done* when finished or *cancel* to exit.`;

    await this.sendTextMessage(phoneNumber, message);
  }

  async sendProfileBulkResult(phoneNumber, result) {
    const sections = [];
    if (result.applied.length > 0) {
      const lines = result.applied
        .map(
          (item) =>
            `• ${item.label}: ${item.display ?? item.value ?? '(updated)'}`
        )
        .join('\n');
      sections.push(`✅ *Updated*\n${lines}`);
    }
    if (result.errors.length > 0) {
      const lines = result.errors
        .map((item) => `• ${item.label}: ${item.error}`)
        .join('\n');
      sections.push(`⚠️ *Invalid*\n${lines}`);
    }
    if (result.unknown.length > 0) {
      const lines = result.unknown
        .map((item) => `• ${item.raw}${item.reason ? ` (${item.reason})` : ''}`)
        .join('\n');
      sections.push(`❓ *Unrecognized*\n${lines}`);
    }
    const message = `${sections.join('\n\n') || 'No changes detected.'}

Send more updates or type *done* to finish.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendNodeBulkInstructions(phoneNumber, node = {}, fields = []) {
    const fieldLines = fields
      .map((field) => {
        const hint = buildFieldHint(field);
        const sampleValue = field.sampleValue || field.label || field.key;
        return `\`${field.key}: ${sampleValue}\`${hint ? ` — ${hint}` : ''}`;
      })
      .join('\n');

    const message = `🏢 *Update ${node.name || node.nodeId}*

Send changes as \`field: value\`. Example:
\`address: 12 Unity Street\`
\`isMain: yes\`

${fieldLines}

Type *done* when finished or *cancel* to exit.`;

    await this.sendTextMessage(phoneNumber, message);
  }

  async sendNodeBulkResult(phoneNumber, node = {}, result) {
    const sections = [];
    if (result.applied.length > 0) {
      const lines = result.applied
        .map(
          (item) =>
            `• ${item.label}: ${item.display ?? item.value ?? '(updated)'}`
        )
        .join('\n');
      sections.push(`✅ *Updated*\n${lines}`);
    }
    if (result.errors.length > 0) {
      const lines = result.errors
        .map((item) => `• ${item.label}: ${item.error}`)
        .join('\n');
      sections.push(`⚠️ *Invalid*\n${lines}`);
    }
    if (result.unknown.length > 0) {
      const lines = result.unknown
        .map((item) => `• ${item.raw}${item.reason ? ` (${item.reason})` : ''}`)
        .join('\n');
      sections.push(`❓ *Unrecognized*\n${lines}`);
    }
    const message = `${sections.join('\n\n') || 'No changes detected.'}

Send more updates for ${node.name || node.nodeId} or type *done* to finish.`;
    await this.sendTextMessage(phoneNumber, message);
  }

  async sendProfileUpdateFieldPrompt(phoneNumber, fieldConfig) {
    try {
      const message = `✏️ *Update ${fieldConfig.label}*

${fieldConfig.description}

Type your new ${fieldConfig.label.toLowerCase()} or *cancel* to exit.`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending field prompt to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  async sendProfileUpdateConfirm(phoneNumber, fieldConfig, value) {
    try {
      const message = `✅ *Confirm Update*

Change ${fieldConfig.label} to:
${value}

Reply *Yes* to confirm or *No* to cancel.`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending profile update confirmation to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }

  async sendProfileUpdateSuccess(phoneNumber, fieldConfig, value) {
    try {
      const message = `🎉 *Profile Updated*

${fieldConfig.label} is now set to:
${value}

You can continue updating fields or type /menu to return.`;

      await this.sendTextMessage(phoneNumber, message);
    } catch (error) {
      logger.error(
        `❌ Error sending profile update success to ${phoneNumber}:`,
        error.message
      );
      throw error;
    }
  }
}

module.exports = new WhatsAppNotificationService();
