# 📊 Form Submission Tables - Complete Overview

**Date:** November 4, 2025  
**Database Systems:** PostgreSQL + MongoDB  
**Purpose:** Complete inventory of all submission-related storage

---

## 🗄️ POSTGRESQL TABLES (5 Base Tables + 2 Views)

### 1. **form_submissions** (PRIMARY STORAGE) ⭐

**Purpose:** Main table for storing all form submission data

**Details:**
- **Columns:** 31
- **Size:** 504 KB
- **Primary Key:** id (UUID)
- **Storage:** JSONB for flexible payload

**Structure:**
```sql
Core Fields:
- id (UUID)
- tenant_id (multi-tenant isolation)
- project_id (which form/project)
- form_id (form template reference)
- node_id (for PERM tracking)
- user_id (who submitted)
- source (web, api, whatsapp, telegram, email)
- status (submitted, completed, failed)
- data (JSONB) ← Actual form data
- meta (JSONB) ← Additional metadata
- created_at, updated_at

PERM-Specific Fields (added via migration 005):
- month, year (period tracking)
- event_compliance_percentage (0-100%)
- completeness_status (incomplete, partial, complete)
- total_events_required (calendar-based)
- total_events_submitted (actual count)
- is_locked (month-end lock)
- perm_enabled (boolean flag)

Additional Fields:
- project_name, project_category
- event_date
- validation_status, validation_errors, validation_warnings
```

**Indexes:** 15+ optimized indexes for fast queries

**Usage:** Every successful submission goes here

---

### 2. **submission_activity_log** (AUDIT TRAIL)

**Purpose:** Track every step of submission lifecycle

**Details:**
- **Columns:** 13
- **Size:** 296 KB
- **Tracks:** queued → processing → completed/failed

**Structure:**
```sql
- id (UUID)
- tenant_id, project_id, form_id
- node_id, user_id
- job_id (links to queue)
- action (queued, processing, completed, failed, rejected)
- status (success, failed, in progress, queued, rejected)
- message (details)
- created_at, updated_at
```

**Usage:** Every submission creates multiple log entries showing its journey

**Example Flow:**
```
1. action: 'queued'     status: 'queued'      message: 'Submission queued'
2. action: 'processing' status: 'in progress' message: 'Processing submission'
3. action: 'completed'  status: 'success'     message: 'Submission completed'
```

---

### 3. **form_templates** (OPTIONAL)

**Purpose:** Store reusable form templates

**Details:**
- **Columns:** 10
- **Size:** 56 KB

**Structure:**
```sql
- id, tenant_id
- template_name, description
- template_data (JSONB)
- category, tags
- created_at, updated_at
```

**Usage:** Optional - for form template library

---

### 4. **form_validation_rules** (VALIDATION)

**Purpose:** Store custom validation rules

**Details:**
- **Columns:** 11
- **Size:** 64 KB

**Structure:**
```sql
- id, tenant_id, project_id
- field_name
- rule_type (required, pattern, range, custom)
- rule_config (JSONB)
- error_message
- is_active
- created_at, updated_at
```

**Usage:** Custom validation beyond Joi schemas

---

### 5. **submission_validations** (VALIDATION RESULTS)

**Purpose:** Store validation results for submissions

**Details:**
- **Columns:** 16
- **Size:** 112 KB

**Structure:**
```sql
- id, submission_id
- tenant_id, project_id
- validation_status (passed, failed, warning)
- validation_errors (JSONB array)
- validation_warnings (JSONB array)
- validated_at, validated_by
- created_at, updated_at
```

**Usage:** Track validation history for debugging

---

### 6. **recent_submissions** (VIEW) 📊

**Purpose:** Quick access to recent submissions

**Type:** PostgreSQL VIEW (not a physical table)

**Details:**
- **Columns:** 13
- **Source:** Derived from `form_submissions`

**Likely Definition:**
```sql
CREATE VIEW recent_submissions AS
SELECT 
  id, tenant_id, project_id, form_id,
  status, source, created_at, updated_at,
  data, project_name, project_category,
  user_id, node_id
FROM form_submissions
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC;
```

**Usage:** Dashboard queries, analytics

---

### 7. **submission_stats_by_project** (VIEW) 📊

**Purpose:** Aggregated statistics per project

**Type:** PostgreSQL VIEW (not a physical table)

**Details:**
- **Columns:** 10
- **Source:** Aggregated from `form_submissions`

**Likely Definition:**
```sql
CREATE VIEW submission_stats_by_project AS
SELECT 
  tenant_id,
  project_id,
  project_name,
  COUNT(*) as total_submissions,
  COUNT(*) FILTER (WHERE status = 'completed') as completed,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(DISTINCT user_id) as unique_users,
  MIN(created_at) as first_submission,
  MAX(created_at) as latest_submission,
  AVG(event_compliance_percentage) as avg_compliance
FROM form_submissions
GROUP BY tenant_id, project_id, project_name;
```

**Usage:** Analytics, reporting, dashboards

---

## 🗄️ MONGODB COLLECTIONS (4 Collections)

### 1. **projectforms** (FORM DEFINITIONS)

**Purpose:** Store form configurations and structure

**Structure:**
```javascript
{
  projectId: "proj_abc123",
  configuration: {
    projectName: "Customer Feedback",
    projectCategory: "Surveys",
    security: "public"
  },
  elements: [
    { id: "name", type: "text", properties: {...} },
    { id: "email", type: "email", properties: {...} }
  ],
  permSettings: {
    enabled: true,
    trackingMode: "weekly",
    weeklyConfig: {...}
  },
  status: "active",
  metadata: {
    deploymentStatus: "published"
  },
  tenantId: "tenant-001",
  createdBy: ObjectId("...")
}
```

**Usage:** Form builder creates entries here

---

### 2. **projectformsubmissions** (MONGODB SUBMISSIONS)

**Purpose:** Alternative submission storage (older system)

**Structure:**
```javascript
{
  submissionId: "sub_xyz789",
  projectId: "proj_abc123",
  projectFormId: ObjectId("form-reference"),
  tenantId: "tenant-001",
  submissionData: {
    // Actual form data
    name: "John Doe",
    email: "john@example.com"
  },
  submittedBy: ObjectId("user-id"),
  submittedAt: ISODate("2025-11-04"),
  status: "submitted",
  validation: {
    isValid: true,
    errors: []
  }
}
```

**Usage:** Some routes may use this (legacy or specific features)

**⚠️ Note:** Your main submission pipeline uses PostgreSQL `form_submissions`, not this MongoDB collection

---

### 3. **userformsettings** (USER PREFERENCES)

**Purpose:** Store user-specific form preferences

**Structure:**
```javascript
{
  userId: ObjectId("user-id"),
  tenantId: "tenant-001",
  formId: ObjectId("form-id"),
  settings: {
    theme: "dark",
    defaultValues: {...},
    notifications: true
  }
}
```

**Usage:** User customization, defaults, preferences

---

### 4. **serviceforms** (SERVICE TEMPLATES)

**Purpose:** Predefined form templates for common services

**Structure:**
```javascript
{
  serviceName: "Contact Form",
  category: "Communication",
  template: {
    elements: [...],
    style: {...}
  },
  isDefault: true
}
```

**Usage:** Template library, quick form creation

---

## 📊 SUBMISSION DATA FLOW

### Current Architecture (Hybrid)

```
┌─────────────────────────────────────────────────────────────┐
│                    FORM CREATION                            │
└─────────────────────────────────────────────────────────────┘

Frontend Form Builder
   ↓
MongoDB: projectforms collection
   ↓
Stores: Form structure, elements, PERM settings
Result: Form definition saved ✅

┌─────────────────────────────────────────────────────────────┐
│                  FORM SUBMISSION                            │
└─────────────────────────────────────────────────────────────┘

User Fills Form
   ↓
POST /v1/submissions (Unified Endpoint)
   ↓
Queue to Redis (BullMQ)
   ↓
Worker Processes
   ↓
PostgreSQL: form_submissions table ← PRIMARY STORAGE
   ↓
PostgreSQL: submission_activity_log ← AUDIT TRAIL
   ↓
Result: Submission data stored ✅

Alternative Route (Some Features):
MongoDB: projectformsubmissions collection ← LEGACY/SPECIFIC
```

---

## 📋 TABLE PURPOSES SUMMARY

### PostgreSQL (Production Pipeline)

| Table | Purpose | Used For | Status |
|-------|---------|----------|--------|
| **form_submissions** | Primary submission storage | All submissions | ✅ Active |
| **submission_activity_log** | Audit trail | Debugging, monitoring | ✅ Active |
| **form_templates** | Reusable templates | Template library | ⚪ Optional |
| **form_validation_rules** | Custom validation | Advanced validation | ⚪ Optional |
| **submission_validations** | Validation history | Debugging | ⚪ Optional |
| **recent_submissions** | Quick queries | Dashboard, analytics | ✅ Active (view) |
| **submission_stats_by_project** | Aggregated stats | Reports, analytics | ✅ Active (view) |

### MongoDB (Form Definitions + Legacy)

| Collection | Purpose | Used For | Status |
|------------|---------|----------|--------|
| **projectforms** | Form definitions | Form builder, structure | ✅ Active |
| **projectformsubmissions** | Alternative storage | Legacy/specific features | ⚠️ Secondary |
| **userformsettings** | User preferences | Customization | ✅ Active |
| **serviceforms** | Template library | Quick form creation | ⚪ Optional |

---

## 🎯 WHICH TABLE IS "THE" SUBMISSION TABLE?

### PRIMARY: `form_submissions` (PostgreSQL) ⭐

**This is THE main submission table used by:**
- ✅ Unified submission endpoint (`/v1/submissions`)
- ✅ PERM submissions
- ✅ WhatsApp submissions
- ✅ Telegram submissions
- ✅ Email submissions
- ✅ API submissions
- ✅ Workers (submission.worker.js)

**Why PostgreSQL instead of MongoDB?**
1. ✅ Better for structured data with relationships
2. ✅ Superior querying (SQL vs NoSQL for complex queries)
3. ✅ JSONB gives flexibility + structure
4. ✅ Better for analytics and reporting
5. ✅ ACID transactions
6. ✅ Excellent indexing for performance

---

### SECONDARY: `projectformsubmissions` (MongoDB)

**Used by:**
- ⚠️ Some specific routes (legacy)
- ⚠️ Form builder submission features
- ⚠️ May be used for specific integrations

**Status:** Still exists but main flow uses PostgreSQL

---

## 📈 DATA DISTRIBUTION

### Current Count (Your Local DB)

**PostgreSQL:**
```
form_submissions:        0 (cleaned)
submission_activity_log: 0 (cleaned)
form_templates:          ? (check)
submission_validations:  ? (check)
```

**MongoDB:**
```
projectforms:            Multiple (your forms)
projectformsubmissions:  ? (may have legacy data)
```

---

## 🔍 SCHEMA DETAILS

### form_submissions (31 columns breakdown)

**Core Identifiers (6 columns):**
```
id, tenant_id, project_id, form_id, node_id, user_id
```

**Submission Data (4 columns):**
```
data (JSONB) ← Main payload
meta (JSONB) ← Additional metadata
source (web, api, whatsapp, etc.)
status (submitted, completed, failed)
```

**Project Info (2 columns):**
```
project_name, project_category
```

**PERM Tracking (10 columns):**
```
month, year
event_compliance_percentage
completeness_status
total_events_required
total_events_submitted
is_locked, locked_at, locked_by, lock_reason
perm_enabled
```

**Validation (3 columns):**
```
validation_status
validation_errors (JSONB)
validation_warnings (JSONB)
```

**Audit (3 columns):**
```
event_date
created_at
updated_at
```

---

## 🎯 RECOMMENDATIONS

### For Data Queries

**Use PostgreSQL `form_submissions` for:**
- ✅ Listing submissions
- ✅ Filtering by date, status, user
- ✅ PERM compliance reports
- ✅ Analytics and dashboards
- ✅ Exporting data

**Use MongoDB `projectforms` for:**
- ✅ Form structure/configuration
- ✅ Form builder operations
- ✅ Form metadata

**Use Views for:**
- ✅ `recent_submissions` - Quick dashboard queries
- ✅ `submission_stats_by_project` - Analytics

---

## 📊 SUMMARY

**Total Tables for Submissions:**

**PostgreSQL:**
- 5 base tables
- 2 views
- **Primary:** `form_submissions` ⭐

**MongoDB:**
- 4 collections
- **Primary:** `projectforms` (form definitions)
- **Secondary:** `projectformsubmissions` (legacy submissions)

**Main Submission Flow:**
```
Form Definition (MongoDB: projectforms)
   ↓
User Submission (API: POST /v1/submissions)
   ↓
Submission Data (PostgreSQL: form_submissions) ← PRIMARY
   ↓
Activity Log (PostgreSQL: submission_activity_log) ← AUDIT
```

**Answer:** You have **1 primary submission table** (`form_submissions` in PostgreSQL) and 1 secondary (`projectformsubmissions` in MongoDB for specific features).

---

**Created:** November 4, 2025  
**Status:** Complete inventory  
**Primary Table:** form_submissions (PostgreSQL)

