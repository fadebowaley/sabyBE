/**
 * Email Template Service
 *
 * Loads and renders HTML email templates with Handlebars
 */

const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const logger = require('../config/logger');

class EmailTemplateService {
  constructor() {
    this.templatesDir = path.join(__dirname, '../templates/emails');
    this.cache = new Map();

    // Register Handlebars helpers
    this.registerHelpers();
  }

  /**
   * Register custom Handlebars helpers
   */
  registerHelpers() {
    // Equality helper
    Handlebars.registerHelper('eq', (a, b) => a === b);

    // Greater than helper
    Handlebars.registerHelper('gt', (a, b) => a > b);

    // Format date helper
    Handlebars.registerHelper('formatDate', (date) => {
      if (!date) return '';
      return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Format datetime helper
    Handlebars.registerHelper('formatDateTime', (date) => {
      if (!date) return '';
      return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    });
  }

  /**
   * Load and compile email template
   */
  async loadTemplate(templateName) {
    // Check cache
    if (this.cache.has(templateName)) {
      return this.cache.get(templateName);
    }

    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.html`);

      if (!fs.existsSync(templatePath)) {
        logger.error(`Template not found: ${templatePath}`);
        return null;
      }

      const templateContent = fs.readFileSync(templatePath, 'utf-8');
      const compiledTemplate = Handlebars.compile(templateContent);

      // Cache the compiled template
      this.cache.set(templateName, compiledTemplate);

      logger.info(`✅ Template loaded: ${templateName}`);
      return compiledTemplate;
    } catch (error) {
      logger.error(`Failed to load template ${templateName}:`, error.message);
      return null;
    }
  }

  /**
   * Render template with data
   */
  async render(templateName, data) {
    const template = await this.loadTemplate(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    try {
      const html = template(data);
      return html;
    } catch (error) {
      logger.error(`Failed to render template ${templateName}:`, error.message);
      throw error;
    }
  }

  /**
   * Clear template cache (useful for development)
   */
  clearCache() {
    this.cache.clear();
    logger.info('✅ Template cache cleared');
  }
}

module.exports = new EmailTemplateService();

