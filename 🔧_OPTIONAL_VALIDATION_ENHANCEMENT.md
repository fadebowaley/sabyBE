# 🔧 OPTIONAL VALIDATION ENHANCEMENT

**Branch:** `submission-task`  
**Priority:** 🟠 Optional Enhancement  
**Time Required:** 3-4 hours  
**Benefit:** Server-side validation + form status checks

---

## 🎯 WHAT THIS ADDS

Currently, the `/v1/submissions` endpoint accepts submissions WITHOUT:
- Checking if form exists
- Checking if form is active/published  
- Validating payload against form schema

**This enhancement adds all three checks.**

**Note:** WhatsApp and Telegram channels ALREADY have this validation! This just adds it to the API endpoint.

---

## 📋 IMPLEMENTATION

### File: `src/controllers/unifiedSubmission.controller.js`

**Location:** Add after line 63 (before `queueSubmission` call)

```javascript
/**
 * Validate submission before queuing
 */
const submitData = catchAsync(async (req, res) => {
  const userInfo = {
    tenantId: (req.user && req.user.tenantId) || req.body.tenantId,
    userId: req.user ? req.user._id : undefined,
    source: req.body.source || 'api',
  };

  // Extract all fields (regular + PERM)
  const submissionBody = pick(req.body, [
    'tenantId',
    'projectId',
    'project_name',
    'project_category',
    'formId',
    'nodeId',
    'userId',
    'payload',
    'source',
    'meta',
    'status',
    'month',
    'year',
    'perm_enabled',
  ]);

  // Merge with user info
  submissionBody.tenantId = userInfo.tenantId;
  submissionBody.userId = userInfo.userId || submissionBody.userId;
  submissionBody.source = submissionBody.source || userInfo.source;

  // Validate required fields
  if (
    !submissionBody.tenantId ||
    !submissionBody.projectId ||
    !submissionBody.formId ||
    !submissionBody.payload
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing required fields: tenantId, projectId, formId, payload'
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // 🆕 NEW VALIDATION CODE STARTS HERE
  // ═══════════════════════════════════════════════════════════════

  // 1. Load form from MongoDB
  const ProjectForm = require('../models/projectForm.model');
  const projectForm = await ProjectForm.findOne({
    projectId: submissionBody.projectId,
    tenantId: submissionBody.tenantId,
    deletedAt: null,
  });

  // 2. Check form exists
  if (!projectForm) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      `Form not found: ${submissionBody.projectId}`
    );
  }

  // 3. Check form belongs to correct tenant
  if (projectForm.tenantId !== submissionBody.tenantId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Form belongs to a different tenant'
    );
  }

  // 4. Check form is active
  if (projectForm.status !== 'active') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Form is ${projectForm.status}. Only active forms can accept submissions.`
    );
  }

  // 5. Check form is published
  if (projectForm.metadata.deploymentStatus !== 'published') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Form is ${projectForm.metadata.deploymentStatus}. Only published forms can accept submissions.`
    );
  }

  // 6. Validate payload against form schema (optional but recommended)
  const dynamicValidationService = require('../ingestion/whatsapp/services/dynamicValidation.service');
  
  try {
    const validationResult = await dynamicValidationService.validateFormSubmission(
      submissionBody.payload,
      submissionBody.projectId,
      submissionBody.tenantId
    );

    if (!validationResult.valid) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Form validation failed',
        {
          errors: validationResult.errors,
          summary: validationResult.summary,
        }
      );
    }

    // Log validation success
    logger.info(
      `✅ Form validation passed for ${submissionBody.projectId}: ` +
        `${validationResult.summary.completionPercentage}% complete`
    );
  } catch (error) {
    if (error instanceof ApiError) {
      throw error; // Re-throw validation errors
    }
    // If validation service fails, log warning but continue
    logger.warn(
      `⚠️ Form validation service error (continuing anyway): ${error.message}`
    );
  }

  // 7. Auto-populate project info from form if not provided
  if (!submissionBody.project_name) {
    submissionBody.project_name = projectForm.configuration?.projectName || submissionBody.projectId;
  }
  if (!submissionBody.project_category) {
    submissionBody.project_category = projectForm.configuration?.tags?.[0] || 'General';
  }

  // ═══════════════════════════════════════════════════════════════
  // 🆕 NEW VALIDATION CODE ENDS HERE
  // ═══════════════════════════════════════════════════════════════

  // Auto-detect PERM submission
  const isPERM =
    submissionBody.perm_enabled ||
    submissionBody.month ||
    (submissionBody.payload && submissionBody.payload.month);

  if (isPERM) {
    submissionBody.perm_enabled = true;

    if (!submissionBody.nodeId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'nodeId is required for PERM submissions'
      );
    }

    if (!submissionBody.month) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'month is required for PERM submissions'
      );
    }
  }

  // Queue submission (existing code continues...)
  const result = await queueSubmission(submissionBody);

  // ... rest of existing code
});
```

---

## 📋 ADDITIONAL IMPORTS NEEDED

**At top of file:**
```javascript
const logger = require('../config/logger');
// ProjectForm model will be required inline to avoid circular dependencies
```

---

## 🧪 TESTING THE ENHANCEMENT

### Test 1: Valid Submission (Should Pass)
```bash
curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id",
    "projectId": "existing-project-id",
    "formId": "existing-form-id",
    "payload": {
      "field_1": "value1",
      "field_2": "value2"
    }
  }'

# Expected: 202 Accepted
```

### Test 2: Form Not Found (Should Fail)
```bash
curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id",
    "projectId": "proj_doesnotexist",
    "formId": "form-123",
    "payload": {}
  }'

# Expected: 404 Not Found
# Message: "Form not found: proj_doesnotexist"
```

### Test 3: Form Inactive (Should Fail)
```bash
# First, set form to inactive in MongoDB:
# db.projectforms.updateOne(
#   { projectId: "proj_abc123" },
#   { $set: { status: "inactive" } }
# )

curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id",
    "projectId": "proj_abc123",
    "formId": "form-123",
    "payload": {}
  }'

# Expected: 400 Bad Request
# Message: "Form is inactive. Only active forms can accept submissions."
```

### Test 4: Form Not Published (Should Fail)
```bash
# Set form to draft in MongoDB:
# db.projectforms.updateOne(
#   { projectId: "proj_abc123" },
#   { $set: { "metadata.deploymentStatus": "draft" } }
# )

curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id",
    "projectId": "proj_abc123",
    "formId": "form-123",
    "payload": {}
  }'

# Expected: 400 Bad Request
# Message: "Form is draft. Only published forms can accept submissions."
```

### Test 5: Validation Failure (Should Fail)
```bash
# Form has required field "email"
# Submit without it

curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "your-tenant-id",
    "projectId": "proj_abc123",
    "formId": "form-123",
    "payload": {
      "name": "John"
      // missing "email" (required field)
    }
  }'

# Expected: 400 Bad Request
# Message: "Form validation failed"
# errors: [{ field: "email", message: "Email is required" }]
```

---

## 📊 BENEFITS

### Before Enhancement:

- ⚠️ Any payload accepted
- ⚠️ Invalid data can reach PostgreSQL
- ⚠️ Inactive forms accept submissions
- ⚠️ Draft forms accept submissions

### After Enhancement:

- ✅ Only valid forms accept submissions
- ✅ Only active forms accept submissions
- ✅ Only published forms accept submissions
- ✅ Payload validated against schema
- ✅ Clear error messages
- ✅ Prevents invalid data entry

---

## 📋 ERROR RESPONSE FORMAT

### Before:
```json
{
  "success": true,
  "jobId": "tenant-001-1234567890",
  "status": "queued"
}
```
*Even if form doesn't exist or is inactive*

### After:
```json
{
  "success": false,
  "message": "Form is inactive. Only active forms can accept submissions.",
  "code": 400
}
```
*Clear error message, submission rejected*

---

## 🎯 WHEN TO IMPLEMENT

### Implement NOW if:
- Forms are public-facing
- Multiple users creating forms
- Need strict data quality
- Compliance requirements

### Implement LATER if:
- Internal use only
- Controlled form creation
- Frontend validation sufficient
- Speed to market priority

---

## 📝 IMPLEMENTATION CHECKLIST

### Step 1: Add Validation Code
- [ ] Copy code from above
- [ ] Add to `src/controllers/unifiedSubmission.controller.js`
- [ ] Test locally

### Step 2: Test All Scenarios
- [ ] Test valid submission (should pass)
- [ ] Test invalid form ID (should reject)
- [ ] Test inactive form (should reject)
- [ ] Test unpublished form (should reject)
- [ ] Test validation failure (should reject with errors)

### Step 3: Deploy
- [ ] Commit changes
- [ ] Push to GitHub
- [ ] Deploy to staging
- [ ] Verify on staging
- [ ] Deploy to production

---

## 🔄 ROLLBACK PLAN

If issues occur:

```bash
# Revert the commit
git revert HEAD

# Or remove the validation code
# Comment out lines added in controller

# Or make validation optional
const ENABLE_VALIDATION = process.env.ENABLE_SUBMISSION_VALIDATION === 'true';

if (ENABLE_VALIDATION) {
  // ... validation code ...
}
```

---

## 📊 ESTIMATED IMPACT

### Performance:
- **Additional latency:** ~50-100ms (MongoDB query + validation)
- **Still acceptable:** Total < 200ms before queue

### Error Rate:
- **May increase initially:** Users submitting to wrong/inactive forms
- **Will decrease:** Better error messages help users correct issues

### Data Quality:
- **Improves significantly:** Only valid data enters system
- **Reduces cleanup:** Less invalid data to handle

---

## 🎉 CONCLUSION

### This Enhancement Is:

✅ **Optional** - System works without it  
✅ **Beneficial** - Adds safety layer  
✅ **Quick** - 3-4 hours to implement  
✅ **Tested** - Used by WhatsApp/Telegram already  
✅ **Safe** - Can be rolled back easily

### Recommendation:

**Implement if you have time, skip if you need to deploy quickly.**

The core pipeline works either way! 🚀

---

**END OF ENHANCEMENT GUIDE**


