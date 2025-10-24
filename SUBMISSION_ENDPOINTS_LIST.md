# 📋 Submission Endpoints - Complete List

**Base URL:** `/v1`  
**Authentication:** Required for most endpoints  
**Data Source:** PostgreSQL (`form_submissions`, `submission_activity_log`)

---

## 🎯 UNIFIED SUBMISSION ENDPOINTS

### 1. Submit Data (Universal Endpoint)

**POST** `/submissions`  
**Permission:** `create:submission`  
**Purpose:** Universal submission endpoint for all types (PERM/Regular)  
**Request Body:**

```json
{
  "tenantId": "string",
  "projectId": "string",
  "formId": "string",
  "nodeId": "string (required for PERM)",
  "payload": {},
  "month": "YYYY-MM-DD (for PERM)",
  "year": 2025,
  "perm_enabled": true
}
```

---

### 2. List Submissions

**GET** `/submissions`  
**Permission:** `view:submission`  
**Purpose:** Get all submissions with filtering  
**Query Params:**

- `tenant_id` - Filter by tenant
- `project_id` - Filter by project
- `node_id` - Filter by node
- `month` - Filter by month
- `limit` - Results per page
- `offset` - Pagination offset

---

### 3. Get Specific Submission

**GET** `/submissions/:id`  
**Permission:** `view:submission`  
**Purpose:** Get single submission by ID  
**Returns:** Full submission details with compliance metrics

---

### 4. Retry Failed Submission

**POST** `/submissions/:id/retry`  
**Permission:** `create:submission`  
**Purpose:** Retry a failed submission from DLQ

---

## 📊 ACTIVITY LOG ENDPOINTS

### 5. Get Activity Logs

**GET** `/submissions/activity-log`  
**Permission:** `view:submission`  
**Purpose:** Get all activity logs with filtering  
**Query Params:**

- `tenant_id`
- `project_id`
- `job_id`
- `action` (queued, processing, completed, failed)
- `status`
- `limit`, `offset`

---

### 6. Get Activity Log Summary

**GET** `/submissions/activity-log/summary`  
**Permission:** None (public)  
**Purpose:** Get aggregated statistics  
**Returns:**

```json
{
  "totalJobs": 328,
  "successful": 46,
  "failed": 5,
  "queued": 3,
  "inProgress": 0
}
```

---

### 7. Get Recent Activity Logs

**GET** `/submissions/activity-log/recent`  
**Permission:** `view:submission`  
**Query Params:**

- `tenant_id` (required)
- `limit` (default: 10)

---

### 8. Get Activity Logs by User

**GET** `/submissions/activity-log/user/:user_id`  
**Permission:** `view:submission`  
**Purpose:** Get all activity for a specific user

---

### 9. Get Activity Logs by Action

**GET** `/submissions/activity-log/action/:action`  
**Permission:** `view:submission`  
**Purpose:** Filter by action type (queued, processing, completed, failed)

---

### 10. Get Activity Logs by Job ID

**GET** `/submissions/activity-log/job/:job_id`  
**Permission:** `view:submission`  
**Purpose:** Get all activity for a specific job

---

### 11. Update Activity Log Status

**PATCH** `/submissions/activity-log/:id`  
**Permission:** `update:submission`  
**Purpose:** Update activity log entry  
**Request Body:**

```json
{
  "status": "resolved",
  "notes": "Issue fixed"
}
```

---

### 12. Delete Activity Log

**DELETE** `/submissions/activity-log/:id`  
**Permission:** `delete:submission`  
**Purpose:** Delete single activity log entry

---

### 13. Bulk Delete Activity Logs

**POST** `/submissions/activity-log/bulk-delete`  
**Permission:** `delete:submission`  
**Purpose:** Delete multiple activity logs  
**Request Body:**

```json
{
  "ids": ["id1", "id2", "id3"]
}
```

---

## 🎯 PERM-SPECIFIC ENDPOINTS

### 14. Submit PERM Data (Legacy)

**POST** `/perm-submissions`  
**Permission:** `create:submission`  
**Purpose:** PERM-specific submission (legacy, use `/submissions` instead)

---

### 15. Get PERM Submissions

**GET** `/perm-submissions`  
**Permission:** `view:submission`  
**Purpose:** List all PERM submissions  
**Query Params:**

- `tenant_id`
- `project_id`
- `node_id`
- `month`

---

### 16. Get PERM Submission by Node/Month

**GET** `/perm-submissions/:nodeId/:month`  
**Permission:** `view:submission`  
**Purpose:** Get specific PERM submission

---

### 17. Lock PERM Submission

**POST** `/perm-submissions/:id/lock`  
**Permission:** `update:submission`  
**Purpose:** Lock submission for editing

---

### 18. Unlock PERM Submission

**POST** `/perm-submissions/:id/unlock`  
**Permission:** `update:submission`  
**Purpose:** Unlock submission

---

### 19. Delete PERM Submission

**DELETE** `/perm-submissions/:id`  
**Permission:** `delete:submission`  
**Purpose:** Delete PERM submission

---

### 20. Validate PERM Data

**POST** `/perm-submissions/validate`  
**Permission:** `view:submission`  
**Purpose:** Validate PERM data without submitting

---

### 21. Get Compliance Summary

**GET** `/perm-submissions/compliance/summary`  
**Permission:** `view:submission`  
**Purpose:** Get overall compliance statistics

---

## 📈 ANALYTICS & REPORTING ENDPOINTS

### 22. Get Submission Summary

**GET** `/analytics/submissions/summary`  
**Permission:** `view:analytics`  
**Purpose:** Aggregated submission statistics

---

### 23. Get Submissions by Status

**GET** `/analytics/submissions/by-status`  
**Permission:** `view:analytics`

---

### 24. Get Submissions by Month

**GET** `/analytics/submissions/by-month`  
**Permission:** `view:analytics`

---

### 25. Get Compliance Rates

**GET** `/analytics/compliance/rates`  
**Permission:** `view:analytics`

---

### 26. Get Compliance by Node

**GET** `/analytics/compliance/by-node`  
**Permission:** `view:analytics`

---

## 📤 EXPORT ENDPOINTS

### 27. Export Submissions CSV

**GET** `/export/submissions/csv`  
**Permission:** `view:submission`

---

### 28. Export Submissions JSON

**GET** `/export/submissions/json`  
**Permission:** `view:submission`

---

### 29. Export Activity Logs CSV

**GET** `/export/activity-logs/csv`  
**Permission:** `view:submission`

---

### 30. Export Activity Logs JSON

**GET** `/export/activity-logs/json`  
**Permission:** `view:submission`

---

## 📊 TOTAL ENDPOINTS

| Category               | Count  | Endpoints                                                                    |
| ---------------------- | ------ | ---------------------------------------------------------------------------- |
| **Unified Submission** | 4      | POST, GET, GET/:id, POST/:id/retry                                           |
| **Activity Logs**      | 9      | GET, summary, recent, by-user, by-action, by-job, PATCH, DELETE, bulk-delete |
| **PERM Specific**      | 8      | POST, GET, GET/:id, lock, unlock, DELETE, validate, compliance               |
| **Analytics**          | 6      | summary, by-status, by-month, compliance rates, by-node                      |
| **Export**             | 4      | CSV/JSON for submissions & activity logs                                     |
| **TOTAL**              | **31** | **All submission-related endpoints**                                         |

---

## 🧪 TESTING PRIORITY

### Critical (Test First):

1. ✅ POST /submissions (submit data)
2. ✅ GET /submissions (list all)
3. ✅ GET /submissions/:id (get specific)
4. ✅ GET /submissions/activity-log/summary
5. ✅ GET /submissions/activity-log/recent

### Important (Test Next):

6. GET /submissions/activity-log
7. GET /submissions/activity-log/user/:user_id
8. GET /submissions/activity-log/action/:action
9. POST /submissions/:id/retry
10. PATCH /submissions/activity-log/:id

### Nice to Have:

11. DELETE /submissions/activity-log/:id
12. POST /submissions/activity-log/bulk-delete
13. All analytics endpoints
14. All export endpoints

---

**Ready to create comprehensive tests for all these endpoints!**
