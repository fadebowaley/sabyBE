const mongoose = require('mongoose');
const { nanoid } = require('nanoid');
const { toJSON, paginate, tenantPlugin } = require('./plugins');

// Schema for submission metadata
const SubmissionMetadataSchema = new mongoose.Schema(
  {
    submissionId: {
      type: String,
      unique: true,
      default: () => `sub_${nanoid(12)}`,
    },
    userAgent: String,
    ipAddress: String,
    referrer: String,
    timestamp: { type: Number, default: Date.now },
    deviceInfo: {
      type: String,
      device: String,
      os: String,
      browser: String,
    },
    geolocation: {
      country: String,
      region: String,
      city: String,
      latitude: Number,
      longitude: Number,
    },
  },
  { _id: false }
);

// Main project form submission schema
const ProjectFormSubmissionSchema = new mongoose.Schema(
  {
    submissionId: {
      type: String,
      unique: true,
      default: () => `sub_${nanoid(12)}`,
    },
    projectId: {
      type: String,
      required: true,
      index: true,
    },
    projectFormId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectForm',
      required: true,
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
    },

    // The actual form data submitted by user
    submissionData: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // User who submitted (if authenticated)
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Submission timing
    submittedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    // Metadata about the submission
    metadata: SubmissionMetadataSchema,

    // Status and validation
    status: {
      type: String,
      enum: ['submitted', 'processing', 'completed', 'failed', 'archived'],
      default: 'submitted',
    },

    // Validation results
    validation: {
      isValid: { type: Boolean, default: true },
      errors: [String],
      warnings: [String],
    },

    // Processing information
    processing: {
      processedAt: Date,
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
      notes: String,
    },

    // File uploads (if any)
    attachments: [
      {
        fieldId: String,
        filename: String,
        originalName: String,
        size: Number,
        mimeType: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // Export and integration tracking
    exports: [
      {
        exportedAt: { type: Date, default: Date.now },
        exportedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        format: { type: String, enum: ['csv', 'excel', 'json', 'pdf'] },
        downloadUrl: String,
      },
    ],

    // Soft delete
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// Add plugins
ProjectFormSubmissionSchema.plugin(toJSON);
ProjectFormSubmissionSchema.plugin(paginate);
ProjectFormSubmissionSchema.plugin(tenantPlugin);

// Indexes for performance
ProjectFormSubmissionSchema.index({ projectId: 1, submittedAt: -1 });
ProjectFormSubmissionSchema.index({ tenantId: 1, submittedAt: -1 });
ProjectFormSubmissionSchema.index({ submittedBy: 1, submittedAt: -1 });
ProjectFormSubmissionSchema.index({ status: 1 });
ProjectFormSubmissionSchema.index({ deletedAt: 1 });

/**
 * Create a new form submission
 * @param {Object} submissionData - The submission data
 * @param {string} projectId - The project ID
 * @param {string} tenantId - The tenant ID
 * @param {ObjectId} [submittedBy] - The user who submitted (optional for anonymous)
 * @returns {Promise<ProjectFormSubmission>}
 */
ProjectFormSubmissionSchema.statics.createSubmission = async function (
  submissionData,
  projectId,
  tenantId,
  submittedBy = null
) {
  // Get the project form to validate
  const ProjectForm = mongoose.model('ProjectForm');
  const projectForm = await ProjectForm.findOne({
    projectId,
    tenantId,
    deletedAt: null,
  });

  if (!projectForm) {
    throw new Error('Project form not found or is not available');
  }

  // Check if form is published and active
  if (
    projectForm.metadata.deploymentStatus !== 'published' ||
    projectForm.status !== 'active'
  ) {
    throw new Error('This form is not currently accepting submissions');
  }

  const submissionPayload = {
    projectId,
    projectFormId: projectForm._id,
    tenantId,
    submissionData: submissionData.submissionData || submissionData.formData,
    submittedBy,
    submittedAt: submissionData.submittedAt || new Date(),
    metadata: {
      ...submissionData.metadata,
      submissionId:
        submissionData.metadata?.submissionId || `sub_${nanoid(12)}`,
    },
  };

  const submission = new this(submissionPayload);
  await submission.save();

  // Increment the project form submission count
  await projectForm.incrementSubmissions();

  return submission;
};

/**
 * Get submissions by project ID
 * @param {string} projectId - The project ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
ProjectFormSubmissionSchema.statics.getSubmissionsByProject = async function (
  projectId,
  filter = {},
  options = {}
) {
  const finalFilter = {
    ...filter,
    projectId,
    deletedAt: null,
  };

  return this.paginate(finalFilter, {
    ...options,
    populate: options.populate || 'submittedBy projectFormId',
  });
};

/**
 * Get submissions by tenant
 * @param {string} tenantId - The tenant ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
ProjectFormSubmissionSchema.statics.getSubmissionsByTenant = async function (
  tenantId,
  filter = {},
  options = {}
) {
  const finalFilter = {
    ...filter,
    tenantId,
    deletedAt: null,
  };

  return this.paginate(finalFilter, {
    ...options,
    populate: options.populate || 'submittedBy projectFormId',
  });
};

/**
 * Soft delete submission
 * @returns {Promise<ProjectFormSubmission>}
 */
ProjectFormSubmissionSchema.methods.softDelete = async function () {
  this.deletedAt = new Date();
  await this.save();
  return this;
};

/**
 * Mark submission as processed
 * @param {ObjectId} processedBy - User who processed the submission
 * @param {string} notes - Processing notes
 * @returns {Promise<ProjectFormSubmission>}
 */
ProjectFormSubmissionSchema.methods.markAsProcessed = async function (
  processedBy,
  notes = ''
) {
  this.status = 'completed';
  this.processing = {
    processedAt: new Date(),
    processedBy,
    notes,
  };
  await this.save();
  return this;
};

/**
 * Add export record
 * @param {ObjectId} exportedBy - User who exported
 * @param {string} format - Export format
 * @param {string} downloadUrl - Download URL
 * @returns {Promise<ProjectFormSubmission>}
 */
ProjectFormSubmissionSchema.methods.addExport = async function (
  exportedBy,
  format,
  downloadUrl
) {
  this.exports.push({
    exportedBy,
    format,
    downloadUrl,
  });
  await this.save();
  return this;
};

// Pre-save middleware
ProjectFormSubmissionSchema.pre('save', (next) => {
  // Validate submission data against form elements if needed
  // This could be expanded to include more complex validation
  next();
});

module.exports = mongoose.model(
  'ProjectFormSubmission',
  ProjectFormSubmissionSchema
);
