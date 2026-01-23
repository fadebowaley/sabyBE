const whatsappNotificationService = require('../services/whatsappNotification.service');
const authHandler = require('./authHandler');
const formHandler = require('./formHandler');
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

      const allowedDuringLogin = new Set([
        '/start',
        '/help',
        '/support',
        '/login',
        '/otp',
        '/logout',
      ]);

      if (
        session.status === 'awaiting_login' &&
        !allowedDuringLogin.has(commandName)
      ) {
        await authHandler.promptLogin(phoneNumber, session);
        return;
      }

      switch (commandName) {
        case '/start':
          return await this.handleStart(phoneNumber, session, args);
        case '/help':
          return await this.handleHelp(phoneNumber, session, args);
        case '/support':
          return await this.handleSupport(phoneNumber, session, args);
        case '/status':
          return await this.handleStatus(phoneNumber, session, args);
        case '/logout':
          return await authHandler.handleLogout(phoneNumber, session);
        case '/profile':
          return await this.handleProfile(phoneNumber, session);
        case '/verify':
          return await this.handleVerify(phoneNumber, session);
        case '/update':
        case '/updateprofile':
        case '/update_profile':
          return await this.handleUpdateProfile(phoneNumber, session);
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
        case '/node':
          return await this.handleNode(phoneNumber, session);
        case '/unit':
        case '/unitupdate':
        case '/updateunit':
        case '/update_node':
          return await this.handleUnitUpdate(phoneNumber, session);
        case '/login':
          return await authHandler.promptLogin(phoneNumber, session);
        case '/otp':
          return await authHandler.handleLoginChallenge(
            phoneNumber,
            session,
            'otp'
          );
        case '/resetpassword':
          return await this.handleResetPassword(phoneNumber, session);
        case '/submit':
          return await this.handleSubmitCommand(phoneNumber, session);
        case '/review':
          return await this.handleReviewCommand(phoneNumber, session);
        case '/edit':
          return await this.handleEditCommand(phoneNumber, session, args);
        case '/delete':
          return await this.handleDeleteCommand(phoneNumber, session, args);
        default:
          return await this.handleUnknown(phoneNumber, command);
      }
    } catch (error) {
      logger.error(
        `❌ Error handling command for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Sorry, there was an error processing your command. Please try again.'
      );
    }
  }

  /**
   * Handle /submit command (show summary)
   */
  static async handleSubmitCommand(phoneNumber, session) {
    try {
      logger.info(`📦 /submit command received from ${phoneNumber}`);
      await formHandler.presentBatchSummaryForSession(phoneNumber, session);
    } catch (error) {
      logger.error(
        `❌ Error handling /submit for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show the submission summary. Please try again.'
      );
    }
  }

  /**
   * Handle /review command (alias for summary)
   */
  static async handleReviewCommand(phoneNumber, session) {
    return this.handleSubmitCommand(phoneNumber, session);
  }

  /**
   * Handle /edit command
   */
  static async handleEditCommand(phoneNumber, session, args) {
    try {
      if (!args || args.length === 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Usage: /edit {question number}.'
        );
        return;
      }

      const index = parseInt(args[0], 10);
      if (Number.isNaN(index) || index <= 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please provide a valid question number to edit.'
        );
        return;
      }

      await formHandler.startEditStep(phoneNumber, session, index);
    } catch (error) {
      logger.error(
        `❌ Error handling /edit for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to start the edit flow. Please try again.'
      );
    }
  }

  /**
   * Handle /delete command
   */
  static async handleDeleteCommand(phoneNumber, session, args) {
    try {
      if (!args || args.length === 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Usage: /delete {question number}.'
        );
        return;
      }

      const index = parseInt(args[0], 10);
      if (Number.isNaN(index) || index <= 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please provide a valid question number to delete.'
        );
        return;
      }

      await formHandler.deleteAnswer(phoneNumber, session, index);
    } catch (error) {
      logger.error(
        `❌ Error handling /delete for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to clear the answer. Please try again.'
      );
    }
  }

  /**
   * Handle profile update wizard
   */
  static async handleUpdateProfile(phoneNumber, session) {
    try {
      logger.info(`🛠️ /update profile command received from ${phoneNumber}`);
      await authHandler.startProfileUpdate(phoneNumber, session);
    } catch (error) {
      logger.error(
        `❌ Error handling /update profile for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to start profile update. Please try again later.'
      );
    }
  }

  /**
   * Handle /unit command
   */
  static async handleUnitUpdate(phoneNumber, session) {
    try {
      logger.info(`🏢 /unit command received from ${phoneNumber}`);

      if (!session.userId || !session.tenantId) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please authenticate first by sending your phone number or using /start.'
        );
        return;
      }

      await authHandler.startNodeUpdate(phoneNumber, session);
    } catch (error) {
      logger.error(
        `❌ Error handling /unit for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to start the unit update flow. Please try again later.'
      );
    }
  }

  static async handleResetPassword(phoneNumber, session) {
    try {
      await authHandler.startPasswordReset(phoneNumber, session);
    } catch (error) {
      logger.error(
        `❌ Error handling /resetpassword for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Unable to start the password reset flow. Please try again later.'
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

      await authHandler.resetSessionForFreshStart(phoneNumber, session, {
        preserveAuth: false,
        notifyMenu: false,
      });

      // Send enhanced welcome message
      await whatsappNotificationService.sendEnhancedWelcomeMessage(phoneNumber);

      logger.info(
        `✅ /start command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /start for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to start the bot. Please try again.'
      );
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
      logger.error(
        `❌ Error handling /help for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show help. Please try again.'
      );
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
      await whatsappNotificationService.sendSupportMessage(
        phoneNumber,
        userName
      );

      logger.info(
        `✅ /support command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /support for ${phoneNumber}:`,
        error.message
      );
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
      await whatsappNotificationService.sendStatusMessage(
        phoneNumber,
        userName
      );

      logger.info(
        `✅ /status command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /status for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show status. Please try again.'
      );
    }
  }

  /**
   * Handle /profile command
   */
  static async handleProfile(phoneNumber, session) {
    try {
      logger.info(`🪪 /profile command received from ${phoneNumber}`);
      await authHandler.showProfileSummary(phoneNumber, session);
      logger.info(
        `✅ /profile command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /profile for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show your profile summary. Please try again.'
      );
    }
  }

  /**
   * Handle /verify command
   */
  static async handleVerify(phoneNumber, session) {
    try {
      logger.info(`🔐 /verify command received from ${phoneNumber}`);
      await authHandler.triggerVerification(phoneNumber, session);
      logger.info(
        `✅ /verify command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /verify for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to refresh your account details. Please try again later.'
      );
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

      await authHandler.resetSessionForFreshStart(phoneNumber, session, {
        preserveAuth: true,
        notifyMenu: false,
      });

      const userName = session.metadata?.userName || 'User';
      await whatsappNotificationService.sendMainMenu(phoneNumber, userName);

      logger.info(`✅ /menu command processed successfully for ${phoneNumber}`);
    } catch (error) {
      logger.error(
        `❌ Error handling /menu for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show menu. Please try again.'
      );
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
      await whatsappNotificationService.sendResetConfirmation(
        phoneNumber,
        userName
      );

      logger.info(
        `✅ /reset command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /reset for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to reset session. Please try again.'
      );
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

      await authHandler.resetSessionForFreshStart(phoneNumber, session, {
        preserveAuth: true,
        infoMessage:
          'Operation cancelled. You are back at the main menu. Type /start to restart the bot at any time.',
      });

      logger.info(
        `✅ /cancel command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /cancel for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to cancel operation. Please try again.'
      );
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
      const availableProjects = await this.getAvailableProjects(
        session.tenantId
      );

      if (!availableProjects || availableProjects.length === 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'No projects available for your account. Please contact your administrator.'
        );
        return;
      }

      // Send project list
      await whatsappNotificationService.sendProjectList(
        phoneNumber,
        availableProjects
      );

      logger.info(
        `✅ /projects command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /projects for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show projects. Please try again.'
      );
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
      const availableProjects = await this.getAvailableProjects(
        session.tenantId
      );

      if (!availableProjects || availableProjects.length === 0) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'No forms available for your account. Please contact your administrator.'
        );
        return;
      }

      // Send form selection menu
      await whatsappNotificationService.sendFormSelectionMenu(
        phoneNumber,
        availableProjects
      );

      logger.info(
        `✅ /forms command processed successfully for ${phoneNumber}`
      );
    } catch (error) {
      logger.error(
        `❌ Error handling /forms for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show forms. Please try again.'
      );
    }
  }

  /**
   * Handle /node command
   */
  static async handleNode(phoneNumber, session) {
    try {
      logger.info(`🏢 /node command received from ${phoneNumber}`);

      if (!session.userId || !session.tenantId) {
        await whatsappNotificationService.sendErrorMessage(
          phoneNumber,
          'Please authenticate first by sending your phone number or using /start.'
        );
        return;
      }

      await authHandler.requestNodeSelection(phoneNumber, session);
    } catch (error) {
      logger.error(
        `❌ Error handling /node for ${phoneNumber}:`,
        error.message
      );
      await whatsappNotificationService.sendErrorMessage(
        phoneNumber,
        'Failed to show node options. Please try again.'
      );
    }
  }

  /**
   * Handle unknown commands
   * @param {string} phoneNumber - User's phone number
   * @param {string} command - Unknown command
   */
  static async handleUnknown(phoneNumber, command) {
    try {
      logger.info(
        `❓ Unknown command received from ${phoneNumber}: ${command}`
      );

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
      logger.error(
        `❌ Error handling unknown command for ${phoneNumber}:`,
        error.message
      );
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
      return await formHandler.getAvailableProjects(tenantId);
    } catch (error) {
      logger.error(
        `❌ Error getting available projects for tenant ${tenantId}:`,
        error.message
      );
      return [];
    }
  }
}

module.exports = CommandHandler;
