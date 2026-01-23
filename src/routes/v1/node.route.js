const express = require('express');
const auth = require('../../middlewares/auth');
const { hybridAuth } = require('../../middlewares/apiKeyAuth');
const requireAccess = require('../../middlewares/requireAccess');
const validate = require('../../middlewares/validate');
const nodeValidation = require('../../validations/node.validation');
const nodeController = require('../../controllers/node.controller');

const router = express.Router();

// Route for creating a new node
// Test route: Using hybridAuth + requireAccess pattern for optimized API key handling
router
  .route('/')
  .post(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('node:create'), // Uses req.apiKey if set, skips duplicate verification
    validate(nodeValidation.createNode),
    nodeController.createNode
  )
  .get(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('node:read'), // Uses req.apiKey if set, skips duplicate verification
    validate(nodeValidation.queryNodes),
    nodeController.queryNodes
  );

router
  .route('/branches')
  .post(
    auth('node:read'),
    validate(nodeValidation.getNodeBranches),
    nodeController.getNodeBranches
  );

// Route for bulk importing nodes
router
  .route('/bulk-import')
  .post(
    auth('node:import'),
    validate(nodeValidation.bulkImportNodes),
    nodeController.bulkImportNodes
  );

// Route for fetching, updating, and deleting a node by ID
// Test route: Using hybridAuth + requireAccess pattern for optimized API key handling
router
  .route('/:nodeId')
  .get(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('node:read'), // Uses req.apiKey if set, skips duplicate verification
    validate(nodeValidation.getNodeById),
    nodeController.getNodeById
  )
  .patch(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('node:update'), // Uses req.apiKey if set, skips duplicate verification
    validate(nodeValidation.updateNodeById),
    nodeController.updateNodeById
  )
  .delete(
    hybridAuth(), // Authenticates (JWT or API key)
    requireAccess('node:delete'), // Uses req.apiKey if set, skips duplicate verification
    validate(nodeValidation.deleteNodeById),
    nodeController.deleteNodeById
  );

router
  .route('/:nodeId/branch')
  .get(
    auth('node:read'),
    validate(nodeValidation.getNodeById),
    nodeController.getNodeBranch
  );

router
  .route('/:nodeId/restore')
  .patch(
    auth('node:update'),
    validate(nodeValidation.restoreNodeById),
    nodeController.restoreNodeById
  );

router
  .route('/:nodeId/hard')
  .delete(
    auth('node:delete'),
    validate(nodeValidation.hardDeleteNodeById),
    nodeController.deleteNodeHardById
  );

// Route for fetching nodes by type (e.g., main, owner)
router
  .route('/type')
  .get(
    auth('node:read'),
    validate(nodeValidation.getNodesByType),
    nodeController.getNodesByType
  );

// Routes for fetching parent and child nodes
router
  .route('/:nodeId/parent')
  .get(
    auth('node:read'),
    validate(nodeValidation.getParentNode),
    nodeController.getParentNode
  );

router
  .route('/:nodeId/children')
  .get(
    auth('node:read'),
    validate(nodeValidation.getChildNodes),
    nodeController.getChildNodes
  );

// Route for moving a node to a parent node
router
  .route('/:nodeId/move')
  .patch(
    auth('node:move'),
    validate(nodeValidation.moveNodeToParent),
    nodeController.moveNodeToParent
  );

// Route for fetching the node path (parent hierarchy)
router
  .route('/:nodeId/path')
  .get(
    auth('node:read'),
    validate(nodeValidation.getNodePath),
    nodeController.getNodePath
  );

// Routes for activating and deactivating nodes
router
  .route('/:nodeId/activate')
  .patch(
    auth('node:activate'),
    validate(nodeValidation.activateNode),
    nodeController.activateNode
  );

router
  .route('/:nodeId/deactivate')
  .patch(
    auth('node:deactivate'),
    validate(nodeValidation.deactivateNode),
    nodeController.deactivateNode
  );

// Route for assigning users to a node
router
  .route('/:nodeId/assign-users')
  .patch(
    auth('node:update'),
    validate(nodeValidation.assignUsersToNode),
    nodeController.assignUsersToNode
  );

// Route for updating profile compliance
router
  .route('/:nodeId/profile-compliance')
  .patch(
    auth('node:update'),
    validate(nodeValidation.updateProfileCompliance),
    nodeController.updateProfileCompliance
  );

module.exports = router;
