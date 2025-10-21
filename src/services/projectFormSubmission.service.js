const httpStatus = require('http-status');
const { ProjectFormSubmission, ProjectForm } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a form submission
 * @param {Object} submissionData - The submission data
 * @param {string} projectId - The project ID
 * @param {string} tenantId - The tenant ID (may be null for anonymous)
 * @param {ObjectId} submittedBy - The user who submitted (may be null for anonymous)
 * @returns {Promise<ProjectFormSubmission>}
 */
const createSubmission = async (
  submissionData,
  projectId,
  tenantId,
  submittedBy = null
) => {
  // If tenantId is null, we need to get it from the project
  if (!tenantId) {
    const projectForm = await ProjectForm.findOne({
      projectId,
      deletedAt: null,
    });
    if (!projectForm) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Project form not found');
    }
    tenantId = projectForm.tenantId;
  }

  return ProjectFormSubmission.createSubmission(
    submissionData,
    projectId,
    tenantId,
    submittedBy
  );
};

/**
 * Query for submissions
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const querySubmissions = async (filter, options) => {
  const finalFilter = {
    ...filter,
    deletedAt: null,
  };

  const submissions = await ProjectFormSubmission.paginate(finalFilter, {
    ...options,
    populate: options.populate || 'submittedBy projectFormId',
  });

  return submissions;
};

/**
 * Get submission by id
 * @param {ObjectId} id - The submission ID
 * @param {Object} options - Query options
 * @returns {Promise<ProjectFormSubmission>}
 */
const getSubmissionById = async (id, options = {}) => {
  const populateFields = options.populate || 'submittedBy projectFormId';
  const submission = await ProjectFormSubmission.findById(id).populate(
    populateFields
  );

  if (!submission || submission.deletedAt) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  return submission;
};

/**
 * Get submission by submission ID (unique string)
 * @param {string} submissionId - The unique submission ID
 * @param {Object} options - Query options
 * @returns {Promise<ProjectFormSubmission>}
 */
const getSubmissionBySubmissionId = async (submissionId, options = {}) => {
  const populateFields = options.populate || 'submittedBy projectFormId';
  const submission = await ProjectFormSubmission.findOne({
    submissionId,
    deletedAt: null,
  }).populate(populateFields);

  if (!submission) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Submission not found');
  }

  return submission;
};

/**
 * Get submissions by project ID
 * @param {string} projectId - The project ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getSubmissionsByProject = async (projectId, filter = {}, options = {}) =>
  ProjectFormSubmission.getSubmissionsByProject(projectId, filter, options);

/**
 * Get submissions by tenant
 * @param {string} tenantId - The tenant ID
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const getSubmissionsByTenant = async (tenantId, filter = {}, options = {}) =>
  ProjectFormSubmission.getSubmissionsByTenant(tenantId, filter, options);

/**
 * Update submission status
 * @param {ObjectId|string} submissionId - The submission ID
 * @param {string} status - New status
 * @param {ObjectId} processedBy - User processing the submission
 * @param {string} notes - Processing notes
 * @returns {Promise<ProjectFormSubmission>}
 */
const updateSubmissionStatus = async (
  submissionId,
  status,
  processedBy,
  notes = ''
) => {
  const submission = await getSubmissionById(submissionId);

  submission.status = status;

  if (status === 'completed') {
    await submission.markAsProcessed(processedBy, notes);
  } else {
    submission.processing = {
      processedAt: new Date(),
      processedBy,
      notes,
    };
    await submission.save();
  }

  return submission;
};

/**
 * Delete submission by id (soft delete)
 * @param {ObjectId} submissionId - The submission ID
 * @returns {Promise<ProjectFormSubmission>}
 */
const deleteSubmissionById = async (submissionId) => {
  const submission = await getSubmissionById(submissionId);
  await submission.softDelete();
  return submission;
};

/**
 * Get submission statistics for a project
 * @param {string} projectId - The project ID
 * @returns {Promise<Object>}
 */
const getSubmissionStats = async (projectId) => {
  const stats = await ProjectFormSubmission.aggregate([
    {
      $match: {
        projectId,
        deletedAt: null,
      },
    },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        statusBreakdown: {
          $push: '$status',
        },
        submissionsByDay: {
          $push: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$submittedAt',
              },
            },
          },
        },
        avgResponseTime: {
          $avg: {
            $subtract: ['$createdAt', '$submittedAt'],
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        totalSubmissions: 1,
        statusBreakdown: {
          submitted: {
            $size: {
              $filter: {
                input: '$statusBreakdown',
                cond: { $eq: ['$$this', 'submitted'] },
              },
            },
          },
          processing: {
            $size: {
              $filter: {
                input: '$statusBreakdown',
                cond: { $eq: ['$$this', 'processing'] },
              },
            },
          },
          completed: {
            $size: {
              $filter: {
                input: '$statusBreakdown',
                cond: { $eq: ['$$this', 'completed'] },
              },
            },
          },
          failed: {
            $size: {
              $filter: {
                input: '$statusBreakdown',
                cond: { $eq: ['$$this', 'failed'] },
              },
            },
          },
        },
        avgResponseTime: 1,
      },
    },
  ]);

  // Get daily submission counts for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyStats = await ProjectFormSubmission.aggregate([
    {
      $match: {
        projectId,
        deletedAt: null,
        submittedAt: { $gte: thirtyDaysAgo },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$submittedAt',
          },
        },
        count: { $sum: 1 },
      },
    },
    {
      $sort: { _id: 1 },
    },
  ]);

  return {
    ...(stats[0] || {
      totalSubmissions: 0,
      statusBreakdown: {
        submitted: 0,
        processing: 0,
        completed: 0,
        failed: 0,
      },
      avgResponseTime: 0,
    }),
    dailySubmissions: dailyStats,
    projectId,
  };
};

/**
 * Export submissions to various formats
 * @param {string} projectId - The project ID
 * @param {string} format - Export format (csv, excel, json)
 * @param {ObjectId} exportedBy - User requesting the export
 * @returns {Promise<Object>}
 */
const exportSubmissions = async (projectId, format = 'csv', exportedBy) => {
  const submissions = await ProjectFormSubmission.find({
    projectId,
    deletedAt: null,
  })
    .populate('submittedBy', 'name email')
    .populate('projectFormId', 'configuration.projectName')
    .sort({ submittedAt: -1 });

  if (submissions.length === 0) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No submissions found for this project'
    );
  }

  // This is a simplified export - in a real implementation, you would:
  // 1. Generate the actual file in the requested format
  // 2. Upload it to a storage service (S3, etc.)
  // 3. Return the download URL

  const exportData = submissions.map((submission) => ({
    submissionId: submission.submissionId,
    submittedAt: submission.submittedAt,
    submittedBy: submission.submittedBy?.name || 'Anonymous',
    status: submission.status,
    data: submission.submissionData,
  }));

  // For now, return a mock download URL
  // In production, this would be the actual file URL
  const downloadUrl = `${
    process.env.BACKEND_URL
  }/api/v1/exports/${projectId}_${Date.now()}.${format}`;

  // Track the export
  await Promise.all(
    submissions.map((submission) =>
      submission.addExport(exportedBy, format, downloadUrl)
    )
  );

  return {
    downloadUrl,
    format,
    recordCount: submissions.length,
    exportedAt: new Date(),
  };
};

/**
 * Search submissions
 * @param {string} query - Search query
 * @param {Object} filter - Additional filters
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const searchSubmissions = async (query, filter = {}, options = {}) => {
  const searchFilter = {
    ...filter,
    deletedAt: null,
    $or: [
      { submissionId: { $regex: query, $options: 'i' } },
      { 'submissionData.email': { $regex: query, $options: 'i' } },
      { 'submissionData.name': { $regex: query, $options: 'i' } },
      // Add more searchable fields as needed
    ],
  };

  return ProjectFormSubmission.paginate(searchFilter, {
    ...options,
    populate: options.populate || 'submittedBy projectFormId',
  });
};

module.exports = {
  createSubmission,
  querySubmissions,
  getSubmissionById,
  getSubmissionBySubmissionId,
  getSubmissionsByProject,
  getSubmissionsByTenant,
  updateSubmissionStatus,
  deleteSubmissionById,
  getSubmissionStats,
  exportSubmissions,
  searchSubmissions,
};
