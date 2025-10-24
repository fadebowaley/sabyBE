# 🔧 User & Node PATCH Implementation Guide

**Branch:** `user-node-patch`  
**Created:** October 22, 2025

## 📋 Overview

This guide implements the following improvements:

1. ✅ **Partial Updates** - PATCH routes only update fields sent in request
2. ✅ **Profile Integration** - Update userProfile/nodeProfile along with user/node
3. ✅ **Super User Creation** - Create saby@saby.ai with all privileges
4. ✅ **Combined Data Routes** - Return user+userProfile and node+nodeProfile together

## 🎯 Requirements Summary

### 1. PATCH Route Improvements

**Current Issue:** 
- User PATCH updates all fields, even when only some are sent
- UserProfile data sent to user route is not automatically updated in userProfile
- Same issues exist for node and nodeProfile

**Solution:**
- Modify PATCH routes to only update fields present in request body
- Auto-detect and route profile-related fields to appropriate profile tables
- Maintain data consistency between main entity and profile

### 2. Super User Creation

Create a super admin with:
- Email: `saby@saby.ai`
- Password: `@saby_Saby1`
- Privileges: `isSaby`, `isSuper`, `isOwner`

### 3. Combined Data Routes

**New Routes:**
- `GET /v1/users/:userId` - Returns user + userProfile
- `GET /v1/users/:userId/nodes` - Returns nodes + nodeProfiles
- `GET /v1/node/:nodeId` - Returns node + nodeProfile

---

## 📝 Implementation Checklist

### Phase 1: User PATCH Improvements ✅

#### Task 1.1: Update User Service (Partial Updates)

**File:** `sabyBackend/src/services/user.service.js`

- [ ] Modify `updateUserById()` to only update sent fields
- [ ] Add field separation logic (user fields vs profile fields)
- [ ] Auto-update userProfile when profile fields are present
- [ ] Add transaction support for atomic updates

**Current Code Location:** Lines 343-532

**Changes Needed:**
```javascript
// Separate user fields from profile fields
const userFields = ['firstname', 'lastname', 'email', 'phone', ...];
const profileFields = ['dateOfBirth', 'gender', 'address', ...];

// Only update fields that are present in updateBody
// If profile fields exist, also update userProfile
```

#### Task 1.2: Update User Controller

**File:** `sabyBackend/src/controllers/user.controller.js`

- [ ] Ensure updateUser() passes only provided fields
- [ ] Add logging for profile field detection
- [ ] Handle errors for profile updates

**Current Code Location:** Lines 185-213

#### Task 1.3: Update User Validation

**File:** `sabyBackend/src/validations/user.validation.js`

- [ ] Allow optional fields in updateUser validation
- [ ] Add profile field validation
- [ ] Ensure backwards compatibility

### Phase 2: Node PATCH Improvements ✅

#### Task 2.1: Update Node Service (Partial Updates)

**File:** `sabyBackend/src/services/node.service.js`

- [ ] Modify `updateNodeById()` to only update sent fields
- [ ] Add field separation logic (node fields vs profile fields)
- [ ] Auto-update nodeProfile when profile fields are present
- [ ] Add transaction support

**Current Code Location:** Lines 64-92

**Changes Needed:**
```javascript
// Separate node fields from profile fields
const nodeFields = ['name', 'level', 'parent', 'address', ...];
const profileFields = ['dateOfEstablishment', 'propertyStatus', 'estimatedValue', ...];

// Only update fields present in updateBody
// If profile fields exist, also update nodeProfile
```

#### Task 2.2: Update Node Controller

**File:** `sabyBackend/src/controllers/node.controller.js`

- [ ] Ensure updateNodeById() passes only provided fields
- [ ] Add logging for profile field detection
- [ ] Handle errors for profile updates

#### Task 2.3: Update Node Validation

**File:** `sabyBackend/src/validations/node.validation.js`

- [ ] Allow optional fields in updateNodeById validation
- [ ] Add profile field validation

### Phase 3: Super User Creation ✅

#### Task 3.1: Create Super User Script

**File:** `sabyBackend/scripts/create-saby-super-user.js` (NEW)

- [ ] Create new script file
- [ ] Implement user creation with all privileges
- [ ] Add error handling for existing user
- [ ] Add password hashing
- [ ] Generate appropriate tenantId

**Script Requirements:**
```javascript
const user = {
  email: 'saby@saby.ai',
  password: '@saby_Saby1',
  firstname: 'Saby',
  lastname: 'Admin',
  isSaby: true,
  isSuper: true,
  isOwner: true,
  // ... other required fields
};
```

#### Task 3.2: Add Script to package.json

**File:** `sabyBackend/package.json`

- [ ] Add script command: `"create-saby-user": "node scripts/create-saby-super-user.js"`

### Phase 4: Combined Data Routes ✅

#### Task 4.1: Update getUser to Return User + Profile

**File:** `sabyBackend/src/controllers/user.controller.js`

- [ ] Modify `getUser()` to fetch userProfile
- [ ] Combine user and profile data in response
- [ ] Handle case where profile doesn't exist

**Current Code Location:** Lines 177-183

**Changes Needed:**
```javascript
const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  
  // Fetch user profile
  const profile = await userProfileService.getUserProfileByUserId(req.params.userId);
  
  // Combine data
  const response = {
    ...user.toObject(),
    profile: profile || null
  };
  
  res.send(response);
});
```

#### Task 4.2: Update getUserNodes to Return Nodes + Profiles

**File:** `sabyBackend/src/controllers/user.controller.js`

- [ ] Modify `getUserNodes()` to fetch nodeProfiles
- [ ] Combine node and profile data for each node
- [ ] Handle nodes without profiles

**Current Code Location:** Lines 235-238

**Changes Needed:**
```javascript
const getUserNodes = catchAsync(async (req, res) => {
  const nodes = await userService.getUserNodes(req.params.userId);
  
  // Fetch profiles for each node
  const nodesWithProfiles = await Promise.all(
    nodes.map(async (node) => {
      const profile = await nodeProfileService.getProfileByNodeId(node._id);
      return {
        ...node.toObject(),
        profile: profile || null
      };
    })
  );
  
  res.send(nodesWithProfiles);
});
```

#### Task 4.3: Update getNodeById to Return Node + Profile

**File:** `sabyBackend/src/controllers/node.controller.js`

- [ ] Modify `getNodeById()` to fetch nodeProfile
- [ ] Combine node and profile data
- [ ] Handle case where profile doesn't exist

#### Task 4.4: Add New Service Methods

**File:** `sabyBackend/src/services/nodeprofile.service.js`

- [ ] Add `getProfileByNodeId()` method if not exists

**File:** `sabyBackend/src/services/userProfile.service.js`

- [ ] Verify `getUserProfileByUserId()` exists

### Phase 5: Testing & Documentation ✅

#### Task 5.1: Create Test Scripts

**Files:** (NEW)
- `sabyBackend/tests/user-patch.test.js`
- `sabyBackend/tests/node-patch.test.js`
- `sabyBackend/tests/combined-routes.test.js`

- [ ] Test partial updates for user
- [ ] Test partial updates for node
- [ ] Test profile auto-update
- [ ] Test combined data routes
- [ ] Test super user creation

#### Task 5.2: Update API Documentation

**Files:**
- `sabyBackend/src/routes/v1/user.route.js`
- `sabyBackend/src/routes/v1/node.route.js`

- [ ] Update Swagger documentation for PATCH routes
- [ ] Document new combined response formats
- [ ] Add examples for partial updates

---

## 🔨 Detailed Implementation Steps

### STEP 1: Backup Current Code

```bash
cd /Users/fadebowaley/saby/sabyBackend
git status
git add .
git commit -m "checkpoint: before user-node-patch implementation"
```

### STEP 2: Implement User Service Changes

**File:** `src/services/user.service.js`

**Modify `updateUserById` function:**

```javascript
const updateUserById = async (userId, updateBody, currentUser = null) => {
  console.log(`🔄 [UserService.updateUserById] Updating user ${userId}...`);
  
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Separate user fields from profile fields
  const userFields = [
    'firstname', 'lastname', 'email', 'phone', 'password',
    'isSaby', 'isSuper', 'isOwner', 'isActive', 'roles'
  ];
  
  const profileFields = [
    'dateOfBirth', 'gender', 'address', 'bio', 'avatar',
    'phoneNumber', 'alternateEmail', 'emergencyContact'
  ];

  // Extract user-specific fields
  const userUpdate = {};
  const profileUpdate = {};
  
  Object.keys(updateBody).forEach((key) => {
    if (userFields.includes(key)) {
      userUpdate[key] = updateBody[key];
    } else if (profileFields.includes(key)) {
      profileUpdate[key] = updateBody[key];
    }
  });

  // Privilege validation (existing code...)
  // ... keep existing privilege validation logic ...

  // Update user fields (only those present)
  Object.keys(userUpdate).forEach((key) => {
    user[key] = userUpdate[key];
  });

  // Save user
  await user.save();

  // Update profile if profile fields exist
  if (Object.keys(profileUpdate).length > 0) {
    console.log('📝 [UserService.updateUserById] Updating user profile...');
    await userProfileService.upsertUserProfile(userId, profileUpdate);
  }

  return user;
};
```

### STEP 3: Implement Node Service Changes

**File:** `src/services/node.service.js`

**Modify `updateNodeById` function:**

```javascript
const updateNodeById = async (nodeId, updateBody) => {
  const node = await getNodeById(nodeId);

  // Separate node fields from profile fields
  const nodeFields = [
    'level', 'parent', 'name', 'address', 'city', 'state',
    'country', 'postalCode', 'isMain', 'users', 'isActive'
  ];

  const profileFields = [
    'dateOfEstablishment', 'propertyStatus', 'estimatedValue',
    'buildingType', 'status'
  ];

  // Extract node-specific fields
  const nodeUpdate = {};
  const profileUpdate = {};

  Object.keys(updateBody).forEach((key) => {
    if (nodeFields.includes(key)) {
      nodeUpdate[key] = updateBody[key];
    } else if (profileFields.includes(key)) {
      profileUpdate[key] = updateBody[key];
    }
  });

  // Update node fields (only those present)
  Object.keys(nodeUpdate).forEach((key) => {
    node[key] = nodeUpdate[key];
  });

  await node.save();

  // Update profile if profile fields exist
  if (Object.keys(profileUpdate).length > 0) {
    console.log('📝 [NodeService.updateNodeById] Updating node profile...');
    const ChurchProfile = require('../models/nodeprofile');
    await ChurchProfile.findOneAndUpdate(
      { church: nodeId },
      profileUpdate,
      { upsert: true, new: true }
    );
  }

  return node;
};
```

### STEP 4: Create Super User Script

**File:** `scripts/create-saby-super-user.js` (NEW)

```javascript
const mongoose = require('mongoose');
const config = require('../src/config/config');
const User = require('../src/models/user.model');
const bcrypt = require('bcryptjs');

async function createSabySuperUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Check if user already exists
    const existingUser = await User.findOne({ email: 'saby@saby.ai' });
    if (existingUser) {
      console.log('⚠️  User saby@saby.ai already exists!');
      console.log('User ID:', existingUser._id);
      process.exit(0);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash('@saby_Saby1', 8);

    // Create user
    const user = await User.create({
      email: 'saby@saby.ai',
      password: hashedPassword,
      firstname: 'Saby',
      lastname: 'Admin',
      isSaby: true,
      isSuper: true,
      isOwner: true,
      isActive: true,
      isEmailVerified: true,
      tenantId: 'saby-tenant-001', // Special tenant for Saby
    });

    console.log('✅ Saby super user created successfully!');
    console.log('📧 Email:', user.email);
    console.log('🆔 User ID:', user._id);
    console.log('🔑 Privileges:', {
      isSaby: user.isSaby,
      isSuper: user.isSuper,
      isOwner: user.isOwner,
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating super user:', error);
    process.exit(1);
  }
}

createSabySuperUser();
```

### STEP 5: Update User Controller for Combined Data

**File:** `src/controllers/user.controller.js`

**Modify `getUser` function:**

```javascript
const getUser = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  // Fetch user profile
  const { userProfileService } = require('../services');
  const profile = await userProfileService.getUserProfileByUserId(req.params.userId);

  // Combine data
  const response = {
    ...user.toObject(),
    profile: profile ? profile.toObject() : null,
  };

  res.send(response);
});
```

**Modify `getUserNodes` function:**

```javascript
const getUserNodes = catchAsync(async (req, res) => {
  const nodes = await userService.getUserNodes(req.params.userId);
  
  // Fetch profiles for each node
  const ChurchProfile = require('../models/nodeprofile');
  const nodesWithProfiles = await Promise.all(
    nodes.map(async (node) => {
      const profile = await ChurchProfile.findOne({ church: node._id });
      return {
        ...node.toObject(),
        profile: profile ? profile.toObject() : null,
      };
    })
  );

  res.send(nodesWithProfiles);
});
```

### STEP 6: Update Node Controller for Combined Data

**File:** `src/controllers/node.controller.js`

**Modify `getNodeById` function:**

```javascript
const getNodeById = catchAsync(async (req, res) => {
  console.log('[NODE CONTROLLER - GET] Node ID:', req.params.nodeId);
  
  const node = await nodeService.getNodeById(req.params.nodeId);
  
  // Fetch node profile
  const ChurchProfile = require('../models/nodeprofile');
  const profile = await ChurchProfile.findOne({ church: req.params.nodeId });

  // Combine data
  const response = {
    ...node.toObject(),
    profile: profile ? profile.toObject() : null,
  };

  res.send(response);
});
```

---

## 🧪 Testing Guide

### Test 1: Partial User Update

```bash
# Update only firstname (other fields should remain unchanged)
curl -X PATCH http://localhost:3000/v1/users/:userId \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstname": "NewName"
  }'
```

**Expected:** Only firstname changes, all other fields remain the same.

### Test 2: User + Profile Update

```bash
# Update user field and profile field together
curl -X PATCH http://localhost:3000/v1/users/:userId \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstname": "John",
    "dateOfBirth": "1990-01-01",
    "address": "123 Main St"
  }'
```

**Expected:** 
- User firstname updated
- UserProfile dateOfBirth and address updated

### Test 3: Get User with Profile

```bash
curl -X GET http://localhost:3000/v1/users/:userId \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected Response:**
```json
{
  "_id": "...",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john@example.com",
  "profile": {
    "dateOfBirth": "1990-01-01",
    "address": "123 Main St",
    "gender": "Male"
  }
}
```

### Test 4: Get User Nodes with Profiles

```bash
curl -X GET http://localhost:3000/v1/users/:userId/nodes \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected Response:**
```json
[
  {
    "_id": "...",
    "name": "Church Name",
    "level": "...",
    "profile": {
      "dateOfEstablishment": "2020-01-01",
      "propertyStatus": "Owned",
      "estimatedValue": 500000
    }
  }
]
```

### Test 5: Create Super User

```bash
cd sabyBackend
npm run create-saby-user
```

**Expected Output:**
```
✅ Saby super user created successfully!
📧 Email: saby@saby.ai
🆔 User ID: ...
🔑 Privileges: { isSaby: true, isSuper: true, isOwner: true }
```

**Then test login:**
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "saby@saby.ai",
    "password": "@saby_Saby1"
  }'
```

---

## 📊 Progress Tracker

### Phase 1: User PATCH Improvements
- [ ] Update user.service.js
- [ ] Update user.controller.js  
- [ ] Update user.validation.js
- [ ] Test partial updates
- [ ] Test profile auto-update

### Phase 2: Node PATCH Improvements
- [ ] Update node.service.js
- [ ] Update node.controller.js
- [ ] Update node.validation.js
- [ ] Test partial updates
- [ ] Test profile auto-update

### Phase 3: Super User Creation
- [ ] Create script file
- [ ] Add to package.json
- [ ] Test user creation
- [ ] Test login

### Phase 4: Combined Data Routes
- [ ] Update getUser
- [ ] Update getUserNodes
- [ ] Update getNodeById
- [ ] Test combined responses

### Phase 5: Testing & Documentation
- [ ] Write test scripts
- [ ] Update Swagger docs
- [ ] Test all endpoints
- [ ] Document changes

---

## 🚀 Deployment Checklist

- [ ] All tests passing locally
- [ ] Code reviewed
- [ ] Documentation updated
- [ ] Super user created on staging
- [ ] Super user created on production
- [ ] Migration plan documented
- [ ] Rollback plan documented

---

## 📝 Notes

### Field Separation

**User Fields:**
- `firstname`, `lastname`, `email`, `phone`, `password`
- `isSaby`, `isSuper`, `isOwner`, `isActive`, `roles`

**UserProfile Fields:**
- `dateOfBirth`, `gender`, `address`, `bio`, `avatar`
- `phoneNumber`, `alternateEmail`, `emergencyContact`

**Node Fields:**
- `level`, `parent`, `name`, `address`, `city`, `state`
- `country`, `postalCode`, `isMain`, `users`, `isActive`

**NodeProfile Fields:**
- `dateOfEstablishment`, `propertyStatus`, `estimatedValue`
- `buildingType`, `status`

### Important Considerations

1. **Backwards Compatibility:** Ensure existing API clients continue to work
2. **Transaction Support:** Consider using MongoDB transactions for atomic updates
3. **Error Handling:** Profile updates should not fail the main update
4. **Logging:** Add comprehensive logging for debugging
5. **Performance:** Optimize database queries to avoid N+1 problems

---

**Implementation Start Date:** October 22, 2025  
**Estimated Completion:** TBD  
**Assigned To:** Backend Team


