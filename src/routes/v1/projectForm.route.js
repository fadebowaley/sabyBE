const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const projectFormValidation = require('../../validations/projectForm.validation');
const projectFormController = require('../../controllers/projectForm.controller');
const workflowController = require('../../controllers/workflow.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: ProjectForms
 *   description: Project form management and retrieval
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     ProjectConfiguration:
 *       type: object
 *       required:
 *         - projectName
 *       properties:
 *         projectName:
 *           type: string
 *           description: The name of the project
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           description: Categories or tags for the project
 *         accessibility:
 *           type: array
 *           items:
 *             type: string
 *             enum: [api, embedded, javascript, mobile]
 *           description: Access methods for the project
 *         security:
 *           type: string
 *           enum: [public, private]
 *           description: Security level of the project
 *     FormElement:
 *       type: object
 *       required:
 *         - id
 *         - type
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the form element
 *         type:
 *           type: string
 *           description: Type of form element
 *         properties:
 *           type: object
 *           description: Element properties and configuration
 *         position:
 *           type: object
 *           properties:
 *             x:
 *               type: number
 *             y:
 *               type: number
 *     ProjectForm:
 *       type: object
 *       required:
 *         - configuration
 *       properties:
 *         id:
 *           type: string
 *           description: The auto-generated ID of the project form
 *         projectId:
 *           type: string
 *           description: The unique project identifier
 *         tenantId:
 *           type: string
 *           description: The tenant ID associated with the project
 *         createdBy:
 *           type: string
 *           description: ID of the user who created the project
 *         configuration:
 *           $ref: '#/components/schemas/ProjectConfiguration'
 *         elements:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/FormElement'
 *         style:
 *           type: string
 *           description: Visual style of the form
 *         wizardMode:
 *           type: boolean
 *           description: Whether the form is in wizard mode
 *         userSettings:
 *           type: object
 *           description: User-specific settings for the form
 *         metadata:
 *           type: object
 *           properties:
 *             version:
 *               type: string
 *             elementsCount:
 *               type: number
 *             hasValidation:
 *               type: boolean
 *             deploymentStatus:
 *               type: string
 *               enum: [draft, published, archived]
 *         analytics:
 *           type: object
 *           properties:
 *             views:
 *               type: number
 *             submissions:
 *               type: number
 *             conversionRate:
 *               type: number
 *         status:
 *           type: string
 *           enum: [active, inactive, archived]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

// Create a new project form
router.post(
  '/',
  auth('create:project-form'),
  validate(projectFormValidation.createProjectForm),
  projectFormController.createProjectForm
);

/**
 * @swagger
 * /project-forms:
 *   post:
 *     summary: Create a new project form
 *     description: Create a new project form with configuration and elements
 *     tags: [ProjectForms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProjectForm'
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
 *                 projectForm:
 *                   $ref: '#/components/schemas/ProjectForm'
 *                 formId:
 *                   type: string
 *       "400":
 *         description: Bad Request
 *       "401":
 *         description: Unauthorized
 *       "403":
 *         description: Forbidden
 */

// Get all project forms
router.get(
  '/',
  auth('view:project-form'),
  validate(projectFormValidation.getProjectForms),
  projectFormController.getProjectForms
);

/**
 * @swagger
 * /project-forms:
 *   get:
 *     summary: Get all project forms
 *     description: Retrieve a paginated list of project forms with filtering options
 *     tags: [ProjectForms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, archived]
 *         description: Filter by status
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search query for project name, tags, or project ID
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
 *                     $ref: '#/components/schemas/ProjectForm'
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *                 totalResults:
 *                   type: integer
 */

// Get project forms by tenant
router.get(
  '/tenant/:tenantId',
  auth('view:project-form'),
  validate(projectFormValidation.getProjectFormsByTenant),
  projectFormController.getProjectFormsByTenant
);

// Get project forms by user
router.get(
  '/user/:userId',
  auth('view:project-form'),
  validate(projectFormValidation.getProjectFormsByUser),
  projectFormController.getProjectFormsByUser
);

// Search project forms
router.get(
  '/search',
  auth('view:project-form'),
  validate(projectFormValidation.searchProjectForms),
  projectFormController.searchProjectForms
);

// Get project form statistics
router.get('/stats', auth('view:project-form'), projectFormController.getProjectFormStats);

// Get deleted project forms (within 14-day grace period)
router.get('/deleted', auth('view:project-form'), projectFormController.getDeletedProjectForms);

// Get project form by project ID (public route for form access)
router.get(
  '/project/:projectId',
  validate(projectFormValidation.getProjectFormByProjectId),
  projectFormController.getProjectFormByProjectId
);

// Get canonical storage folder for a project/module
router.get(
  '/project/:projectId/storage-folder',
  auth('view:project-form'),
  validate(projectFormValidation.getProjectFormByProjectId),
  projectFormController.getProjectStorageFolder
);

// Public route for accessing forms (no auth required)
router.get(
  '/public/:projectId',
  validate(projectFormValidation.getProjectFormByProjectId),
  projectFormController.getProjectFormByProjectId
);

/**
 * @swagger
 * /project-forms/project/{projectId}:
 *   get:
 *     summary: Get project form by project ID
 *     description: Retrieve a project form using its unique project ID
 *     tags: [ProjectForms]
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project ID
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectForm'
 *       "404":
 *         description: Project form not found
 */

// Get project analytics by project ID
router.get(
  '/project/:projectId/analytics',
  auth('view:project-form'),
  validate(projectFormValidation.getProjectAnalytics),
  projectFormController.getProjectAnalytics
);

// Update payment configuration
router.patch(
  '/project/:projectId/payment-config',
  auth('update:project-form'),
  projectFormController.updatePaymentConfig
);

// Increment project submissions (for when form is submitted)
router.post(
  '/project/:projectId/submit',
  validate(projectFormValidation.incrementSubmissions),
  projectFormController.incrementSubmissions
);

// Get project form by ID
router.get(
  '/:projectFormId',
  auth('view:project-form'),
  validate(projectFormValidation.getProjectForm),
  projectFormController.getProjectForm
);

/**
 * @swagger
 * /project-forms/{projectFormId}:
 *   get:
 *     summary: Get project form by ID
 *     description: Retrieve a project form by its database ID
 *     tags: [ProjectForms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectFormId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project form ID
 *     responses:
 *       "200":
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProjectForm'
 *       "404":
 *         description: Project form not found
 */

// Update project form by ID
router.patch(
  '/:projectFormId',
  auth('update:project-form'),
  validate(projectFormValidation.updateProjectForm),
  projectFormController.updateProjectForm
);

/**
 * @swagger
 * /project-forms/{projectFormId}:
 *   patch:
 *     summary: Update project form
 *     description: Update a project form by ID
 *     tags: [ProjectForms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectFormId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project form ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ProjectForm'
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
 *                 projectForm:
 *                   $ref: '#/components/schemas/ProjectForm'
 *       "404":
 *         description: Project form not found
 */

// Update project form by project ID
router.patch(
  '/project/:projectId',
  auth('update:project-form'),
  validate(projectFormValidation.updateProjectFormByProjectId),
  projectFormController.updateProjectFormByProjectId
);

// Delete project form (hard delete)
router.delete(
  '/:projectFormId',
  auth('delete:project-form'),
  validate(projectFormValidation.deleteProjectForm),
  projectFormController.deleteProjectForm
);

// Soft delete project form
router.patch(
  '/:projectFormId/delete',
  auth('delete:project-form'),
  validate(projectFormValidation.softDeleteProjectForm),
  projectFormController.softDeleteProjectForm
);

// Restore project form
router.patch(
  '/:projectFormId/restore',
  auth('update:project-form'),
  validate(projectFormValidation.restoreProjectForm),
  projectFormController.restoreProjectForm
);

// Publish project form
router.patch(
  '/:projectFormId/publish',
  auth('update:project-form'),
  validate(projectFormValidation.publishProjectForm),
  projectFormController.publishProjectForm
);

/**
 * @swagger
 * /project-forms/{projectFormId}/publish:
 *   patch:
 *     summary: Publish project form
 *     description: Publish a project form to make it live
 *     tags: [ProjectForms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: projectFormId
 *         required: true
 *         schema:
 *           type: string
 *         description: Project form ID
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
 *                 projectForm:
 *                   $ref: '#/components/schemas/ProjectForm'
 */

// Archive project form
router.patch(
  '/:projectFormId/archive',
  auth('update:project-form'),
  validate(projectFormValidation.archiveProjectForm),
  projectFormController.archiveProjectForm
);

// Delete by projectId (soft-delete or permanent)
router.delete(
  '/project/:projectId',
  auth('delete:project-form'),
  projectFormController.deleteProjectForm
);

// Bulk operations
router.post(
  '/bulk',
  auth('update:project-form'),
  validate(projectFormValidation.bulkOperations),
  projectFormController.bulkOperations
);

/**
 * @swagger
 * /project-forms/bulk:
 *   post:
 *     summary: Bulk operations on project forms
 *     description: Perform bulk operations like delete, restore, publish, archive
 *     tags: [ProjectForms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               operations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [delete, restore, publish, archive]
 *                     projectFormId:
 *                       type: string
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
 *                 results:
 *                   type: object
 */

// ── Workflow definitions on a module ─────────────────────────────────────
router.get('/project/:projectId/workflows', auth(), workflowController.getModuleWorkflows);
router.put('/project/:projectId/workflows', auth(), workflowController.updateModuleWorkflows);

module.exports = router;
