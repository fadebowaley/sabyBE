const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Waitlist Model
 * Fields: email, userType, referralSource, metadata, status, subscribedAt
 *
 * Purpose: Store waiting list signups for pre-launch marketing
 * Note: This is intentionally NOT tenant-scoped as it's for pre-launch signups
 */
const waitlistSchema = mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    industry: {
      type: String,
      required: true,
      enum: [
        'Fintech',
        'Energy',
        'Non-Profit',
        'Education',
        'Healthcare',
        'Technology',
        'Manufacturing',
        'Retail',
        'Real Estate',
        'Other',
      ],
    },

    designation: {
      type: String,
      required: true,
      enum: [
        'Tech Entrepreneur',
        'CEO / Founder',
        'CTO',
        'CIO',
        'VP of Engineering',
        'VP of Product',
        'Head of Data',
        'Product Manager',
        'Engineering Manager',
        'Data Scientist',
        'Software Engineer',
        'Business Analyst',
        'Consultant',
        'Investor',
        'Other',
      ],
    },

    needsDemo: {
      type: Boolean,
      default: false,
    },

    userType: {
      type: String,
      enum: ['developer', 'investor', 'organization'],
      default: 'organization',
    },

    referralSource: {
      type: String,
      default: '',
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    status: {
      type: String,
      enum: ['pending', 'invited', 'converted'],
      default: 'pending',
    },

    subscribedAt: {
      type: Date,
      default: Date.now,
    },

    invitedAt: {
      type: Date,
      default: null,
    },

    convertedAt: {
      type: Date,
      default: null,
    },

    ipAddress: {
      type: String,
      default: '',
    },

    userAgent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Plugins
waitlistSchema.plugin(toJSON);
waitlistSchema.plugin(paginate);

/**
 * Check if email is already registered
 * @param {string} email
 * @returns {Promise<boolean>}
 */
waitlistSchema.statics.isEmailTaken = async function (email) {
  const user = await this.findOne({ email });
  return !!user;
};

/**
 * Get statistics
 * @returns {Promise<Object>}
 */
waitlistSchema.statics.getStats = async function () {
  const total = await this.countDocuments();
  const byType = await this.aggregate([
    { $group: { _id: '$userType', count: { $sum: 1 } } },
  ]);
  const byStatus = await this.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byIndustry = await this.aggregate([
    { $group: { _id: '$industry', count: { $sum: 1 } } },
  ]);
  const byDesignation = await this.aggregate([
    { $group: { _id: '$designation', count: { $sum: 1 } } },
  ]);
  const needsDemoCount = await this.countDocuments({ needsDemo: true });

  return {
    total,
    needsDemo: needsDemoCount,
    byType: byType.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    byStatus: byStatus.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    byIndustry: byIndustry.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    byDesignation: byDesignation.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
  };
};

/**
 * @typedef Waitlist
 */
const Waitlist = mongoose.model('Waitlist', waitlistSchema);

module.exports = Waitlist;
