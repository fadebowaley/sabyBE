const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const storageFolderValidation = require('../../validations/storageFolder.validation');
const storageFolderController = require('../../controllers/storageFolder.controller');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Storage Folders
 *   description: Folder management for cloud storage
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     StorageFolder:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         folderId:
 *           type: string
 *         name:
 *           type: string
 *         parentFolder:
 *           type: string
 *         path:
 *           type: string
 *         isPublic:
 *           type: boolean
 *         shareSettings:
 *           type: object
 *         metadata:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 */

// Folder operations
router.post('/',
  auth('create:storage:folder'),
  validate(storageFolderValidation.createFolder),
  storageFolderController.createFolder
);

/**
 * @swagger
 * /storage/folders:
 *   post:
 *     summary: Create a new folder
 *     tags: [Storage Folders]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               parentFolder:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Folder created successfully
 *       400:
 *         description: Bad request
 *       409:
 *         description: Folder already exists
 */

router.get('/',
  auth('view:storage:folder'),
  // validate(storageFolderValidation.getFolders),
  storageFolderController.getFolders
);

router.get('/root',
  auth('view:storage:folder'),
  storageFolderController.getRootFolders
);

router.get('/:folderId',
  auth('view:storage:folder'),
  validate(storageFolderValidation.getFolder),
  storageFolderController.getFolder
);

router.get('/:folderId/contents',
  auth('view:storage:folder'),
  validate(storageFolderValidation.getFolderContents),
  storageFolderController.getFolderContents
);

router.get('/:folderId/hierarchy',
  auth('view:storage:folder'),
  validate(storageFolderValidation.getFolderHierarchy),
  storageFolderController.getFolderHierarchy
);

router.patch('/:folderId',
  auth('update:storage:folder'),
  validate(storageFolderValidation.updateFolder),
  storageFolderController.updateFolder
);

router.delete('/:folderId',
  auth('delete:storage:folder'),
  validate(storageFolderValidation.deleteFolder),
  storageFolderController.deleteFolder
);

router.post('/:folderId/move',
  auth('update:storage:folder'),
  validate(storageFolderValidation.moveFolder),
  storageFolderController.moveFolder
);

router.post('/:folderId/share',
  auth('share:storage:folder'),
  validate(storageFolderValidation.shareFolder),
  storageFolderController.shareFolder
);

// Public shared folder access (no auth required)
router.get('/shared/:shareToken',
  validate(storageFolderValidation.getSharedFolder),
  storageFolderController.getSharedFolder
);

module.exports = router;