const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { toJSON, paginate, tenantPlugin } = require('./plugins');
const { HaloCounter } = require('./haloCounter.model');

const AVATAR_BASE_URL = 'https://halocrm.s3.us-east-1.amazonaws.com/user';

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
    avatar: {
      type: String,
      default: null,
    },
    status: {
      type: Boolean,
      default: false,
    },
    deletedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
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
  console.log('Creating user with body:', userBody);

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

  userBody.userId = this.generateUserId();
  userBody.tenantId = await this.generateTenantId(
    userBody.isOwner,
    userBody.createdBy
  );
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
  return bcrypt.compare(password, this.password);
};

/**
 * Check if user is an ordinary user (no special privileges)
 * @returns {boolean}
 */
userSchema.methods.isOrdinaryUser = function () {
  return !this.isSaby && !this.isSuper && !this.isOwner;
};

/**
 * Check if user can access web portal
 * @returns {boolean}
 */
userSchema.methods.canAccessWebPortal = function () {
  return this.isSaby || this.isSuper || this.isOwner;
};

/**
 * Get user hierarchy level
 * @returns {number} 1=SabyUser, 2=SuperUser, 3=Owner, 4=OrdinaryUser
 */
userSchema.methods.getHierarchyLevel = function () {
  if (this.isSaby) return 1;
  if (this.isSuper) return 2;
  if (this.isOwner) return 3;
  return 4;
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
