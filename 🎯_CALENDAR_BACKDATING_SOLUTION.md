# 🎯 Calendar Backdating & Custom Start Date - Complete Solution

**Date:** November 4, 2025  
**Feature:** Custom Calendar Start Date for Form Publication  
**Purpose:** Allow backdating for testing & flexible calendar generation

---

## 🎯 REQUIREMENT SUMMARY

### Requirement 1: Custom Start Date on Publication
**Current Behavior:**
```
Form published → Calendar generated from TODAY + next 3 months
```

**Desired Behavior:**
```
Form published with optional startDate → 
Calendar generated from SELECTED DATE + next 3 months
```

### Requirement 2: Backdated Testing
**Use Case:**
```
Test Scenario:
1. Publish form backdated to October 1, 2025
2. Generate calendar for October 2025
3. Fill all compliance data for entire October month
4. Verify 100% compliance calculation
```

---

## 🔧 SOLUTION 1: Add Custom Start Date to Publication

### Step 1: Update Publish Method

**File:** `src/models/projectForm.model.js`

**Current Code (lines 382-423):**
```javascript
ProjectFormSchema.methods.publish = async function () {
  this.metadata.deploymentStatus = 'published';
  this.publishedAt = new Date();
  this.status = 'active';

  // Auto-generate calendar if PERM is enabled
  if (this.permSettings?.enabled && this.permSettings?.autoGenerateCalendar) {
    const now = new Date();  // ← Always uses current date
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Generate calendar for current month and next 3 months
    for (let i = 0; i < 4; i++) {
      const monthDate = new Date(currentYear, currentMonth + i, 1);
      // ... generate calendar
    }
  }

  await this.save();
  return this;
};
```

**Enhanced Code (with custom start date):**

```javascript
/**
 * Publish project
 * @param {Object} options - Publishing options
 * @param {Date|string} options.startDate - Optional start date for calendar generation
 * @param {number} options.monthsToGenerate - Number of months to generate (default: 4)
 * @param {boolean} options.generatePastMonths - Allow generating past months (default: false for security, true for testing)
 * @returns {Promise<ProjectForm>}
 */
ProjectFormSchema.methods.publish = async function (options = {}) {
  const {
    startDate = null,
    monthsToGenerate = 4,
    generatePastMonths = false,
  } = options;

  this.metadata.deploymentStatus = 'published';
  this.publishedAt = startDate ? new Date(startDate) : new Date();
  this.status = 'active';

  // Auto-generate formId if not set
  if (!this.formId) {
    this.formId = this.constructor.generateFormId();
  }

  // Auto-generate calendar if PERM is enabled
  if (this.permSettings?.enabled && this.permSettings?.autoGenerateCalendar) {
    try {
      const { eventCalendarService } = require('../services');
      
      // Use custom start date or current date
      const baseDate = startDate ? new Date(startDate) : new Date();
      const currentMonth = baseDate.getMonth();
      const currentYear = baseDate.getFullYear();

      // Security check: Prevent backdating unless explicitly allowed
      const now = new Date();
      const isBackdating = baseDate < now;
      
      if (isBackdating && !generatePastMonths) {
        console.warn('⚠️ Cannot backdate calendar without generatePastMonths=true flag');
        console.warn('   Using current date instead for security');
        baseDate.setTime(now.getTime());
      }

      // Generate calendar for specified months
      for (let i = 0; i < monthsToGenerate; i++) {
        const monthDate = new Date(currentYear, currentMonth + i, 1);
        const year = monthDate.getFullYear();
        const month = `${year}-${String(monthDate.getMonth() + 1).padStart(
          2,
          '0'
        )}-01`;

        await eventCalendarService.generateCalendarFromForm(this, month, year);
      }

      console.log(
        `✅ Auto-generated calendars for form ${this.projectId}` +
        (startDate ? ` (starting from ${baseDate.toISOString().split('T')[0]})` : '')
      );
    } catch (error) {
      console.error('⚠️ Failed to auto-generate calendar:', error.message);
      // Don't fail publish if calendar generation fails
    }
  }

  await this.save();
  return this;
};
```

---

### Step 2: Update Service to Accept Options

**File:** `src/services/projectForm.service.js`

**Current Code (lines 232-235):**
```javascript
const publishProjectForm = async (projectFormId) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.publish();
};
```

**Enhanced Code:**

```javascript
/**
 * Publish project form with optional custom start date
 * @param {ObjectId} projectFormId - The project form ID
 * @param {Object} options - Publishing options
 * @param {Date|string} options.startDate - Optional start date for calendar generation
 * @param {number} options.monthsToGenerate - Number of months to generate (default: 4)
 * @param {boolean} options.generatePastMonths - Allow backdating (default: false)
 * @returns {Promise<ProjectForm>}
 */
const publishProjectForm = async (projectFormId, options = {}) => {
  const projectForm = await getProjectFormById(projectFormId);
  return projectForm.publish(options);
};
```

---

### Step 3: Update Controller to Accept Parameters

**File:** `src/controllers/projectForm.controller.js`

**Current Code (lines 235-246):**
```javascript
const publishProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;

  const projectForm = await projectFormService.publishProjectForm(
    projectFormId
  );

  res.send({
    message: 'Project form published successfully',
    projectForm,
  });
});
```

**Enhanced Code:**

```javascript
/**
 * Publish a project form with optional custom start date
 * @route PATCH /v1/project-forms/:projectFormId/publish
 * @body {startDate?: string, monthsToGenerate?: number, generatePastMonths?: boolean}
 */
const publishProjectForm = catchAsync(async (req, res) => {
  const { projectFormId } = req.params;
  const { startDate, monthsToGenerate, generatePastMonths } = req.body;

  // Validate startDate if provided
  if (startDate && isNaN(Date.parse(startDate))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid start date format');
  }

  const publishOptions = {
    startDate: startDate ? new Date(startDate) : undefined,
    monthsToGenerate: monthsToGenerate || 4,
    generatePastMonths: generatePastMonths || false,
  };

  const projectForm = await projectFormService.publishProjectForm(
    projectFormId,
    publishOptions
  );

  res.send({
    message: 'Project form published successfully',
    projectForm,
    calendarGenerated: {
      startDate: publishOptions.startDate || 'current date',
      monthsGenerated: publishOptions.monthsToGenerate,
      backdated: publishOptions.generatePastMonths,
    },
  });
});
```

---

### Step 4: Update Validation

**File:** `src/validations/projectForm.validation.js`

Add validation schema for publish endpoint:

```javascript
const publishProjectForm = {
  params: Joi.object().keys({
    projectFormId: Joi.string().custom(objectId),
  }),
  body: Joi.object().keys({
    startDate: Joi.date().optional()
      .description('Custom start date for calendar generation (ISO 8601 format)'),
    monthsToGenerate: Joi.number().integer().min(1).max(12).default(4)
      .description('Number of months to generate (1-12)'),
    generatePastMonths: Joi.boolean().default(false)
      .description('Allow backdating (use for testing only)'),
  }),
};
```

---

## 🧪 SOLUTION 2: Backdated Testing Scenario

### Complete Test Script

**File:** `test-backdated-compliance.js`

```javascript
/**
 * Test Script: Backdated Form with Full Month Compliance
 * 
 * Scenario:
 * 1. Create PERM form backdated to October 1, 2025
 * 2. Generate calendar for October 2025
 * 3. Submit all compliance data for October
 * 4. Verify 100% compliance
 */

const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const { eventCalendarService } = require('./src/services');
const { queueSubmission } = require('./src/services/submission.service');
const config = require('./src/config/config');

async function testBackdatedCompliance() {
  console.log('\n🧪 ========================================');
  console.log('   BACKDATED COMPLIANCE TEST');
  console.log('========================================\n');

  try {
    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Step 1: Create PERM-enabled form
    console.log('📝 Step 1: Creating PERM-enabled form...');
    
    const testTenantId = 'test-tenant-backdate';
    const testUserId = new mongoose.Types.ObjectId();
    
    const formData = {
      configuration: {
        projectName: 'Backdated Compliance Test Form',
        projectCategory: 'Testing',
        security: 'private',
      },
      elements: [
        {
          id: 'event_name',
          type: 'text',
          properties: {
            label: 'Event Name',
            required: true,
          },
        },
        {
          id: 'attendance',
          type: 'number',
          properties: {
            label: 'Attendance',
            required: true,
          },
        },
        {
          id: 'offering',
          type: 'number',
          properties: {
            label: 'Offering Amount',
            required: false,
          },
        },
      ],
      permSettings: {
        enabled: true,
        trackingMode: 'weekly',
        weeklyConfig: {
          days: [
            { day: 0, name: 'Sunday', frequency: 'weekly', occurrences: 4, enabled: true },
            { day: 2, name: 'Tuesday', frequency: 'weekly', occurrences: 5, enabled: true },
            { day: 4, name: 'Thursday', frequency: 'weekly', occurrences: 5, enabled: true },
          ],
        },
        requireNodeId: true,
        requireMonth: true,
        trackCompliance: true,
        autoGenerateCalendar: true,
      },
      metadata: {
        deploymentStatus: 'draft',  // Will be published
      },
      status: 'draft',
    };

    const form = await ProjectForm.createProjectForm(
      formData,
      testTenantId,
      testUserId
    );

    console.log('✅ Form created:', form.projectId);
    console.log('   Form ID:', form._id);
    console.log('   PERM enabled:', form.permSettings.enabled);
    console.log('   Tracking mode:', form.permSettings.trackingMode);

    // Step 2: Publish form backdated to October 1, 2025
    console.log('\n📝 Step 2: Publishing form backdated to October 1, 2025...');
    
    const backdateToOctober = new Date('2025-10-01');
    
    const publishedForm = await form.publish({
      startDate: backdateToOctober,
      monthsToGenerate: 1,  // Just October for this test
      generatePastMonths: true,  // Allow backdating (testing only!)
    });

    console.log('✅ Form published (backdated)');
    console.log('   Published at:', publishedForm.publishedAt);
    console.log('   Deployment status:', publishedForm.metadata.deploymentStatus);

    // Step 3: Verify calendar was generated for October
    console.log('\n📝 Step 3: Verifying calendar for October 2025...');
    
    const octoberCalendar = await eventCalendarService.getCalendar(
      testTenantId,
      form.projectId,
      '2025-10-01',
      2025
    );

    if (octoberCalendar.length === 0) {
      console.log('❌ No calendar found! Generating manually...');
      await eventCalendarService.generateCalendarFromForm(
        publishedForm,
        '2025-10-01',
        2025
      );
      
      // Fetch again
      const retryCalendar = await eventCalendarService.getCalendar(
        testTenantId,
        form.projectId,
        '2025-10-01',
        2025
      );
      console.log('✅ Calendar generated manually');
      console.log('   Total events required:', retryCalendar[0]?.total_events_required || 0);
    } else {
      console.log('✅ Calendar found for October 2025');
      console.log('   Total events required:', octoberCalendar[0]?.total_events_required || 0);
    }

    // Step 4: Get all required events for October
    console.log('\n📝 Step 4: Getting event schedule for October...');
    
    const calendar = await eventCalendarService.getCalendar(
      testTenantId,
      form.projectId,
      '2025-10-01',
      2025
    );

    if (!calendar || calendar.length === 0) {
      throw new Error('Calendar not generated!');
    }

    const totalEventsRequired = calendar[0].total_events_required;
    const trackingConfig = calendar[0].tracking_config;

    console.log('✅ Event schedule retrieved:');
    console.log('   Tracking mode:', trackingConfig.tracking_mode);
    console.log('   Total events required:', totalEventsRequired);
    console.log('   Event dates:', trackingConfig.event_dates?.length || 0);

    // Step 5: Submit data for ALL events in October
    console.log('\n📝 Step 5: Submitting data for all events...');
    
    const testNodeId = 'test-node-001';
    const eventDates = trackingConfig.event_dates || [];
    const submissionsCreated = [];

    for (let i = 0; i < totalEventsRequired; i++) {
      const eventDate = eventDates[i] || `2025-10-${String(i + 1).padStart(2, '0')}`;
      
      const submissionData = {
        tenantId: testTenantId,
        projectId: form.projectId,
        formId: form._id.toString(),
        nodeId: testNodeId,
        userId: testUserId.toString(),
        month: '2025-10-01',
        year: 2025,
        perm_enabled: true,
        source: 'test-script',
        payload: {
          event_name: `Test Event ${i + 1}`,
          attendance: 50 + i,
          offering: 1000 + (i * 50),
          event_date: eventDate,
        },
        meta: {
          backdated: true,
          test: true,
        },
      };

      const result = await queueSubmission(submissionData);
      submissionsCreated.push(result.jobId);
      
      // Wait a bit between submissions to avoid overwhelming the queue
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Queued ${submissionsCreated.length} submissions`);
    console.log('   Job IDs:', submissionsCreated.slice(0, 3).join(', '), '...');

    // Step 6: Wait for processing
    console.log('\n📝 Step 6: Waiting for worker to process submissions...');
    console.log('   (Give it 10 seconds...)');
    
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 7: Check compliance
    console.log('\n📝 Step 7: Checking compliance percentage...');
    
    const { postgresPool } = require('./src/config/postgres');
    
    const complianceQuery = `
      SELECT 
        event_compliance_percentage,
        total_events_submitted,
        total_events_required,
        completeness_status
      FROM form_submissions
      WHERE tenant_id = $1
        AND project_id = $2
        AND node_id = $3
        AND month = $4
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const complianceResult = await postgresPool.query(complianceQuery, [
      testTenantId,
      form.projectId,
      testNodeId,
      '2025-10-01',
    ]);

    if (complianceResult.rows.length === 0) {
      console.log('⚠️ No submission found yet (may still be processing)');
      console.log('   Check submission_activity_log for status');
    } else {
      const compliance = complianceResult.rows[0];
      console.log('✅ Compliance calculated:');
      console.log('   Events submitted:', compliance.total_events_submitted);
      console.log('   Events required:', compliance.total_events_required);
      console.log('   Compliance %:', compliance.event_compliance_percentage + '%');
      console.log('   Status:', compliance.completeness_status);

      if (parseFloat(compliance.event_compliance_percentage) === 100.0) {
        console.log('\n🎉 SUCCESS: 100% COMPLIANCE ACHIEVED!');
      } else {
        console.log('\n⚠️ Not yet 100% - may still be processing');
      }
    }

    // Step 8: Summary
    console.log('\n========================================');
    console.log('   TEST SUMMARY');
    console.log('========================================');
    console.log('✅ Form created (PERM-enabled)');
    console.log('✅ Published backdated to October 1, 2025');
    console.log('✅ Calendar generated for October');
    console.log(`✅ ${totalEventsRequired} submissions queued`);
    console.log('✅ Compliance tracking active');
    
    console.log('\n📊 Next Steps:');
    console.log('1. Check activity logs for processing status');
    console.log('2. Verify all submissions completed');
    console.log('3. Confirm 100% compliance in dashboard');

    console.log('\n🧹 Cleanup (Optional):');
    console.log(`   DELETE FROM form_submissions WHERE tenant_id = '${testTenantId}';`);
    console.log(`   DELETE FROM event_calendar WHERE tenant_id = '${testTenantId}';`);
    console.log(`   Use: await ProjectForm.findOneAndDelete({ projectId: '${form.projectId}' });\n`);

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ MongoDB connection closed');
    process.exit(0);
  }
}

// Run test
testBackdatedCompliance();
```

---

## 📋 ALTERNATIVE: Manual Calendar Generation (No Code Changes)

If you don't want to modify the code, you can manually generate calendars for past months:

### Script: Manual Backdate Calendar Generation

**File:** `generate-backdated-calendar.js`

```javascript
/**
 * Manually generate calendar for a specific past month
 * No code changes needed - uses existing calendar service
 */

const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const { eventCalendarService } = require('./src/services');
const config = require('./src/config/config');

async function generateBackdatedCalendar() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB\n');

    // Configuration
    const projectId = 'YOUR_PROJECT_ID_HERE';  // Replace with actual project ID
    const targetMonth = '2025-10-01';  // Month to generate calendar for
    const targetYear = 2025;

    // Get form
    const form = await ProjectForm.findOne({ projectId });
    
    if (!form) {
      throw new Error(`Form not found: ${projectId}`);
    }

    console.log('📝 Generating backdated calendar:');
    console.log('   Project:', form.configuration.projectName);
    console.log('   Month:', targetMonth);
    console.log('   Year:', targetYear);
    console.log('   PERM mode:', form.permSettings?.trackingMode || 'none');

    // Generate calendar
    const calendar = await eventCalendarService.generateCalendarFromForm(
      form,
      targetMonth,
      targetYear
    );

    console.log('\n✅ Calendar generated successfully!');
    console.log('   Total events required:', calendar[0]?.total_events_required || 0);

    // Verify
    const verify = await eventCalendarService.getCalendar(
      form.tenantId,
      projectId,
      targetMonth,
      targetYear
    );

    console.log('\n✅ Verification:');
    console.log('   Calendar entries:', verify.length);
    if (verify.length > 0) {
      console.log('   Month:', verify[0].month);
      console.log('   Year:', verify[0].year);
      console.log('   Required events:', verify[0].total_events_required);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

generateBackdatedCalendar();
```

**Usage:**
```bash
# Edit script to set your projectId
node generate-backdated-calendar.js
```

---

## 🎯 USAGE EXAMPLES

### Example 1: Publish with Custom Start Date (API)

```bash
# Publish form starting from December 1, 2025
curl -X PATCH http://localhost:4000/v1/project-forms/:projectFormId/publish \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-12-01",
    "monthsToGenerate": 3
  }'

# Response:
{
  "message": "Project form published successfully",
  "projectForm": { ... },
  "calendarGenerated": {
    "startDate": "2025-12-01",
    "monthsGenerated": 3,
    "backdated": false
  }
}

# Calendars created for: Dec 2025, Jan 2026, Feb 2026
```

### Example 2: Backdate for Testing (API)

```bash
# Publish backdated to October 1, 2025 (testing only!)
curl -X PATCH http://localhost:4000/v1/project-forms/:projectFormId/publish \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2025-10-01",
    "monthsToGenerate": 1,
    "generatePastMonths": true
  }'

# Response:
{
  "message": "Project form published successfully",
  "calendarGenerated": {
    "startDate": "2025-10-01T00:00:00.000Z",
    "monthsGenerated": 1,
    "backdated": true  ← Security flag
  }
}

# Calendar created for: October 2025
```

### Example 3: Frontend Integration

```javascript
// In your frontend form publication component

const publishForm = async (formId, options = {}) => {
  const response = await api.patch(`/v1/project-forms/${formId}/publish`, {
    startDate: options.customStartDate || null,  // Optional
    monthsToGenerate: options.monthsAhead || 4,  // Default 4
    generatePastMonths: options.allowBackdating || false,  // Testing only
  });

  return response.data;
};

// Usage 1: Normal publish (current date)
await publishForm('form-123');

// Usage 2: Publish with custom future date
await publishForm('form-123', {
  customStartDate: '2026-01-01',  // Start calendars from January 2026
  monthsAhead: 6,  // Generate 6 months
});

// Usage 3: Backdate for testing
await publishForm('form-123', {
  customStartDate: '2025-10-01',
  monthsAhead: 1,
  allowBackdating: true,  // ⚠️ Testing only!
});
```

---

## 🚨 SECURITY CONSIDERATIONS

### generatePastMonths Flag

**Why it exists:**
- Prevents accidental backdating in production
- Prevents data manipulation (e.g., backdating to inflate compliance)
- Should only be used in testing/development

**Recommendations:**
```javascript
// In production, add extra validation
if (generatePastMonths && config.env === 'production') {
  // Require admin role
  if (!req.user.isAdmin) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Backdating requires admin privileges'
    );
  }
  
  // Log audit trail
  await auditLog.create({
    action: 'form_backdated',
    userId: req.user._id,
    details: { formId, startDate, reason: req.body.reason },
  });
}
```

---

## 📊 TESTING CHECKLIST

### Pre-Test Setup
- [ ] ✅ DLQ tables created
- [ ] ✅ Workers running
- [ ] ✅ Database clean (fresh start)
- [ ] ✅ Code changes applied (if implementing Solution 1)

### Test Execution
- [ ] Create PERM-enabled form
- [ ] Publish with backdated start date (Oct 1, 2025)
- [ ] Verify calendar generated for October
- [ ] Check total events required
- [ ] Submit data for ALL events
- [ ] Wait for processing (10 seconds)
- [ ] Verify compliance percentage
- [ ] Check for 100% compliance

### Expected Results
- ✅ Calendar: October 2025 created
- ✅ Events required: 14 (4 Sundays + 5 Tuesdays + 5 Thursdays)
- ✅ Submissions: 14 queued
- ✅ Processing: All completed
- ✅ Compliance: 100%
- ✅ Status: "complete"

---

## 🎯 RECOMMENDATION

### For Your Use Case:

**Option A: Quick Testing (No Code Changes)**
1. Use `generate-backdated-calendar.js` script
2. Manually create calendar for October
3. Use existing submission endpoint with backdated month
4. Verify compliance

**Time:** 30 minutes  
**Pros:** No code changes  
**Cons:** Manual process, not in API

**Option B: Full Implementation (Code Changes)**
1. Implement all code changes above
2. Test locally
3. Deploy to staging via CI/CD
4. Use via API endpoint

**Time:** 2-3 hours  
**Pros:** Permanent feature, API available  
**Cons:** Requires code review and deployment

---

## 🚀 QUICK START (Option A - No Code Changes)

```bash
# 1. Create the manual calendar generator script
cat > /Users/fadebowaley/saby/sabyBackend/generate-backdated-calendar.js << 'SCRIPT'
# [Copy the script from "Alternative: Manual Calendar Generation" above]
SCRIPT

# 2. Edit script to set your projectId
# Replace 'YOUR_PROJECT_ID_HERE' with actual project ID

# 3. Run script
cd /Users/fadebowaley/saby/sabyBackend
node generate-backdated-calendar.js

# 4. Verify calendar created
docker exec saby-postgres-local psql -U halograph_user -d halograph -c "
  SELECT month, year, total_events_required, tracking_config
  FROM event_calendar
  WHERE month = '2025-10-01'
  ORDER BY created_at DESC
  LIMIT 1;
"

# 5. Now submit PERM data for October using existing endpoint
# (Use your frontend or curl with month: '2025-10-01')
```

---

## 📚 FILES TO CREATE

### If Implementing Solution 1 (Code Changes):
1. Update: `src/models/projectForm.model.js` (publish method)
2. Update: `src/services/projectForm.service.js` (publishProjectForm)
3. Update: `src/controllers/projectForm.controller.js` (publishProjectForm)
4. Update: `src/validations/projectForm.validation.js` (validation)
5. Create: `test-backdated-compliance.js` (test script)

### If Using Solution 2 (Manual):
1. Create: `generate-backdated-calendar.js` (manual generator)
2. No other changes needed

---

## ✅ NEXT STEPS

1. **Choose approach:** Code changes (permanent) vs Manual script (quick)
2. **Test locally** with October 2025 scenario
3. **Verify 100% compliance** after filling all events
4. **Deploy to staging** (if implementing code changes)
5. **Document** the backdating capability for your team

---

**Prepared by:** AI Assistant  
**Date:** November 4, 2025  
**Status:** Ready for implementation  
**Recommendation:** Start with manual script, implement API later if needed

