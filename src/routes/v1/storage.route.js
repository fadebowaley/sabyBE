const express = require('express');
const multer = require('multer');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const storageValidation = require('../../validations/storage.validation');
const storageController = require('../../controllers/storage.controller');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
    files: 10, // Max 10 files per upload
  },
  fileFilter: (req, file, cb) => {
    // Block dangerous file types
    const blockedExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif'];
    const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (blockedExtensions.includes(fileExtension)) {
      return cb(new Error('File type not allowed'), false);
    }
    
    cb(null, true);
  },
});

/**
 * @swagger
 * tags:
 *   name: Storage
 *   description: Cloud storage management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     StorageFile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         fileId:
 *           type: string
 *         originalName:
 *           type: string
 *         fileName:
 *           type: string
 *         fileSize:
 *           type: number
 *         mimeType:
 *           type: string
 *         fileExtension:
 *           type: string
 *         storageUrl:
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

// File operations
router.post('/upload', 
  auth('create:storage:file'), 
  upload.single('file'),
  validate(storageValidation.uploadFile),
  storageController.uploadFile
);

/**
 * @swagger
 * /storage/upload:
 *   post:
 *     summary: Upload a single file
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               folderId:
 *                 type: string
 *     responses:
 *       201:
 *         description: File uploaded successfully
 *       400:
 *         description: Bad request
 *       413:
 *         description: File too large
 */

router.post('/upload-multiple',
  auth('create:storage:file'),
  upload.array('files', 10),
  validate(storageValidation.uploadMultipleFiles),
  storageController.uploadMultipleFiles
);

router.get('/',
  auth('view:storage:file'),
  validate(storageValidation.getFiles),
  storageController.getFiles
);

router.get('/search',
  auth('view:storage:file'),
  validate(storageValidation.searchFiles),
  storageController.searchFiles
);

router.get('/stats',
  auth('view:storage:stats'),
  storageController.getStorageStats
);

router.get('/:fileId',
  auth('view:storage:file'),
  validate(storageValidation.getFile),
  storageController.getFile
);

router.delete('/:fileId',
  auth('delete:storage:file'),
  validate(storageValidation.deleteFile),
  storageController.deleteFile
);

router.post('/:fileId/share',
  auth('share:storage:file'),
  validate(storageValidation.shareFile),
  storageController.shareFile
);

router.post('/:fileId/move',
  auth('update:storage:file'),
  validate(storageValidation.moveFile),
  storageController.moveFile
);

router.post('/:fileId/copy',
  auth('create:storage:file'),
  validate(storageValidation.copyFile),
  storageController.copyFile
);

// Public shared file access (no auth required)
router.get('/shared/:shareToken',
  validate(storageValidation.getSharedFile),
  storageController.getSharedFile
);

router.get('/shared/:shareToken/download',
  validate(storageValidation.downloadSharedFile),
  storageController.downloadSharedFile
);

module.exports = router;