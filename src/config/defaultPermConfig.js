/**
 * Default PERM (Per Event Reporting Model) Configuration
 *
 * Purpose: Provide default configuration for PERM-enabled projects
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

/**
 * Default PERM configuration for new projects
 */
const defaultPermConfig = {
  enabled: false,
  reportingMode: 'free-form', // 'free-form', 'per-event', 'monthly-node'

  eventCalendar: {
    eventTypes: [
      {
        name: 'primary_event',
        label: 'Primary Event',
        dayOfWeek: 0, // Sunday
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 6, // Submit within 6 days of event
      gracePeriod: 0, // No grace period by default
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 1, // Lock on 1st of next month
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [],
};

/**
 * Sample PERM configuration for church/religious organizations
 */
const churchPermConfig = {
  enabled: true,
  reportingMode: 'monthly-node',

  eventCalendar: {
    eventTypes: [
      {
        name: 'sunday_service',
        label: 'Sunday Service',
        dayOfWeek: 0,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'bible_study',
        label: 'Bible Study',
        dayOfWeek: 1,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'prayer_meeting',
        label: 'Prayer Meeting',
        dayOfWeek: 4,
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 6,
      gracePeriod: 1,
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 1,
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [
    {
      name: 'attendance',
      label: 'Attendance Tracking',
      required: true,
      validationRules: {
        checkTotals: true,
        requiredFields: ['men', 'women', 'youth', 'children', 'total'],
      },
    },
    {
      name: 'financial',
      label: 'Financial Contributions',
      required: true,
      validationRules: {
        checkTotals: true,
        percentageValidation: {
          offering: { target: 50, tolerance: 5 },
          tithe: { target: 25, tolerance: 5 },
          special: { minAmount: 1000 },
        },
      },
    },
    {
      name: 'first_timers',
      label: 'First Time Visitors',
      required: false,
      validationRules: {
        requiredFields: ['name', 'date', 'contact'],
      },
    },
  ],
};

/**
 * Sample PERM configuration for delivery/logistics tracking
 */
const deliveryPermConfig = {
  enabled: true,
  reportingMode: 'monthly-node',

  eventCalendar: {
    eventTypes: [
      {
        name: 'monday_delivery',
        label: 'Monday Deliveries',
        dayOfWeek: 1,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'wednesday_delivery',
        label: 'Wednesday Deliveries',
        dayOfWeek: 3,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'friday_delivery',
        label: 'Friday Deliveries',
        dayOfWeek: 5,
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 3, // Shorter window for logistics
      gracePeriod: 0,
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 3, // Lock on 3rd of next month (allow reconciliation)
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [
    {
      name: 'deliveries',
      label: 'Delivery Records',
      required: true,
      validationRules: {
        requiredFields: ['delivery_id', 'recipient', 'status', 'timestamp'],
      },
    },
    {
      name: 'incidents',
      label: 'Delivery Incidents',
      required: false,
      validationRules: {
        requiredFields: ['incident_type', 'description', 'resolution_status'],
      },
    },
  ],
};

module.exports = {
  defaultPermConfig,
  churchPermConfig,
  deliveryPermConfig,
};

/**
 * Default PERM (Per Event Reporting Model) Configuration
 *
 * Purpose: Provide default configuration for PERM-enabled projects
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

/**
 * Default PERM configuration for new projects
 */
const defaultPermConfig = {
  enabled: false,
  reportingMode: 'free-form', // 'free-form', 'per-event', 'monthly-node'

  eventCalendar: {
    eventTypes: [
      {
        name: 'primary_event',
        label: 'Primary Event',
        dayOfWeek: 0, // Sunday
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 6, // Submit within 6 days of event
      gracePeriod: 0, // No grace period by default
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 1, // Lock on 1st of next month
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [],
};

/**
 * Sample PERM configuration for church/religious organizations
 */
const churchPermConfig = {
  enabled: true,
  reportingMode: 'monthly-node',

  eventCalendar: {
    eventTypes: [
      {
        name: 'sunday_service',
        label: 'Sunday Service',
        dayOfWeek: 0,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'bible_study',
        label: 'Bible Study',
        dayOfWeek: 1,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'prayer_meeting',
        label: 'Prayer Meeting',
        dayOfWeek: 4,
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 6,
      gracePeriod: 1,
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 1,
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [
    {
      name: 'attendance',
      label: 'Attendance Tracking',
      required: true,
      validationRules: {
        checkTotals: true,
        requiredFields: ['men', 'women', 'youth', 'children', 'total'],
      },
    },
    {
      name: 'financial',
      label: 'Financial Contributions',
      required: true,
      validationRules: {
        checkTotals: true,
        percentageValidation: {
          offering: { target: 50, tolerance: 5 },
          tithe: { target: 25, tolerance: 5 },
          special: { minAmount: 1000 },
        },
      },
    },
    {
      name: 'first_timers',
      label: 'First Time Visitors',
      required: false,
      validationRules: {
        requiredFields: ['name', 'date', 'contact'],
      },
    },
  ],
};

/**
 * Sample PERM configuration for delivery/logistics tracking
 */
const deliveryPermConfig = {
  enabled: true,
  reportingMode: 'monthly-node',

  eventCalendar: {
    eventTypes: [
      {
        name: 'monday_delivery',
        label: 'Monday Deliveries',
        dayOfWeek: 1,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'wednesday_delivery',
        label: 'Wednesday Deliveries',
        dayOfWeek: 3,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'friday_delivery',
        label: 'Friday Deliveries',
        dayOfWeek: 5,
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 3, // Shorter window for logistics
      gracePeriod: 0,
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 3, // Lock on 3rd of next month (allow reconciliation)
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [
    {
      name: 'deliveries',
      label: 'Delivery Records',
      required: true,
      validationRules: {
        requiredFields: ['delivery_id', 'recipient', 'status', 'timestamp'],
      },
    },
    {
      name: 'incidents',
      label: 'Delivery Incidents',
      required: false,
      validationRules: {
        requiredFields: ['incident_type', 'description', 'resolution_status'],
      },
    },
  ],
};

module.exports = {
  defaultPermConfig,
  churchPermConfig,
  deliveryPermConfig,
};

/**
 * Default PERM (Per Event Reporting Model) Configuration
 *
 * Purpose: Provide default configuration for PERM-enabled projects
 * Author: Saby Backend Team
 * Date: 2025-10-19
 */

/**
 * Default PERM configuration for new projects
 */
const defaultPermConfig = {
  enabled: false,
  reportingMode: 'free-form', // 'free-form', 'per-event', 'monthly-node'

  eventCalendar: {
    eventTypes: [
      {
        name: 'primary_event',
        label: 'Primary Event',
        dayOfWeek: 0, // Sunday
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 6, // Submit within 6 days of event
      gracePeriod: 0, // No grace period by default
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 1, // Lock on 1st of next month
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [],
};

/**
 * Sample PERM configuration for church/religious organizations
 */
const churchPermConfig = {
  enabled: true,
  reportingMode: 'monthly-node',

  eventCalendar: {
    eventTypes: [
      {
        name: 'sunday_service',
        label: 'Sunday Service',
        dayOfWeek: 0,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'bible_study',
        label: 'Bible Study',
        dayOfWeek: 1,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'prayer_meeting',
        label: 'Prayer Meeting',
        dayOfWeek: 4,
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 6,
      gracePeriod: 1,
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 1,
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [
    {
      name: 'attendance',
      label: 'Attendance Tracking',
      required: true,
      validationRules: {
        checkTotals: true,
        requiredFields: ['men', 'women', 'youth', 'children', 'total'],
      },
    },
    {
      name: 'financial',
      label: 'Financial Contributions',
      required: true,
      validationRules: {
        checkTotals: true,
        percentageValidation: {
          offering: { target: 50, tolerance: 5 },
          tithe: { target: 25, tolerance: 5 },
          special: { minAmount: 1000 },
        },
      },
    },
    {
      name: 'first_timers',
      label: 'First Time Visitors',
      required: false,
      validationRules: {
        requiredFields: ['name', 'date', 'contact'],
      },
    },
  ],
};

/**
 * Sample PERM configuration for delivery/logistics tracking
 */
const deliveryPermConfig = {
  enabled: true,
  reportingMode: 'monthly-node',

  eventCalendar: {
    eventTypes: [
      {
        name: 'monday_delivery',
        label: 'Monday Deliveries',
        dayOfWeek: 1,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'wednesday_delivery',
        label: 'Wednesday Deliveries',
        dayOfWeek: 3,
        frequency: 'weekly',
        required: true,
      },
      {
        name: 'friday_delivery',
        label: 'Friday Deliveries',
        dayOfWeek: 5,
        frequency: 'weekly',
        required: true,
      },
    ],
  },

  complianceRules: {
    weeklySubmissionWindow: {
      enabled: true,
      days: 3, // Shorter window for logistics
      gracePeriod: 0,
    },
    monthEndLock: {
      enabled: true,
      lockOnDay: 3, // Lock on 3rd of next month (allow reconciliation)
      autoLock: true,
    },
    notifications: {
      weeklyReminder: true,
      lateSubmissionWarning: true,
      completionConfirmation: true,
      monthEndSummary: true,
    },
  },

  categories: [
    {
      name: 'deliveries',
      label: 'Delivery Records',
      required: true,
      validationRules: {
        requiredFields: ['delivery_id', 'recipient', 'status', 'timestamp'],
      },
    },
    {
      name: 'incidents',
      label: 'Delivery Incidents',
      required: false,
      validationRules: {
        requiredFields: ['incident_type', 'description', 'resolution_status'],
      },
    },
  ],
};

module.exports = {
  defaultPermConfig,
  churchPermConfig,
  deliveryPermConfig,
};

