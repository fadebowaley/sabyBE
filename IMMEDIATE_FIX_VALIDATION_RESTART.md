# ⚠️ IMMEDIATE FIX REQUIRED - Validation Schema & Server Restart

**Issue:** Test failing because validation fix not loaded  
**Cause:** Server/worker need restart to load updated validation schema  
**Fix Time:** 2 minutes

---

## 🔴 ERROR DETAILS

```
❌ Error: "month" is not allowed, "perm_enabled" is not allowed
```

**Why This Happens:**
The Joi validation schema has been updated in `src/validations/submission.validation.js`, but:

- ❌ Backend server hasn't reloaded the file
- ❌ Worker hasn't reloaded the file

**Solution:** Restart backend and worker!

---

## 🔧 IMMEDIATE FIXES NEEDED

### Fix #1: Restart Backend Server

**If running locally:**

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Stop backend
pm2 stop backend
# OR
pkill -f "node.*index.js"

# Start backend
npm start
# OR
pm2 start ecosystem.config.js
```

**If running in Docker:**

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Restart backend container
docker-compose restart backend

# OR rebuild if needed
docker-compose down
docker-compose up -d --build
```

---

### Fix #2: Restart Worker

**If running locally:**

```bash
# Stop worker
pm2 stop worker
# OR
pkill -f "submission.worker"

# Start worker
pm2 start src/workers/submission.worker.js --name worker
```

**If running in Docker:**

```bash
# Restart worker container
docker-compose restart worker

# OR rebuild
docker-compose down worker
docker-compose up -d --build worker
```

---

### Fix #3: Verify Files Updated

**Check validation schema has PERM fields:**

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Should see month, year, perm_enabled in the file
grep -A 5 "PERM-specific fields" src/validations/submission.validation.js
```

**Expected output:**

```javascript
// PERM-specific fields
month: Joi.string()
  .optional()
  .pattern(/^\d{4}-\d{2}(-\d{2})?$/)
  .description('Month for PERM submissions (YYYY-MM or YYYY-MM-DD)'),
```

**Check worker has permSubmissionService:**

```bash
# Should see the import
grep "permSubmissionService" src/workers/submission.worker.js
```

**Expected output:**

```javascript
const permSubmissionService = require('../services/permSubmission.service');
```

---

## 🚀 QUICK RESTART STEPS

### Option A: PM2 (if using PM2)

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Restart everything
pm2 restart all

# Check status
pm2 status

# Watch logs
pm2 logs
```

---

### Option B: Docker (if using Docker)

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Restart all containers
docker-compose restart

# OR stop and start (cleaner)
docker-compose down
docker-compose up -d

# Watch logs
docker-compose logs -f backend worker
```

---

### Option C: Local Dev (npm start)

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Stop running processes (Ctrl+C)
# Then restart:
npm start
```

---

## ✅ AFTER RESTART

### Test Again:

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Run the PERM test
node test-perm-unified-submission.js
```

**Expected:** All steps should pass now! ✅

---

## 🔍 VERIFICATION

### Check backend loaded new validation:

```bash
# Make a test request
curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test",
    "projectId": "test",
    "formId": "test",
    "payload": {},
    "month": "2025-10",
    "perm_enabled": true
  }'
```

**Before restart:** `"month" is not allowed`  
**After restart:** Should accept and queue (or fail on different validation)

---

## 📋 TROUBLESHOOTING

### If still getting validation error:

**1. Check file was actually saved:**

```bash
cat src/validations/submission.validation.js | grep -A 3 "perm_enabled"
```

Should show:

```javascript
perm_enabled: Joi.boolean()
  .optional()
  .description('Flag to indicate PERM submission'),
```

**2. Check backend loaded the file:**

```bash
# Restart with clean cache
rm -rf node_modules/.cache
npm start
```

**3. Check worker loaded the file:**

```bash
# Restart worker process
pm2 restart worker
# OR
docker-compose restart worker
```

---

## ⏱️ TIMELINE

**Fix #1:** Restart backend (30 seconds)  
**Fix #2:** Restart worker (30 seconds)  
**Verify:** Run test (1 minute)  
**Total:** 2 minutes

---

## 🎯 EXPECTED OUTCOME

### After Restart:

**Step 4 should show:**

```
✅ PERM submission queued!
ℹ Job ID: tenant-001-xxx
ℹ Type: perm
ℹ Month: 2025-10
```

**Activity logs should show:**

```
ℹ   queued: Submission queued for processing
ℹ   processing: Processing PERM submission for 2025-10
ℹ   completed: PERM submission completed (40% compliance)
```

**NOT:**

```
❌   rejected: "month" is not allowed
```

---

**QUICK FIX:** Restart backend and worker, then rerun test! 🔄

