# 🚀 Unified Submission System - Quick Start Guide

**For:** Developers integrating with the unified submission endpoint  
**Last Updated:** October 23, 2025

---

## ⚡ TL;DR

```bash
# Submit data to the unified endpoint
POST /v1/submissions

# Required fields:
- tenantId
- projectId  
- formId
- payload (your form data)

# Returns: jobId for tracking
```

---

## 📍 BASE URL

**Local:** `http://localhost:4000/v1`  
**Staging:** `http://172.178.36.50:4000/v1`  
**Production:** `https://api.saby.ai/v1`

---

## 🔐 AUTHENTICATION

### Option 1: JWT Token (Recommended)
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:4000/v1/submissions
```

### Option 2: API Key
```bash
curl -H "X-API-Key: YOUR_API_KEY" \
  http://localhost:4000/v1/submissions
```

### Option 3: Public Forms (No Auth)
```bash
# For forms with security: "public"
curl -X POST http://localhost:4000/v1/submissions \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

---

## 📤 SUBMIT DATA

### Regular Submission

```bash
curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-001",
    "projectId": "proj_abc123",
    "formId": "form_xyz789",
    "payload": {
      "name": "John Doe",
      "email": "john@example.com",
      "age": 30,
      "newsletter": true
    },
    "source": "api"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Submission queued for processing",
  "jobId": "tenant-001-1729700000000",
  "status": "queued",
  "type": "regular"
}
```

---

### PERM Submission (Church Events)

```bash
curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "tenant-001",
    "projectId": "proj_perm_001",
    "formId": "form_perm_events",
    "nodeId": "node_church_001",
    "month": "2025-10",
    "payload": {
      "sundayService": true,
      "bibleStudy": true,
      "prayerMeeting": false,
      "youthService": true
    },
    "source": "api",
    "perm_enabled": true
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Submission queued for processing",
  "jobId": "tenant-001-1729700000001",
  "status": "queued",
  "type": "perm",
  "month": "2025-10",
  "nodeId": "node_church_001"
}
```

---

## 📥 GET SUBMISSIONS

### List All Submissions

```bash
curl -X GET "http://localhost:4000/v1/submissions?tenant_id=tenant-001&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "uuid-1",
      "tenant_id": "tenant-001",
      "project_id": "proj_abc123",
      "form_id": "form_xyz789",
      "data": { "name": "John Doe", "email": "john@example.com" },
      "status": "submitted",
      "source": "api",
      "created_at": "2025-10-23T10:00:00Z"
    }
  ],
  "count": 1
}
```

---

### Get Submission by ID

```bash
curl -X GET http://localhost:4000/v1/submissions/uuid-1 \
  -H "Authorization: Bearer $TOKEN"
```

---

### Filter Submissions

```bash
# By project
GET /v1/submissions?tenant_id=tenant-001&project_id=proj_abc123

# By status
GET /v1/submissions?tenant_id=tenant-001&status=submitted

# By source
GET /v1/submissions?tenant_id=tenant-001&source=whatsapp

# Multiple filters
GET /v1/submissions?tenant_id=tenant-001&project_id=proj_abc123&status=submitted&limit=20
```

---

## 🔄 RETRY FAILED SUBMISSION

```bash
curl -X POST http://localhost:4000/v1/submissions/uuid-1/retry \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Submission retried successfully",
  "jobId": "tenant-001-1729700000002",
  "retriedSubmissionId": "uuid-1"
}
```

---

## 📊 ACTIVITY LOGS

### Get All Activity Logs

```bash
curl -X GET "http://localhost:4000/v1/submissions/activity-log?tenantId=tenant-001&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "log-1",
      "tenant_id": "tenant-001",
      "project_id": "proj_abc123",
      "action": "queued",
      "status": "queued",
      "job_id": "tenant-001-1729700000000",
      "message": "Submission queued for processing",
      "created_at": "2025-10-23T10:00:00Z"
    }
  ],
  "total": 1
}
```

---

### Get Recent Activity

```bash
GET /v1/submissions/activity-log/recent?tenantId=tenant-001
```

---

### Get Activity by User

```bash
GET /v1/submissions/activity-log/user/user-123?tenant_id=tenant-001
```

---

### Get Activity by Action

```bash
GET /v1/submissions/activity-log/action/queued?tenant_id=tenant-001
```

---

### Get Activity by Job ID

```bash
GET /v1/submissions/activity-log/job/tenant-001-1729700000000
```

---

## 🧪 TESTING CHECKLIST

```bash
# 1. Test regular submission
✅ POST /v1/submissions with valid data
✅ Verify 202 Accepted response
✅ Check jobId returned

# 2. Test PERM submission
✅ POST with month and nodeId
✅ Verify type: "perm" in response
✅ Check compliance calculated

# 3. Test listing
✅ GET /v1/submissions
✅ Verify pagination works
✅ Check filtering works

# 4. Test activity logs
✅ GET /v1/submissions/activity-log
✅ Verify logs created
✅ Check job tracking

# 5. Test errors
✅ Missing required fields → 400
✅ Invalid form → 404
✅ Wrong tenant → 403
✅ Invalid token → 401
```

---

## 🐍 PYTHON CLIENT (SabyAgentic)

### Installation

```python
from app.clients.backend_api_client import SabyBackendClient

client = SabyBackendClient(
    base_url="http://localhost:4000/v1",
    api_token="your_jwt_token"
)
```

---

### Submit Data

```python
# Regular submission
result = await client.submit_data(
    tenant_id="tenant-001",
    project_id="proj_abc123",
    form_id="form_xyz789",
    payload={
        "name": "John Doe",
        "email": "john@example.com",
        "age": 30
    },
    source="agent"
)

print(f"Job ID: {result['jobId']}")
```

---

### PERM Submission

```python
# PERM submission
result = await client.submit_data(
    tenant_id="tenant-001",
    project_id="proj_perm_001",
    form_id="form_perm_events",
    payload={
        "sundayService": True,
        "bibleStudy": True,
        "prayerMeeting": False
    },
    node_id="node_church_001",
    month="2025-10",
    perm_enabled=True,
    source="agent"
)
```

---

### Get Submissions

```python
# List submissions
submissions = await client.get_submissions(
    tenant_id="tenant-001",
    project_id="proj_abc123",
    status="submitted",
    limit=10
)

for submission in submissions['results']:
    print(f"Submission {submission['id']}: {submission['status']}")
```

---

## 🌐 JAVASCRIPT/TYPESCRIPT (Frontend)

### Axios Example

```typescript
import axios from 'axios';

const API_BASE = 'http://localhost:4000/v1';

// Submit data
const submitForm = async (formData: any) => {
  const response = await axios.post(
    `${API_BASE}/submissions`,
    {
      tenantId: 'tenant-001',
      projectId: 'proj_abc123',
      formId: 'form_xyz789',
      payload: formData,
      source: 'web'
    },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.data;
};

// Get submissions
const getSubmissions = async () => {
  const response = await axios.get(
    `${API_BASE}/submissions?tenant_id=tenant-001`,
    {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    }
  );
  
  return response.data.results;
};
```

---

## 🤖 WHATSAPP BOT EXAMPLE

```javascript
// In WhatsApp handler
const { formData } = session;

const submissionResponse = await axios.post(
  `${process.env.API_URL}/v1/submissions`,
  {
    tenantId: session.tenantId,
    projectId: session.projectId,
    formId: session.formId,
    payload: formData,
    userId: session.userId,
    source: 'whatsapp',
    meta: {
      phone: session.phoneNumber,
      platform: 'whatsapp'
    }
  },
  {
    headers: {
      'Authorization': `Bearer ${process.env.API_TOKEN}`
    }
  }
);

console.log(`Submission queued: ${submissionResponse.data.jobId}`);
```

---

## 📧 EMAIL INTEGRATION EXAMPLE

```javascript
// Parse email and submit
const submissionData = {
  tenantId: emailConfig.tenantId,
  projectId: emailConfig.projectId,
  formId: emailConfig.formId,
  payload: parsedEmailData,
  source: 'email',
  meta: {
    from: email.from,
    subject: email.subject,
    receivedAt: email.timestamp
  }
};

await axios.post(
  `${API_URL}/v1/submissions`,
  submissionData,
  { headers: { 'Authorization': `Bearer ${API_TOKEN}` } }
);
```

---

## ⚙️ ENVIRONMENT VARIABLES

```bash
# .env file
API_URL=http://localhost:4000/v1
API_TOKEN=your_jwt_token_here
TENANT_ID=tenant-001
```

---

## ❌ ERROR HANDLING

### Common Errors

| Status | Error | Cause | Solution |
|--------|-------|-------|----------|
| 400 | Missing required fields | Missing tenantId, projectId, formId, or payload | Check request body |
| 401 | Unauthorized | Invalid or missing token | Check authentication |
| 403 | Forbidden | Wrong tenant or inactive form | Check tenant ownership |
| 404 | Form not found | Invalid projectId or formId | Verify form exists |
| 500 | Internal server error | Server issue | Check logs, retry |

---

### Error Response Format

```json
{
  "success": false,
  "message": "Missing required fields: tenantId, projectId, formId, payload",
  "status": 400
}
```

---

## 📈 MONITORING

### Check Job Status

```bash
# Get activity logs for a job
GET /v1/submissions/activity-log/job/tenant-001-1729700000000
```

**Possible Statuses:**
- `queued` - Submission in queue
- `in progress` - Worker processing
- `success` - Completed successfully
- `failed` - Processing failed

---

### Health Check

```bash
curl http://localhost:4000/health
```

---

## 🔍 DEBUGGING

### Enable Debug Logs

```bash
# In .env
DEBUG=true
LOG_LEVEL=debug
```

### Check Backend Logs

```bash
# Docker logs
docker logs halo-backend --tail 100 -f

# PM2 logs
pm2 logs backend
```

### Check Worker Logs

```bash
# Worker logs
docker logs halo-worker --tail 100 -f
```

### Check Redis Queue

```bash
# Connect to Redis
docker exec -it redis redis-cli

# Check queue
LLEN submissionQueue
LRANGE submissionQueue 0 -1
```

---

## 📚 ADDITIONAL RESOURCES

- **Full Investigation Report:** `UNIFIED_SUBMISSION_INVESTIGATION_REPORT.md`
- **TODO Tracker:** `UNIFIED_SUBMISSION_TODO_TRACKER.md`
- **Architecture Docs:** `SYSTEM_ARCHITECTURE_FLOW.md`
- **API Documentation:** Swagger UI at `/api-docs`

---

## 🆘 SUPPORT

### Report Issues
- GitHub: Create issue in repository
- Slack: #backend-support channel
- Email: dev-support@saby.ai

### Ask Questions
- Documentation: Check guides first
- Team: Ask in #dev-general
- Office Hours: Every Tuesday 2-3 PM

---

**END OF QUICK START GUIDE**

**Need help?** Check the full investigation report or reach out to the team!


