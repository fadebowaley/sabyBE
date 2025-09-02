const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { StorageSettings } = require('../models');

/**
 * Middleware to check storage quota before file operations
 */
const checkStorageQuota = (operation = 'upload') => {
  return async (req, res, next) => {
    try {
      const { tenantId } = req.user;
      
      // Get storage settings for tenant
      const settings = await StorageSettings.findOne({ tenantId });
      
      if (!settings) {
        // Create default settings if none exist
        await StorageSettings.create({
          tenantId,
          userId: req.user._id,
        });
        return next();
      }
      
      const { totalQuota, usedStorage } = settings.storageQuota;
      
      if (operation === 'upload') {
        let uploadSize = 0;
        
        // Calculate upload size
        if (req.file) {
          uploadSize = req.file.size;
        } else if (req.files && req.files.length > 0) {
          uploadSize = req.files.reduce((total, file) => total + file.size, 0);
        }
        
        // Check if upload would exceed quota
        if (usedStorage + uploadSize > totalQuota) {
          const remainingSpace = totalQuota - usedStorage;
          throw new ApiError(
            httpStatus.INSUFFICIENT_STORAGE,
            `Storage quota exceeded. Available space: ${Math.max(0, remainingSpace)} bytes`
          );
        }
        
        // Check file count limits
        const maxFiles = settings.userLimits?.maxFilesPerUpload || 10;
        if (req.files && req.files.length > maxFiles) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Cannot upload more than ${maxFiles} files at once`
          );
        }
        
        // Check individual file size limits
        const maxFileSize = settings.userLimits?.maxFileSize || 100 * 1024 * 1024; // 100MB
        const oversizedFiles = [];
        
        if (req.file && req.file.size > maxFileSize) {
          oversizedFiles.push(req.file.originalname);
        }
        
        if (req.files) {
          req.files.forEach(file => {
            if (file.size > maxFileSize) {
              oversizedFiles.push(file.originalname);
            }
          });
        }
        
        if (oversizedFiles.length > 0) {
          throw new ApiError(
            httpStatus.PAYLOAD_TOO_LARGE,
            `Files exceed size limit (${maxFileSize} bytes): ${oversizedFiles.join(', ')}`
          );
        }
      }
      
      // Add settings to request for use in controllers
      req.storageSettings = settings;
      next();
      
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to check file type restrictions
 */
const checkFileTypes = () => {
  return async (req, res, next) => {
    try {
      const settings = req.storageSettings;
      
      if (!settings) {
        return next();
      }
      
      const { allowedFileTypes = ['*'], blockedFileTypes = [] } = settings.userLimits;
      
      const checkFileType = (file) => {
        const fileExtension = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
        const mimeType = file.mimetype.toLowerCase();
        
        // Check blocked types first
        if (blockedFileTypes.includes(fileExtension) || blockedFileTypes.includes(mimeType)) {
          return { allowed: false, reason: 'File type is blocked' };
        }
        
        // If allowed types is '*', allow all (except blocked)
        if (allowedFileTypes.includes('*')) {
          return { allowed: true };
        }
        
        // Check if file type is in allowed list
        const isAllowed = allowedFileTypes.some(type => 
          type === fileExtension || 
          type === mimeType || 
          mimeType.startsWith(type.replace('*', ''))
        );
        
        return { 
          allowed: isAllowed, 
          reason: isAllowed ? null : 'File type not allowed' 
        };
      };
      
      const rejectedFiles = [];
      
      // Check single file
      if (req.file) {
        const check = checkFileType(req.file);
        if (!check.allowed) {
          rejectedFiles.push(`${req.file.originalname}: ${check.reason}`);
        }
      }
      
      // Check multiple files
      if (req.files) {
        req.files.forEach(file => {
          const check = checkFileType(file);
          if (!check.allowed) {
            rejectedFiles.push(`${file.originalname}: ${check.reason}`);
          }
        });
      }
      
      if (rejectedFiles.length > 0) {
        throw new ApiError(
          httpStatus.UNSUPPORTED_MEDIA_TYPE,
          `File type restrictions: ${rejectedFiles.join(', ')}`
        );
      }
      
      next();
      
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware to send quota warning notifications
 */
const checkQuotaWarning = () => {
  return async (req, res, next) => {
    try {
      const settings = req.storageSettings;
      
      if (!settings || !settings.notifications.emailOnQuotaWarning) {
        return next();
      }
      
      const { totalQuota, usedStorage } = settings.storageQuota;
      const { quotaWarningThreshold } = settings.notifications;
      
      const usagePercentage = (usedStorage / totalQuota) * 100;
      
      if (usagePercentage >= quotaWarningThreshold) {
        // TODO: Send quota warning email
        console.log(`Quota warning: ${usagePercentage.toFixed(1)}% used for tenant ${req.user.tenantId}`);
      }
      
      next();
      
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  checkStorageQuota,
  checkFileTypes,
  checkQuotaWarning,
};