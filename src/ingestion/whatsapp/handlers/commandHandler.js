const { userService, projectFormService } = require('../../../services');
const whatsappValidationService = require('../services/whatsappValidation.service');
const whatsappNotificationService = require('../services/whatsappNotification.service');
const authHandler = require('./authHandler');
const logger = require('../../../config/logger');

/**
 * Command Handler for WhatsApp Bot
 * Handles all slash commands and provides command routing
 */
class CommandHandler {
  /**
   * Main command handler - routes commands to appropriate handlers
   * @param {string} command - Full command string (e.g., "/start", "/help")
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   */
  static async handleCommand(command, phoneNumber, session) {
    try {
      const [cmd, ...args] = command.split(' ');
      const commandName = cmd.toLowerCase();

      logger.info(`🔧 Processing command: ${commandName} for ${phoneNumber}`);

      switch (commandName) {
        case '/start':
          return await this.handleStart(phoneNumber, session, args);
        case '/help':
          return await this.handleHelp(phoneNumber, session, args);
        case '/support':
          return await this.handleSupport(phoneNumber, session, args);
        case '/status':
          return await this.handleStatus(phoneNumber, session, args);
        case '/menu':
          return await this.handleMenu(phoneNumber, session, args);
        case '/reset':
          return await this.handleReset(phoneNumber, session, args);
        case '/cancel':
          return await this.handleCancel(phoneNumber, session, args);
        case '/projects':
          return await this.handleProjects(phoneNumber, session, args);
        case '/forms':
          return await this.handleForms(phoneNumber, session, args);
        default:
          return await this.handleUnknown(phoneNumber, command);
      }
    } catch (error) {
      logger.error(`❌ Error handling command for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Sorry, there was an error processing your command. Please try again.'
      );
    }
  }

  /**
   * Handle /start command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleStart(phoneNumber, session, args) {
    try {
      logger.info(`🚀 /start command received from ${phoneNumber}`);

      // Reset session to initial state
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      session.projectId = null;
      session.formId = null;
      session.validationResult = null;
      await session.save();

      // Send enhanced welcome message
      await whatsappNotificationService.sendEnhancedWelcomeMessage(phoneNumber);

      logger.info(`✅ /start command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /start for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to start the bot. Please try again.');
    }
  }

  /**
   * Handle /help command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleHelp(phoneNumber, session, args) {
    try {
      logger.info(`❓ /help command received from ${phoneNumber}`);

      await whatsappNotificationService.sendHelpMessage(phoneNumber);

      logger.info(`✅ /help command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /help for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to show help. Please try again.');
    }
  }

  /**
   * Handle /support command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleSupport(phoneNumber, session, args) {
    try {
      logger.info(`🆘 /support command received from ${phoneNumber}`);

      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendSupportMessage(phoneNumber, userName);

      logger.info(`✅ /support command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /support for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show support information. Please try again.'
      );
    }
  }

  /**
   * Handle /status command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleStatus(phoneNumber, session, args) {
    try {
      logger.info(`📊 /status command received from ${phoneNumber}`);

      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendStatusMessage(phoneNumber, userName);

      logger.info(`✅ /status command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /status for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to show status. Please try again.');
    }
  }

  /**
   * Handle /menu command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleMenu(phoneNumber, session, args) {
    try {
      logger.info(`🏠 /menu command received from ${phoneNumber}`);

      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendMainMenu(phoneNumber, userName);

      logger.info(`✅ /menu command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /menu for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to show menu. Please try again.');
    }
  }

  /**
   * Handle /reset command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleReset(phoneNumber, session, args) {
    try {
      logger.info(`🔄 /reset command received from ${phoneNumber}`);

      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendResetConfirmation(phoneNumber, userName);

      logger.info(`✅ /reset command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /reset for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to reset session. Please try again.');
    }
  }

  /**
   * Handle /cancel command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleCancel(phoneNumber, session, args) {
    try {
      logger.info(`❌ /cancel command received from ${phoneNumber}`);

      // Reset session to authentication state
      session.status = 'authenticating';
      session.currentStep = 0;
      session.answers.clear();
      session.projectId = null;
      session.formId = null;
      session.validationResult = null;
      await session.save();

      await whatsappNotificationService.sendMessageWithClearKeyboard(
        phoneNumber,
        'Operation cancelled. Type /start to begin again.'
      );

      logger.info(`✅ /cancel command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /cancel for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to cancel operation. Please try again.');
    }
  }

  /**
   * Handle /projects command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleProjects(phoneNumber, session, args) {
    try {
      logger.info(`📋 /projects command received from ${phoneNumber}`);

      // Check if user is authenticated
      if (!session.userId || !session.tenantId) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please authenticate first by sending your phone number or using /start.'
        );
        return;
      }

      // Get available projects
      const availableProjects = await this.getAvailableProjects(session.tenantId);

      if (!availableProjects || availableProjects.length === 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'No projects available for your account. Please contact your administrator.'
        );
        return;
      }

      // Send project list
      await whatsappNotificationService.sendProjectList(phoneNumber, availableProjects);

      logger.info(`✅ /projects command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /projects for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to show projects. Please try again.');
    }
  }

  /**
   * Handle /forms command
   * @param {string} phoneNumber - User's phone number
   * @param {Object} session - User session object
   * @param {Array} args - Command arguments
   */
  static async handleForms(phoneNumber, session, args) {
    try {
      logger.info(`📝 /forms command received from ${phoneNumber}`);

      // Check if user is authenticated
      if (!session.userId || !session.tenantId) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please authenticate first by sending your phone number or using /start.'
        );
        return;
      }

      // Get available projects (forms)
      const availableProjects = await this.getAvailableProjects(session.tenantId);

      if (!availableProjects || availableProjects.length === 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'No forms available for your account. Please contact your administrator.'
        );
        return;
      }

      // Send form selection menu
      await whatsappNotificationService.sendFormSelectionMenu(phoneNumber, availableProjects);

      logger.info(`✅ /forms command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling /forms for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(phoneNumber, 'Failed to show forms. Please try again.');
    }
  }

  /**
   * Handle unknown commands
   * @param {string} phoneNumber - User's phone number
   * @param {string} command - Unknown command
   */
  static async handleUnknown(phoneNumber, command) {
    try {
      logger.info(`❓ Unknown command received from ${phoneNumber}: ${command}`);

      await whatsappNotificationService.sendMessageWithClearKeyboard(
        phoneNumber,
        `Unknown command: ${command}

Available commands:
/start - Start the bot
/help - Get help
/support - Contact support
/status - Check your status
/menu - Show main menu
/reset - Reset your session
/cancel - Cancel current operation
/projects - List available projects
/forms - List available forms

Type /help for more information.`
      );

      logger.info(`✅ Unknown command handled for ${phoneNumber}`);
    } catch (error) {
      logger.error(`❌ Error handling unknown command for ${phoneNumber}:`, error.message);
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        "Sorry, I didn't understand that command. Type /help for available commands."
      );
    }
  }

  /**
   * Get available projects for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {Array} Available projects
   */
  static async getAvailableProjects(tenantId) {
    try {
      const availableProjectsResult = await projectFormService.getProjectFormsByTenant(tenantId, {
        status: 'active',
        'metadata.deploymentStatus': 'published',
      });

      // Handle paginated result
      const availableProjects =
        availableProjectsResult && availableProjectsResult.results
          ? availableProjectsResult.results
          : availableProjectsResult;

      return availableProjects || [];
    } catch (error) {
      logger.error(`❌ Error getting available projects for tenant ${tenantId}:`, error.message);
      return [];
    }
  }
}

module.exports = CommandHandler;
