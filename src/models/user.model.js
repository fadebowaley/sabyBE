const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { toJSON, paginate, tenantPlugin } = require('./plugins');
const { HaloCounter } = require('./haloCounter.model');
const { normalizePhoneToE164 } = require('../utils/phoneNumber');

const AVATAR_BASE_URL = 'https://halocrm.s3.us-east-1.amazonaws.com/user';

const normalizePhoneForPersistence = (value) => {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  const normalized = normalizePhoneToE164(raw, { allowEmpty: false });
  if (!normalized) {
    throw new Error(
      'Invalid phone number format. Use a valid local or international number.'
    );
  }
  return normalized;
};

const userSchema = mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
    },

    haloId: {
      type: String,
      unique: true,
      index: true,
    },

    tenantId: {
      type: String,
      index: true,
    },

    roles: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: [] }],
    isOwner: { type: Boolean, default: false },
    isSuper: { type: Boolean, default: false },
    isAdmin: { type: Boolean, default: false }, // Privileged user - above regular, below Owner
    isSaby: {
      type: Boolean,
      default: false,
    },
    isAgreed: { type: Boolean, default: false },
    firstname: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      validate: {
        validator: validator.isEmail,
        message: 'Invalid email',
      },
    },
    password: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      private: true,
      validate: {
        validator: (value) => /\d/.test(value) && /[a-zA-Z]/.test(value),
        message: 'Password must contain at least one letter and one number',
      },
    },
    otp: {
      type: String,
      default: null,
    },
    otpExpires: {
      type: Date,
      default: null,
    },
    otpVerified: {
      type: Boolean,
      default: false,
    },
    customFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    customFieldsVersion: {
      type: Number,
      default: 0,
    },

    phoneNumber: {
      type: String,
      trim: true,
      default: null,
    },

    isPhoneVerified: {
      type: Boolean,
      default: false,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    onboardingStatus: {
      type: String,
      enum: ['none', 'required', 'in_progress', 'complete'],
      default: 'none',
      index: true,
    },
    onboardingComplete: {
      type: Boolean,
      default: false,
    },
    requiresOnboarding: {
      type: Boolean,
      default: false,
    },
    onboardingCompletedAt: {
      type: Date,
      default: null,
    },
    avatar: {
      type: String,
      default: null,
    },
    status: {
      type: Boolean,
      default: false,
    },
    socialAuth: {
      type: {
        signupProvider: { type: String, default: null },
        lastProvider: { type: String, default: null },
        providers: [{ type: String }],
        lastLoginAt: { type: Date, default: null },
        providerMeta: {
          type: mongoose.Schema.Types.Mixed,
          default: {},
        },
      },
      default: () => ({
        signupProvider: null,
        lastProvider: null,
        providers: [],
        lastLoginAt: null,
        providerMeta: {},
      }),
    },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },

    // Profile Update Compliance Tracking
    profileUpdateCompliant: {
      type: Boolean,
      default: false,
    },
    profileUpdateCompliantAt: {
      type: Date,
      default: null,
    },
    profileUpdateCompliantBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Profile Edit Tracking
    profileLastEditedAt: {
      type: Date,
      default: null,
    },
    profileEditCount: {
      type: Number,
      default: 0,
    },

    // ========== MERGED PROFILE FIELDS FROM USERPROFILE ==========
    /**
     * NOTE: The detailed profile fields below are retained for backward compatibility.
     * Tenants should prefer capturing these attributes via `customFields` configuration.
     * Fields migrated to the custom-field builder:
     * - title, otherName, gender, dateOfBirth
     * - highestQualification, professional, employmentCategory, occupation, employeeId
     * - maritalStatus, spouse.name, spouse.phoneNumber, spouse.dateOfBirth
     * - nextOfKin.name, nextOfKin.phoneNumber, nextOfKin.relationship
     * - stateOfOrigin, lgaOfOrigin, homeTown
     * - residentialAddress, stateOfResidence, lgaOfResidence
     */
    profile: {
      // Personal details
      title: { type: String }, // Mr., Mrs., Dr., etc.
      otherName: { type: String },
      gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
      },
      dateOfBirth: { type: Date },

      // Professional information
      highestQualification: { type: String },
      professional: { type: String },
      employmentCategory: { type: String },
      occupation: { type: String },
      employeeId: { type: String },
      officeTitle: { type: String, trim: true }, // Pastor, HOD, Bishop, Deacon, etc.

      // Marital information
      maritalStatus: {
        type: String,
        enum: ['Single', 'Married', 'Divorced', 'Widowed'],
      },
      spouse: {
        name: { type: String },
        phoneNumber: { type: String },
        dateOfBirth: { type: Date },
      },

      // Next of kin
      nextOfKin: {
        name: { type: String },
        phoneNumber: { type: String },
        relationship: { type: String },
      },

      // Location - Origin
      stateOfOrigin: { type: String },
      lgaOfOrigin: { type: String },
      homeTown: { type: String },

      // Location - Residence
      residentialAddress: { type: String },
      stateOfResidence: { type: String },
      lgaOfResidence: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Add plugins that convert mongoose to JSON and paginate
userSchema.plugin(toJSON);
userSchema.plugin(paginate);
userSchema.plugin(tenantPlugin);

// Create partial index to ensure only one SabyUser exists
userSchema.index(
  { isSaby: 1 },
  {
    unique: true,
    partialFilterExpression: { isSaby: true },
    name: 'unique_saby_user',
  }
);

/** create user body staic ethod */

/**
 * Generate a unique 10-digit userId
 * @returns {string}
 */
userSchema.statics.generateUserId = function () {
  return nanoid(10);
};

/**
 * Generate a unique Base36 incremental haloId prefixed with 'HL-'
 * Example: HL-00001, HL-00002, ..., HL-ZZZZZ
 * @returns {Promise<string>}
 */
userSchema.statics.generateHaloId = async function () {
  const counter = await HaloCounter.findOneAndUpdate(
    { name: 'halo' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const base36 = counter.seq.toString(36).toUpperCase().padStart(5, '0');
  return `HL-${base36}`;
};

/**
 * Generate a tenantId based on ownership
 * If user is an owner, generate a new tenantId.
 * If user is not an owner, get the tenantId of the creator.
 * @param {boolean} isOwner - Whether the user is an owner
 * @param {ObjectId} createdBy - The ID of the user who created this user
 * @returns {Promise<string>}
 */
userSchema.statics.generateTenantId = async function (isOwner, createdBy) {
  if (isOwner) {
    return nanoid(10);
  }
  if (!createdBy) {
    throw new Error('Non-owners must have a creator (createdBy field)');
  }
  const creator = await this.findById(createdBy);
  if (!creator) {
    throw new Error('Creator not found');
  }
  return creator.tenantId;
};

/**
 * Check if email is taken
 * @param {string} email - The user's email
 * @param {ObjectId} [excludeUserId] - The id of the user to be excluded
 * @returns {Promise<boolean>}
 */
userSchema.statics.isEmailTaken = async function (email, excludeUserId) {
  const user = await this.findOne({ email, _id: { $ne: excludeUserId } });
  return !!user;
};

/**
 * Create a user
 * @param {Object} userBody - The user data
 * @returns {Promise<User>}
 */

/**
 * Create a new user
 * - Generates a unique userId for the user
 * - Generates a tenantId based on whether the user is an owner or not
 * - Enforces user hierarchy rules
 * - Saves the user to the database
 * @param {Object} userBody - The user data
 * @returns {Promise<User>}
 */

userSchema.statics.createUser = async function (userBody) {
  console.log('Creating user with body:', {
    ...userBody,
    password: userBody?.password ? '[REDACTED]' : undefined,
  });
  if (
    Object.prototype.hasOwnProperty.call(userBody, 'phone') &&
    !Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')
  ) {
    userBody.phoneNumber = userBody.phone;
  }
  if (Object.prototype.hasOwnProperty.call(userBody, 'phone')) {
    delete userBody.phone;
  }

  // Enforce SabyUser uniqueness
  if (userBody.isSaby) {
    const existingSabyUser = await this.findOne({ isSaby: true });
    if (existingSabyUser) {
      throw new Error('Only one SabyUser can exist in the system');
    }
  }

  // Public signup automatically becomes SuperUser and Owner
  if (!userBody.createdBy && !userBody.isSaby) {
    userBody.isOwner = true;
    userBody.isSuper = true;
    console.log('Public signup: Auto-assigned isOwner=true, isSuper=true');
  }

  const canConfigureTenant = Boolean(
    userBody.isOwner || userBody.isSuper || userBody.isSaby
  );
  if (!Object.prototype.hasOwnProperty.call(userBody, 'onboardingStatus')) {
    userBody.onboardingStatus = canConfigureTenant ? 'required' : 'none';
  }
  if (!Object.prototype.hasOwnProperty.call(userBody, 'onboardingComplete')) {
    userBody.onboardingComplete = !canConfigureTenant;
  }
  if (!Object.prototype.hasOwnProperty.call(userBody, 'requiresOnboarding')) {
    userBody.requiresOnboarding = canConfigureTenant;
  }
  if (!Object.prototype.hasOwnProperty.call(userBody, 'onboardingCompletedAt')) {
    userBody.onboardingCompletedAt = canConfigureTenant ? null : new Date();
  }

  userBody.userId = this.generateUserId();
  userBody.tenantId = await this.generateTenantId(
    userBody.isOwner,
    userBody.createdBy
  );
  if (Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')) {
    userBody.phoneNumber = normalizePhoneForPersistence(userBody.phoneNumber);
  }
  const user = new this(userBody);
  await user.save();
  return user;
};

/**
 * Check if password matches the user's password
 * @param {string} password
 * @returns {Promise<boolean>}
 */

userSchema.methods.isPasswordMatch = async function (password) {
  // Some imported/legacy user records may not have a password hash set.
  // Treat as a non-match rather than throwing (bcrypt requires strings).
  if (!this.password) return false;
  return bcrypt.compare(password, this.password);
};

/**
 * Check if user is an ordinary user (no special privileges)
 * @returns {boolean}
 */
userSchema.methods.isOrdinaryUser = function () {
  return !this.isSaby && !this.isSuper && !this.isOwner && !this.isAdmin;
};

/**
 * Check if user can access web portal
 * @returns {boolean}
 */
userSchema.methods.canAccessWebPortal = function () {
  return this.isSaby || this.isSuper || this.isOwner || this.isAdmin;
};

/**
 * Get user hierarchy level
 * @returns {number} 1=SabyUser, 2=SuperUser, 3=Owner, 4=Admin, 5=OrdinaryUser
 */
userSchema.methods.getHierarchyLevel = function () {
  if (this.isSaby) return 1;
  if (this.isSuper) return 2;
  if (this.isOwner) return 3;
  if (this.isAdmin) return 4;
  return 5;
};

userSchema.pre('save', async function (next) {
  if (!this.haloId) {
    this.haloId = await this.constructor.generateHaloId();
  }

  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 8);
  }

  // Add avatar only if not already set
  if (!this.avatar) {
    const randomNum = Math.floor(Math.random() * 15) + 1; // 1 to 15
    const paddedNum = String(randomNum).padStart(2, '0'); // e.g., 01, 02, ...
    this.avatar = `${AVATAR_BASE_URL}/avatar-${paddedNum}.webp`;
  }
  next();
});

// Post-save hook for baseline intelligence updates
userSchema.post('save', async function(doc) {
  try {
    // Only trigger baseline updates for meaningful changes
    const relevantFields = [
      'status', 'profile', 'roles', 'isEmailVerified', 'isPhoneVerified',
      'isOwner', 'isSuper', 'isAdmin', 'isSaby', 'customFields'
    ];
    
    const hasRelevantChanges = this.isNew || relevantFields.some(field => this.isModified(field));
    
    if (hasRelevantChanges) {
      // Import here to avoid circular dependency
      const { baselineIntelligenceService } = require('../services');
      const { batchChangeProcessor } = require('../services');
      
      // Handle baseline updates asynchronously to avoid blocking user operations
      setImmediate(async () => {
        try {
          // Check if this is part of a bulk operation (e.g., CSV import)
          const isBulkOperation = process.env.BULK_OPERATION === 'true' || this.isBulkOperation;
          
          if (isBulkOperation && batchChangeProcessor) {
            // Use batch processing for bulk operations
            await batchChangeProcessor.addUserChange(doc);
          } else {
            // Use immediate processing for single changes
            await baselineIntelligenceService.handleUserChange(doc);
          }
        } catch (error) {
          const logger = require('../config/logger');
          logger.error(
            'Error updating baseline intelligence after user change:',
            {
              userId: doc._id,
              tenantId: doc.tenantId,
              error: error.message,
              stack: error.stack,
            }
          );
        }
      });
    }
  } catch (error) {
    console.error('Error in user post-save hook:', error);
  }
});

// Post-remove hook for baseline intelligence updates
userSchema.post('remove', async function(doc) {
  try {
    const { baselineIntelligenceService } = require('../services');
    
    setImmediate(async () => {
      try {
        await baselineIntelligenceService.handleUserChange(doc);
      } catch (error) {
        console.error('Error updating baseline intelligence after user removal:', error);
      }
    });
  } catch (error) {
    console.error('Error in user post-remove hook:', error);
  }
});

// Saving user password
userSchema.statics.resetPassword = async function (userId, newPassword) {
  const user = await this.findById(userId); // Fetch the user by ID
  if (!user) {
    throw new Error('User not found');
  }
  user.password = newPassword; // Assign the new plain-text password
  // Save the user, but skip validations for all other fields
  await user.save({ validateBeforeSave: false });
};

userSchema.statics.createBulk = async function (
  usersBody,
  createdBy,
  tenantId
) {
  const success = [];
  const errors = [];
  if (!createdBy || !mongoose.Types.ObjectId.isValid(createdBy)) {
    throw new Error('A valid creator ID (createdBy) must be provided');
  }

  // Import Role model
  const Role = mongoose.model('Role');

  for (const userBody of usersBody) {
    try {
      if (await this.isEmailTaken(userBody.email)) {
        errors.push({
          email: userBody.email,
          error: 'Email is already registered',
        });
        continue;
      }

      // Enforce hierarchy rules for bulk creation
      if (userBody.isSaby) {
        const existingSabyUser = await this.findOne({ isSaby: true });
        if (existingSabyUser) {
          errors.push({
            email: userBody.email,
            error: 'Only one SabyUser can exist in the system',
          });
          continue;
        }
      }

      // SuperUser-created users cannot be SuperUser or SabyUser
      if (userBody.isSuper || userBody.isSaby) {
        userBody.isSuper = false;
        userBody.isSaby = false;
        console.log(
          `Bulk creation: Removed super privileges for ${userBody.email}`
        );
      }

      // Handle status conversion (string to boolean)
      if (typeof userBody.status === 'string') {
        userBody.status =
          userBody.status.toLowerCase() === 'true' ||
          userBody.status.toLowerCase() === 'active';
      }

      // Handle phoneNumber: normalize from 'phone' field if present
      if (userBody.phone && !userBody.phoneNumber) {
        userBody.phoneNumber = userBody.phone;
        delete userBody.phone;
      }
      if (Object.prototype.hasOwnProperty.call(userBody, 'phoneNumber')) {
        userBody.phoneNumber = normalizePhoneForPersistence(userBody.phoneNumber);
      }

      // Handle roles: convert role names to ObjectIds
      if (userBody.roles) {
        let roleIds = [];
        
        // Normalize roles to array
        let roleInput = userBody.roles;
        if (typeof roleInput === 'string') {
          // Handle comma-separated string
          roleInput = roleInput.split(',').map((r) => r.trim()).filter((r) => r);
        }
        if (!Array.isArray(roleInput)) {
          roleInput = [roleInput];
        }

        // Process each role
        for (const roleItem of roleInput) {
          if (!roleItem) continue;

          // Check if it's already an ObjectId
          if (mongoose.Types.ObjectId.isValid(roleItem)) {
            // Verify the role exists
            const role = await Role.findOne({
              _id: roleItem,
              tenantId: tenantId,
            });
            if (role) {
              roleIds.push(roleItem);
            } else {
              console.warn(
                `Role ID ${roleItem} not found for tenant ${tenantId}, skipping...`
              );
            }
          } else {
            // It's a role name, find by name (case-insensitive)
            // Use regex for case-insensitive matching
            const role = await Role.findOne({
              name: { $regex: new RegExp(`^${roleItem.trim()}$`, 'i') },
              tenantId: tenantId,
            });
            if (role) {
              roleIds.push(role._id);
            } else {
              console.warn(
                `Role "${roleItem}" not found for tenant ${tenantId}, skipping...`
              );
            }
          }
        }

        userBody.roles = roleIds;
      } else {
        userBody.roles = [];
      }

      userBody.userId = this.generateUserId();
      userBody.tenantId = tenantId;
      userBody.createdBy = createdBy;

      const user = new this(userBody);
      await user.save();
      success.push({
        userId: user.userId,
        email: user.email,
        message: 'User created successfully',
      });
    } catch (error) {
      errors.push({
        email: userBody.email,
        error: error.message,
      });
    }
  }

  const summary = {
    total: usersBody.length,
    created: success.length,
    failed: errors.length,
  };
  return { success, errors, summary };
};

const User = mongoose.model('User', userSchema);
module.exports = User;
