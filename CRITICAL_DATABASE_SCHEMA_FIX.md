# 🔴 CRITICAL: Database Schema Fix Required

**Issue:** `submission_activity_log` table missing `node_id` column  
**Error:** `column "node_id" of relation "submission_activity_log" does not exist`  
**Impact:** Activity logging fails for PERM submissions  
**Fix Time:** 2 minutes

---

## 🚨 THE PROBLEM

### Error from Logs:
```
error: [Activity] Failed to log activity: column "node_id" of relation "submission_activity_log" does not exist
```

### Root Cause:

**Table Schema (CURRENT):**
```sql
CREATE TABLE submission_activity_log (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    form_id VARCHAR(64),
    user_id VARCHAR(64),
    -- ❌ NO node_id column!
    action VARCHAR(32),
    status VARCHAR(32),
    job_id VARCHAR(128),
    message TEXT,
    project_name VARCHAR(128),
    project_category VARCHAR(64),
    created_at TIMESTAMP
);
```

**Code Trying to Insert (activityLogger.js):**
```javascript
INSERT INTO submission_activity_log 
(tenant_id, project_id, project_name, project_category, 
 form_id, node_id, user_id, action, status, job_id, message)
         ^^^^^^^^
         ❌ Column doesn't exist!
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
```

**Mismatch:** Code expects `node_id` column, but table doesn't have it!

---

## 🔧 THE FIX

### SQL Script Created:

**File:** `fix-activity-log-schema.sql`

```sql
-- Add missing node_id column
ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS node_id VARCHAR(64);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_activity_log_node_id 
ON submission_activity_log(node_id);
```

---

## 🚀 HOW TO FIX

### Option A: Using psql Command

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Run the SQL fix directly
psql -h 20.169.129.160 -U sabyagentic_user -d halograph -f fix-activity-log-schema.sql

# It will ask for password
```

---

### Option B: Using Script

```bash
cd /Users/fadebowaley/saby/sabyBackend

# Run the fix script
./run-schema-fix.sh

# Enter password when prompted
```

---

### Option C: Manual SQL

```bash
# Connect to PostgreSQL
psql -h 20.169.129.160 -U sabyagentic_user -d halograph

# Run these commands:
```

```sql
-- Add node_id column
ALTER TABLE submission_activity_log 
ADD COLUMN IF NOT EXISTS node_id VARCHAR(64);

-- Add index
CREATE INDEX IF NOT EXISTS idx_activity_log_node_id 
ON submission_activity_log(node_id);

-- Verify
\d submission_activity_log
```

Should show `node_id` in the column list.

---

## ✅ VERIFY THE FIX

### Check column exists:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'submission_activity_log'
ORDER BY ordinal_position;
```

**Should include:**
```
column_name     | data_type
----------------+-----------
id              | integer
tenant_id       | character varying
project_id      | character varying
form_id         | character varying
user_id         | character varying
node_id         | character varying  ← THIS SHOULD BE HERE NOW!
action          | character varying
status          | character varying
job_id          | character varying
message         | text
project_name    | character varying
project_category| character varying
created_at      | timestamp
```

---

## 🔄 AFTER FIXING SCHEMA

### Restart Backend (if running):

```bash
# Kill current backend process
pkill -f "node.*index.js"

# Start fresh
cd /Users/fadebowaley/saby/sabyBackend
npm run dev
```

### Restart Worker (if separate):

```bash
# Start worker if not already running
node src/workers/submission.worker.js
```

### Run Test Again:

```bash
cd /Users/fadebowaley/saby/sabyBackend
node test-perm-unified-submission.js
```

---

## 📊 BUGS FOUND & STATUS

| Bug # | Issue | Status | Fix |
|-------|-------|--------|-----|
| **1** | Worker calling wrong method | ✅ Fixed | Code updated |
| **2** | Validation missing PERM fields | ✅ Fixed | Schema updated |
| **3** | Database missing node_id column | ⚠️ NEEDS FIX | Run SQL script |

---

## 🎯 COMPLETE FIX SEQUENCE

### Step 1: Fix Database Schema (2 min)
```bash
cd /Users/fadebowaley/saby/sabyBackend
psql -h 20.169.129.160 -U sabyagentic_user -d halograph -f fix-activity-log-schema.sql
```

### Step 2: Restart Backend (1 min)
```bash
# Backend should already be running with nodemon
# If not:
npm run dev
```

### Step 3: Start Worker (1 min)
```bash
# In another terminal:
node src/workers/submission.worker.js
```

### Step 4: Run Test (1 min)
```bash
node test-perm-unified-submission.js
```

**Total Time:** 5 minutes

---

## ⚠️ WHY node_id IS NEEDED

PERM submissions track events per NODE per MONTH:

**Use Case:**
```
Church A (node_church_a) → October 2025 → 3/5 events (60%)
Church B (node_church_b) → October 2025 → 5/5 events (100%)
Church A (node_church_a) → November 2025 → 2/5 events (40%)
```

Without `node_id` in activity logs:
- ❌ Can't track which church submitted
- ❌ Can't filter logs by node
- ❌ Can't audit node-specific submissions
- ❌ Activity logging completely fails

With `node_id`:
- ✅ Track submissions per node
- ✅ Filter activity by node
- ✅ Complete audit trail
- ✅ Activity logging works

---

## 📋 UPDATED TABLE SCHEMA

### What It Should Be:

```sql
CREATE TABLE IF NOT EXISTS submission_activity_log (
    id SERIAL PRIMARY KEY,
    
    -- Core identifiers
    tenant_id VARCHAR(64),
    project_id VARCHAR(64),
    form_id VARCHAR(64),
    node_id VARCHAR(64),      -- ← ADDED FOR PERM
    user_id VARCHAR(64),
    
    -- Activity tracking
    action VARCHAR(32),
    status VARCHAR(32),
    job_id VARCHAR(128),
    message TEXT,
    
    -- Project information
    project_name VARCHAR(128),
    project_category VARCHAR(64),
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 🚀 NEXT STEPS

1. **Run SQL fix** → Add `node_id` column
2. **Restart backend** → Load updated code
3. **Start worker** → Process PERM submissions
4. **Run test** → All should pass!

---

**CRITICAL:** Fix database schema first, then everything will work! 🔧


