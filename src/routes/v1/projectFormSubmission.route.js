const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const projectFormSubmissionValidation = require('../../validations/projectFormSubmission.validation');
const projectFormSubmissionController = require('../../controllers/projectFormSubmission.controller');
const requireSubscriptionCapability = require('../../middlewares/requireSubscriptionCapability');
const {
  publicFormSubmitLimiter,
} = require('../../middlewares/publicFormRateLimiter');

const {
  requireTenantParamAccess,
  requireProjectFormTenantAccess,
  requireSubmissionTenantAccess,
    requireBusinessSubmissionTenantAccess,

} = require('../../middlewares/tenantAccess');


const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ProjectFormSubmissions
 *   description: Project form submission management and retrieval
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ProjectFormSubmission:
 *       type: object
 *       required:
 *         - projectId
 *         - submissionData
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated ID of the submission
 *         submissionId:
 *           type: string
 *           description: The unique submission identifier
 *         projectId:
 *           type: string
 *           description: The project ID this submission belongs to
 *         submissionData:
 *           type: object
 *           description: The actual form data submitted
 *         submittedBy:
 *           type: string
 *           description: ID of the user who submitted (null for anonymous)
 *         submittedAt:
 *           type: string
 *           format: date-time
 *           description: When the form was submitted
 *         status:
 *           type: string
 *           enum: [submitted, processing, completed, failed, archived]
 *           description: Current status of the submission
 *         metadata:
 *           type: object
 *           description: Additional metadata about the submission
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// Create a new form submission (public route for form submissions)
router.post(
  '/',
  auth('create:form-submission'),
  validate(projectFormSubmissionValidation.createSubmission),
  projectFormSubmissionController.createSubmission
);

// Create a new public form submission by canonical reference
router.post(
  '/public/ref/:reference',
  publicFormSubmitLimiter,
  validate(projectFormSubmissionValidation.createSubmissionByReference),
  projectFormSubmissionController.createSubmissionByReference
);

/**
 * @swagger
 * /form-submissions:
 *   post:
 *     summary: Submit a form
 *     description: Submit form data for a project form (public endpoint)
 *     tags: [ProjectFormSubmissions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - projectId
 *               - submissionData
 *             properties:
 *               projectId:
 *                 type: string
 *                 description: The project ID
 *               submissionData:
 *                 type: object
 *                 description: The form data
 *               submittedAt:
 *                 type: string
 *                 format: date-time
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *     responses:
 *       "201":
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 submission:
 *                   $ref: '#/components/schemas/ProjectFormSubmission'
 *                 submissionId:
 *                   type: string
 *       "400":
 *         description: Bad Request
 *       "404":
 *         description: Project form not found
 */

// Get all submissions (admin only)
router.get(
  '/',
  auth('view:form-submission'),
  validate(projectFormSubmissionValidation.getSubmissions),
  projectFormSubmissionController.getSubmissions
);

/**
 * @swagger
 * /form-submissions:
 *   get:
 *     summary: Get all form submissions
 *     description: Retrieve a paginated list of form submissions with filtering options
 *     tags: [ProjectFormSubmissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: projectId
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [submitted, processing, completed, failed, archived]
 *         description: Filter by status
 *       - in: query
 *         name: submittedBy
 *         schema:
 *           type: string
 *         description: Filter by user who submitted
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *         description: Sort by field
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Maximum number of results per page
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ProjectFormSubmission'
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalResults:
 *                   type: integer
 */

// Get submissions by project ID
router.get(
  '/project/:projectId',
  auth('view:form-submission'),
  requireProjectFormTenantAccess('projectId'),
  validate(projectFormSubmissionValidation.getSubmissionsByProject),
  projectFormSubmissionController.getSubmissionsByProject
);

// Get submissions by tenant
router.get(
  '/tenant/:tenantId',
  auth('view:form-submission'),
  requireTenantParamAccess('tenantId'),
  validate(projectFormSubmissionValidation.getSubmissionsByTenant),
  projectFormSubmissionController.getSubmissionsByTenant
);

// Get submission statistics for a project
router.get(
  '/project/:projectId/stats',
  auth('view:form-submission'),
  requireProjectFormTenantAccess('projectId'),
  validate(projectFormSubmissionValidation.getSubmissionStats),
  projectFormSubmissionController.getSubmissionStats
);

// Export submissions for a project
router.get(
  '/project/:projectId/export',
  auth('view:form-submission'),
  requireProjectFormTenantAccess('projectId'),
  requireSubscriptionCapability('advancedExports'),
  validate(projectFormSubmissionValidation.exportSubmissions),
  projectFormSubmissionController.exportSubmissions
);

// Get submission by ID

router.get(
  '/by-submission-id/:submissionId',
  auth('view:form-submission'),
  requireBusinessSubmissionTenantAccess('submissionId'),
  validate(projectFormSubmissionValidation.getSubmissionByBusinessId),
  projectFormSubmissionController.getSubmissionBySubmissionId
);




router.get(
  '/:submissionId',
  auth('view:form-submission'),
  requireSubmissionTenantAccess('submissionId'),
  validate(projectFormSubmissionValidation.getSubmission),
  projectFormSubmissionController.getSubmission
);

// Update submission payload and/or status
router.patch(
  '/:submissionId',
  auth('update:form-submission'),
  requireSubmissionTenantAccess('submissionId'),
  validate(projectFormSubmissionValidation.updateSubmission),
  projectFormSubmissionController.updateSubmission
);

/**
 * @swagger
 * /form-submissions/{submissionId}:
 *   get:
 *     summary: Get submission by ID
 *     description: Retrieve a form submission by its ID
 *     tags: [ProjectFormSubmissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Submission ID
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectFormSubmission'
 *       "404":
 *         description: Submission not found
 */

// Update submission status
router.patch(
  '/:submissionId/status',
  auth('update:form-submission'),
  requireSubmissionTenantAccess('submissionId'),
  validate(projectFormSubmissionValidation.updateSubmissionStatus),
  projectFormSubmissionController.updateSubmissionStatus
);

/**
 * @swagger
 * /form-submissions/{submissionId}/status:
 *   patch:
 *     summary: Update submission status
 *     description: Update the status of a form submission
 *     tags: [ProjectFormSubmissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: submissionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Submission ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [submitted, processing, completed, failed, archived]
 *               notes:
 *                 type: string
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 submission:
 *                   $ref: '#/components/schemas/ProjectFormSubmission'
 */

// Delete submission (soft delete)
router.delete(
  '/:submissionId',
  auth('delete:form-submission'),
  requireSubmissionTenantAccess('submissionId'),
  validate(projectFormSubmissionValidation.deleteSubmission),
  projectFormSubmissionController.deleteSubmission
);

module.exports = router;
