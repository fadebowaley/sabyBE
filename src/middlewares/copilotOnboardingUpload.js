const fs = require('fs');
const os = require('os');
const path = require('path');
const multer = require('multer');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');

const MAX_UPLOAD_MB = Number(process.env.COPILOT_ONBOARDING_MAX_UPLOAD_MB || 50);
const MAX_UPLOAD_BYTES = Math.max(1, MAX_UPLOAD_MB) * 1024 * 1024;

const uploadRoot = path.join(os.tmpdir(), 'saby-onboarding-jobs');
const CSV_SIGNATURE_READ_BYTES = 4096;

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const sanitizeName = (name) =>
  String(name || 'upload.csv')
    .replace(/[^\w.-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 180);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const tenantId = String(req.user?.tenantId || 'unknown');
      const targetDir = path.join(uploadRoot, tenantId);
      ensureDir(targetDir);
      cb(null, targetDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const ts = Date.now();
    const random = Math.random().toString(36).slice(2, 10);
    cb(null, `${ts}_${random}_${sanitizeName(file.originalname)}`);
  },
});

const csvUploadFilter = (req, file, cb) => {
  const name = String(file?.originalname || '').toLowerCase();
  const type = String(file?.mimetype || '').toLowerCase();
  const validExt = name.endsWith('.csv');
  const validMime =
    type.includes('text/csv') ||
    type.includes('application/vnd.ms-excel') ||
    type.includes('text/plain');

  if (!validExt && !validMime) {
    cb(new Error('Only CSV files are allowed'));
    return;
  }

  cb(null, true);
};

const onboardingCsvUpload = multer({
  storage,
  fileFilter: csvUploadFilter,
  limits: {
    files: 1,
    fileSize: MAX_UPLOAD_BYTES,
  },
});

const validateCsvSignature = async (filePath) => {
  const fd = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(CSV_SIGNATURE_READ_BYTES);
    const { bytesRead } = await fd.read(buffer, 0, CSV_SIGNATURE_READ_BYTES, 0);
    const head = buffer.subarray(0, bytesRead);
    if (head.length === 0) {
      throw new Error('Uploaded CSV is empty');
    }

    // Basic binary guard: CSV should not contain NULL bytes.
    if (head.includes(0x00)) {
      throw new Error('Uploaded file is not a valid CSV text file');
    }

    const snippet = head.toString('utf8');
    const hasDelimiter = snippet.includes(',');
    const hasLineBreak = /\r?\n/.test(snippet);
    if (!hasDelimiter || !hasLineBreak) {
      throw new Error('CSV signature check failed (missing delimiter/header row)');
    }
  } finally {
    await fd.close();
  }
};

module.exports = {
  onboardingCsvUpload,
  handleOnboardingCsvUpload: (req, res, next) => {
    onboardingCsvUpload.single('file')(req, res, async (error) => {
      if (!error) {
        try {
          if (req.file?.path) {
            await validateCsvSignature(req.file.path);
          }
          next();
          return;
        } catch (validationError) {
          if (req.file?.path && fs.existsSync(req.file.path)) {
            try {
              await fs.promises.unlink(req.file.path);
            } catch {
              // Best effort cleanup.
            }
          }
          next(
            new ApiError(
              httpStatus.BAD_REQUEST,
              validationError.message || 'Invalid CSV upload'
            )
          );
          return;
        }
      }
      if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
        next(
          new ApiError(
            httpStatus.BAD_REQUEST,
            `CSV exceeds max upload size (${MAX_UPLOAD_MB}MB)`
          )
        );
        return;
      }
      next(
        new ApiError(httpStatus.BAD_REQUEST, error.message || 'Invalid CSV upload')
      );
    });
  },
};
