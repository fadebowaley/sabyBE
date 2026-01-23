/**
 * Data Migration: Migrate Existing PERM Forms to New Structure
 *
 * This script migrates existing ProjectForm documents that have PERM enabled
 * to the new flexible tracking mode structure.
 *
 * What it does:
 * 1. Finds all forms with existing event-based configurations
 * 2. Sets trackingMode to 'weekly' (backward compatible)
 * 3. Maps existing eventTypes to weeklyConfig.days structure
 * 4. Preserves all existing functionality
 *
 * Run with: node sabyBackend/src/scripts/migrations/migrate_existing_perm_forms.js
 */

const mongoose = require('mongoose');
const config = require('../../config/config');
const logger = require('../../config/logger');

// Connect to MongoDB
mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  logger.info('Connected to MongoDB');
});

// Import models
const ProjectForm = require('../../models/projectForm.model');

// Day name mapping
const DAY_MAPPING = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

// Event type to day mapping (common patterns)
const EVENT_TYPE_TO_DAY = {
  sunday_event: { day: 0, name: 'Sunday', frequency: 'weekly' },
  sunday_service: { day: 0, name: 'Sunday', frequency: 'weekly' },
  monday_event: { day: 1, name: 'Monday', frequency: 'weekly' },
  bible_study: { day: 1, name: 'Monday', frequency: 'weekly' }, // Common pattern
  tuesday_event: { day: 2, name: 'Tuesday', frequency: 'weekly' },
  wednesday_event: { day: 3, name: 'Wednesday', frequency: 'weekly' },
  thursday_event: { day: 4, name: 'Thursday', frequency: 'weekly' },
  prayer_meeting: { day: 4, name: 'Thursday', frequency: 'weekly' }, // Common pattern
  friday_event: { day: 5, name: 'Friday', frequency: 'weekly' },
  youth_service: { day: 5, name: 'Friday', frequency: 'biweekly' }, // Common pattern
  saturday_event: { day: 6, name: 'Saturday', frequency: 'weekly' },
};

/**
 * Parse event type to extract day information
 */
const parseEventType = (eventType) => {
  const lowerType = eventType.toLowerCase();

  // Check if it matches known patterns
  if (EVENT_TYPE_TO_DAY[lowerType]) {
    return EVENT_TYPE_TO_DAY[lowerType];
  }

  // Try to extract day name from event type
  for (const [dayName, dayNum] of Object.entries(DAY_MAPPING)) {
    if (lowerType.includes(dayName)) {
      return {
        day: dayNum,
        name: dayName.charAt(0).toUpperCase() + dayName.slice(1),
        frequency: 'weekly',
      };
    }
  }

  // Default to Sunday if no match
  return {
    day: 0,
    name: eventType,
    frequency: 'weekly',
  };
};

/**
 * Migrate a single form
 */
const migrateForm = async (form) => {
  try {
    // Check if form already has new structure
    if (form.permSettings?.trackingMode) {
      logger.info(`Skipping ${form.projectId} - already migrated`);
      return { skipped: true };
    }

    // Check if form has any PERM-like configuration
    const hasPERMConfig =
      form.permSettings?.enabled ||
      form.permSettings?.eventTypes?.length > 0 ||
      form.configuration?.tags?.includes('PERM');

    if (!hasPERMConfig) {
      logger.info(`Skipping ${form.projectId} - no PERM configuration`);
      return { skipped: true };
    }

    // Initialize permSettings if it doesn't exist
    if (!form.permSettings) {
      form.permSettings = {};
    }

    // Set tracking mode to weekly (backward compatible)
    form.permSettings.trackingMode = 'weekly';

    // Map eventTypes to weeklyConfig
    const eventTypes = form.permSettings.eventTypes || [];
    if (eventTypes.length > 0) {
      const days = eventTypes.map((eventType) => {
        const dayConfig = parseEventType(eventType);
        return {
          ...dayConfig,
          enabled: true,
          occurrences: dayConfig.frequency === 'biweekly' ? 2 : 4,
        };
      });

      form.permSettings.weeklyConfig = { days };
    } else {
      // Default to common church pattern (Sunday, Tuesday, Thursday)
      form.permSettings.weeklyConfig = {
        days: [
          {
            day: 0,
            name: 'Sunday',
            frequency: 'weekly',
            enabled: true,
            occurrences: 4,
          },
          {
            day: 2,
            name: 'Tuesday',
            frequency: 'weekly',
            enabled: true,
            occurrences: 5,
          },
          {
            day: 4,
            name: 'Thursday',
            frequency: 'weekly',
            enabled: true,
            occurrences: 5,
          },
        ],
      };
    }

    // Set common settings
    form.permSettings.requireNodeId = form.permSettings.requireNodeId !== false;
    form.permSettings.requireMonth = form.permSettings.requireMonth !== false;
    form.permSettings.trackCompliance =
      form.permSettings.trackCompliance !== false;
    form.permSettings.autoGenerateCalendar =
      form.permSettings.autoGenerateCalendar !== false;
    form.permSettings.autoLockMonthEnd =
      form.permSettings.autoLockMonthEnd !== false;

    // Generate formId if not set
    if (!form.formId) {
      form.formId = ProjectForm.generateFormId();
    }

    // Save the form
    await form.save();

    logger.info(
      `✅ Migrated ${form.projectId} - ${form.permSettings.weeklyConfig.days.length} days configured`
    );
    return { migrated: true };
  } catch (error) {
    logger.error(`❌ Error migrating ${form.projectId}:`, error.message);
    return { error: true, message: error.message };
  }
};

/**
 * Main migration function
 */
const runMigration = async () => {
  try {
    logger.info('🚀 Starting PERM forms migration...');

    // Find all forms with PERM configuration
    const forms = await ProjectForm.find({
      $or: [
        { 'permSettings.enabled': true },
        { 'permSettings.eventTypes.0': { $exists: true } },
        { 'configuration.tags': 'PERM' },
      ],
    });

    logger.info(`Found ${forms.length} forms to process`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const form of forms) {
      const result = await migrateForm(form);

      if (result.migrated) migrated++;
      if (result.skipped) skipped++;
      if (result.error) errors++;
    }

    logger.info('\n📊 Migration Summary:');
    logger.info(`✅ Migrated: ${migrated}`);
    logger.info(`⏭️  Skipped: ${skipped}`);
    logger.info(`❌ Errors: ${errors}`);
    logger.info(`📝 Total: ${forms.length}`);

    if (errors > 0) {
      logger.warn('⚠️  Some forms failed to migrate. Check logs above.');
    } else {
      logger.info('🎉 Migration completed successfully!');
    }

    process.exit(0);
  } catch (error) {
    logger.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(err);
  process.exit(1);
});

// Run migration
runMigration();


