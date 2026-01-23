# 🔄 RESTART REQUIRED - Validation Fix Not Loaded

**Issue:** Backend server needs restart to load updated validation schema  
**Status:** ✅ Files fixed, ⏳ Server needs restart  
**Time:** 2 minutes

---

## 🎯 THE PROBLEM

The validation schema has been updated to allow PERM fields (`month`, `year`, `perm_enabled`), but the backend server is still running the OLD code from memory.

**Error in test:**

```
"month" is not allowed, "perm_enabled" is not allowed
```

**Why:**

- ✅ File `src/validations/submission.validation.js` is updated
- ❌ Backend server hasn't reloaded the file
- ❌ Worker hasn't reloaded the file

---

## 🔧 SOLUTION: RESTART BACKEND & WORKER

### Step 1: Check How Backend is Running

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Check if running with PM2
pm2 list

# Check if running with Docker
docker ps | grep backend

# Check if running as node process
ps aux | grep "node.*index"
```

---

### Step 2: Restart Based on Your Setup

#### Option A: Using PM2

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Restart backend
pm2 restart backend

# Restart worker
pm2 restart worker

# Or restart all
pm2 restart all

# Check logs
pm2 logs backend --lines 20
```

---

#### Option B: Using Docker

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Restart backend and worker containers
docker-compose restart backend worker

# Check logs
docker-compose logs -f backend worker
```

---

#### Option C: Using npm/node directly

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Stop (Ctrl+C if in foreground, or kill process)
pkill -f "node.*index.js"
pkill -f "submission.worker"

# Start backend
npm start

# Start worker (in another terminal)
node src/workers/submission.worker.js
```

---

## ✅ VERIFY RESTART WORKED

### Test validation accepts PERM fields:

```bash
# Get a token first (login)
curl -X POST http://localhost:4000/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "saby@saby.ai",
    "password": "@saby_Saby1"
  }'

# Save the token, then test submission with PERM fields:
export TOKEN="your_token_here"

curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "test",
    "projectId": "test",
    "formId": "test",
    "nodeId": "node_test",
    "month": "2025-10",
    "perm_enabled": true,
    "payload": {
      "test": "data"
    }
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Submission queued for processing",
  "jobId": "test-xxx",
  "status": "queued",
  "type": "perm",
  "month": "2025-10",
  "nodeId": "node_test"
}
```

**NOT:**

```json
{
  "code": 400,
  "message": "\"month\" is not allowed, \"perm_enabled\" is not allowed"
}
```

---

## 🏃 QUICK RESTART COMMANDS

### For Local Development:

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Kill and restart
pkill -f "node"
sleep 2
npm start &
node src/workers/submission.worker.js &

# Wait 5 seconds for startup
sleep 5

# Test
node test-perm-unified-submission.js
```

---

### For Docker:

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Quick restart
docker-compose restart backend worker

# Wait for containers to be ready
sleep 10

# Test
docker-compose exec backend node test-perm-unified-submission.js
```

---

## 📋 RESTART CHECKLIST

Before running test:

- [ ] Backend restarted
- [ ] Worker restarted
- [ ] Wait 5-10 seconds for full startup
- [ ] Check backend logs show no errors
- [ ] Check worker logs show "Starting submission worker"

After restart:

- [ ] Run test: `node test-perm-unified-submission.js`
- [ ] Verify Step 4 passes (no validation error)
- [ ] Check all 12 steps complete

---

## 🎯 WHAT TO EXPECT

### Before Restart:

```
❌ STEP 4: "month" is not allowed, "perm_enabled" is not allowed
```

### After Restart:

```
✅ STEP 4: Submit Initial PERM Data (CREATE)
✅ PERM submission queued!
ℹ Job ID: tenant-001-xxx
ℹ Type: perm
ℹ Month: 2025-10
```

---

## 🚀 READY TO TEST

Once you restart backend and worker:

```bash
cd /Users/fadebowaley/saby/sabyBackend
node test-perm-unified-submission.js
```

**Expected:** All 12 steps pass! 🎉

---

**SUMMARY:** Files are fixed ✅, just need server restart! 🔄

