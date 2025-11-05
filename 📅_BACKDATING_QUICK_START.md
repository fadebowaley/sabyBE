# 📅 Calendar Backdating - Quick Start Guide

**Created:** November 4, 2025  
**Purpose:** Enable custom start dates and backdated testing for PERM calendars

---

## 🎯 TWO SOLUTIONS PROVIDED

### Solution 1: Code Changes (Permanent Feature) ⏱️ 2-3 hours
- Modify publication API to accept custom start date
- Update model, service, controller, validation
- **Pros:** Permanent feature, available via API
- **Cons:** Requires testing, code review, deployment

### Solution 2: Manual Scripts (Quick Testing) ⏱️ 10 minutes
- Use ready-made scripts to generate backdated calendars
- No code changes needed
- **Pros:** Works immediately, no deployment needed
- **Cons:** Manual process, not in API

---

## 🚀 QUICK START (Solution 2 - Use Now!)

### Test 1: Generate Backdated Calendar Only

```bash
cd /Users/fadebowaley/saby/sabyBackend

# 1. Edit the script (set your projectId)
nano generate-backdated-calendar.js
# Find line: projectId: 'proj_YOUR_PROJECT_ID'
# Replace with your actual project ID

# 2. Run script
node generate-backdated-calendar.js

# Expected output:
# ✅ Calendar generated for October 2025
# Total events required: 14
```

---

### Test 2: Complete Backdated Compliance Test

This script does EVERYTHING:
- Creates a PERM form
- Generates October 2025 calendar
- Submits ALL compliance data
- Verifies 100% compliance

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Make sure backend is running (workers need to process jobs)
# In another terminal:
npm run dev

# Run the complete test
node test-backdated-full-compliance.js

# Expected output:
# ✅ Form created
# ✅ Calendar generated for October 2025  
# ✅ 14 submissions queued
# ✅ Workers processing...
# 🎉 100% COMPLIANCE ACHIEVED!
```

---

## 📊 WHAT EACH SCRIPT DOES

### Script 1: `generate-backdated-calendar.js`

**Purpose:** Generate calendar for a past month

**What it does:**
1. Takes existing form (you provide projectId)
2. Generates event calendar for specified month
3. Saves to event_calendar table
4. Shows you total events required

**Use when:**
- You have an existing PERM form
- You need calendar for a past month
- You want to test with historical data

**Configuration:**
```javascript
const CONFIGURATION = {
  projectId: 'proj_abc123',     // Your form's project ID
  targetMonth: '2025-10-01',    // Month to generate
  targetYear: 2025,             // Year
};
```

---

### Script 2: `test-backdated-full-compliance.js`

**Purpose:** Complete end-to-end test of backdated compliance

**What it does:**
1. Creates new PERM form (weekly tracking)
2. Publishes form
3. Generates October 2025 calendar
4. Submits data for ALL 14 events (4 Sundays + 5 Tuesdays + 5 Thursdays)
5. Waits for processing
6. Verifies 100% compliance

**Use when:**
- Testing the complete flow
- Verifying compliance calculation
- Demo purposes
- Quality assurance

**Auto-configured:** No editing needed, runs as-is!

---

## 🎯 STEP-BY-STEP: Testing Backdated Compliance

### Prerequisites (5 minutes)

```bash
# 1. Ensure all services running
docker ps --filter name=saby-postgres-local --filter name=saby-redis

# 2. Ensure database is clean (optional)
docker exec saby-postgres-local psql -U halograph_user -d halograph -c "
  SELECT COUNT(*) as submissions FROM form_submissions;
  SELECT COUNT(*) as calendars FROM event_calendar;
"

# 3. Start backend with workers
cd /Users/fadebowaley/saby/sabyBackend
npm run dev &

# Give it 5 seconds to start
sleep 5
```

### Run Complete Test (10 minutes)

```bash
# Run the full compliance test
node test-backdated-full-compliance.js

# Watch the magic happen:
# ✅ Creates form
# ✅ Generates October calendar
# ✅ Submits 14 events
# ✅ Workers process in background
# ✅ Calculates compliance
# 🎉 Shows 100% compliance!
```

### Verify Results

```sql
-- Check form submissions
docker exec saby-postgres-local psql -U halograph_user -d halograph -c "
  SELECT 
    month,
    total_events_submitted,
    total_events_required,
    event_compliance_percentage,
    completeness_status
  FROM form_submissions
  WHERE month = '2025-10-01'
  ORDER BY updated_at DESC
  LIMIT 1;
"

-- Expected:
-- month        | total_events_submitted | total_events_required | compliance | status
-- 2025-10-01   | 14                     | 14                    | 100.00     | complete
```

---

## 📋 UNDERSTANDING THE OCTOBER 2025 CALENDAR

### Why 14 Events?

October 2025 has:
- **4 Sundays:** Oct 5, 12, 19, 26
- **5 Tuesdays:** Oct 7, 14, 21, 28, (Nov 4 not counted)
- **5 Thursdays:** Oct 2, 9, 16, 23, 30

**Total: 14 events required for 100% compliance**

### Calendar Structure

```javascript
{
  month: '2025-10-01',
  year: 2025,
  tracking_mode: 'weekly',
  total_events_required: 14,
  event_dates: [
    '2025-10-02', // Thursday
    '2025-10-05', // Sunday
    '2025-10-07', // Tuesday
    '2025-10-09', // Thursday
    '2025-10-12', // Sunday
    '2025-10-14', // Tuesday
    '2025-10-16', // Thursday
    '2025-10-19', // Sunday
    '2025-10-21', // Tuesday
    '2025-10-23', // Thursday
    '2025-10-26', // Sunday
    '2025-10-28', // Tuesday
    '2025-10-30', // Thursday
  ]
}
```

---

## 🔍 MONITORING & VERIFICATION

### Check Processing Status

```sql
-- See activity for your test
SELECT 
  action,
  status,
  COUNT(*) as count,
  MIN(created_at) as first,
  MAX(created_at) as last
FROM submission_activity_log
WHERE tenant_id LIKE 'test-tenant-%'
GROUP BY action, status
ORDER BY action;

-- Expected:
-- queued     | queued      | 14 | ...
-- processing | in progress | 14 | ...
-- completed  | success     | 14 | ...
```

### Check Compliance Over Time

```sql
-- See compliance progression
SELECT 
  total_events_submitted,
  event_compliance_percentage,
  updated_at
FROM form_submissions
WHERE month = '2025-10-01'
  AND tenant_id LIKE 'test-tenant-%'
ORDER BY updated_at;

-- You'll see compliance increase:
-- 1 events  → 7.14%
-- 2 events  → 14.28%
-- ...
-- 14 events → 100.00%
```

### Check for Failures

```sql
-- Any jobs in DLQ?
SELECT COUNT(*) as dlq_jobs
FROM dead_letter_queue
WHERE tenant_id LIKE 'test-tenant-%';

-- Should be 0 (no failures)

-- Any failures in activity log?
SELECT message
FROM submission_activity_log
WHERE tenant_id LIKE 'test-tenant-%'
  AND status = 'failed';

-- Should be empty (no failures)
```

---

## 🧹 CLEANUP AFTER TESTING

### Quick Cleanup Command

```bash
# Get the test tenant ID and project ID from test output, then:

docker exec saby-postgres-local psql -U halograph_user -d halograph << 'EOF'
-- Clean PostgreSQL test data
DELETE FROM form_submissions WHERE tenant_id LIKE 'test-tenant-%';
DELETE FROM event_calendar WHERE tenant_id LIKE 'test-tenant-%';
DELETE FROM submission_activity_log WHERE tenant_id LIKE 'test-tenant-%';
DELETE FROM dead_letter_queue WHERE tenant_id LIKE 'test-tenant-%';
DELETE FROM system_alerts WHERE tenant_id LIKE 'test-tenant-%';

-- Show results
SELECT 'Cleanup complete' as status;
EOF

# Clean MongoDB (replace with actual projectId from test output)
node -e "
const mongoose = require('mongoose');
const { ProjectForm } = require('./src/models');
const config = require('./src/config/config');

mongoose.connect(config.mongoose.url, config.mongoose.options)
  .then(() => ProjectForm.deleteMany({ tenantId: /^test-tenant-/ }))
  .then(result => console.log('Deleted', result.deletedCount, 'test forms'))
  .then(() => mongoose.connection.close())
  .then(() => process.exit(0));
"
```

---

## 📊 EXPECTED TEST RESULTS

### Successful Test Output

```
🧪 BACKDATED FULL COMPLIANCE TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ MongoDB connected
✅ PostgreSQL connected
✅ Form created successfully!
   Project ID: proj_abc123xyz
   Expected events: 14

✅ Form published!
✅ October 2025 calendar generated!
   Total events required: 14
   Event dates: 13

✅ All 14 submissions queued!

⏱️ Waiting for workers to process...
   Attempt 1/12: 0/14 processed (0% compliance)
   Attempt 2/12: 5/14 processed (35.71% compliance)
   Attempt 3/12: 10/14 processed (71.43% compliance)
   Attempt 4/12: 14/14 processed (100% compliance)

✅ COMPLIANCE REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Events Submitted: 14/14
   Compliance: 100.00%
   Status: complete

🎉 SUCCESS: 100% COMPLIANCE ACHIEVED! 🎉
```

---

## ⚠️ TROUBLESHOOTING

### Issue 1: "Workers not processing"

**Solution:**
```bash
# Check if backend is running
ps aux | grep "node.*index.js"

# If not, start it
cd /Users/fadebowaley/saby/sabyBackend
npm run dev

# Check workers started
# Look for: "✅ Submission worker started"
```

### Issue 2: "Calendar not generated"

**Solution:**
```javascript
// The form may not have autoGenerateCalendar enabled
// Either:
// 1. Use manual script: generate-backdated-calendar.js
// 2. Or enable it in form creation:
permSettings: {
  enabled: true,
  autoGenerateCalendar: true,  // ← Make sure this is true
}
```

### Issue 3: "Compliance stuck at 0%"

**Solution:**
```bash
# Check activity log
docker exec saby-postgres-local psql -U halograph_user -d halograph -c "
  SELECT action, status, message
  FROM submission_activity_log
  WHERE tenant_id LIKE 'test-tenant-%'
  ORDER BY created_at DESC
  LIMIT 10;
"

# If jobs are failing, check error messages
# Common issue: Date format (should be YYYY-MM-DD)
```

---

## 🎉 SUCCESS CRITERIA

After running the test, you should see:

- [x] ✅ Form created in MongoDB
- [x] ✅ Form published successfully
- [x] ✅ Calendar exists in event_calendar table
- [x] ✅ Calendar shows 14 total events required
- [x] ✅ 14 submissions queued
- [x] ✅ All submissions processed (check activity_log)
- [x] ✅ Compliance: 100%
- [x] ✅ Status: "complete"
- [x] ✅ No entries in DLQ (all succeeded)

---

## 📚 RELATED DOCUMENTATION

- **🎯_CALENDAR_BACKDATING_SOLUTION.md** - Complete solution (code changes)
- **📖_HOW_DLQ_WORKS_EXPLAINED.md** - How DLQ protects your data
- **📊_ACTIVITY_LOG_ANALYSIS_AND_RECOMMENDATIONS.md** - Current issues & fixes
- **test-backdated-full-compliance.js** - Complete test script
- **generate-backdated-calendar.js** - Manual calendar generator

---

## 🚀 READY TO TEST?

```bash
# Quick start (10 minutes):
cd /Users/fadebowaley/saby/sabyBackend

# Ensure backend running
npm run dev &
sleep 5

# Run complete test
node test-backdated-full-compliance.js

# Watch for:
# 🎉 SUCCESS: 100% COMPLIANCE ACHIEVED!
```

**That's it! Your backdated compliance testing is ready!** 🎯

---

**Created:** November 4, 2025  
**Status:** Ready to use  
**No code changes needed** - Scripts work with existing system!

