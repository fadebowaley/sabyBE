# ✅ Unified Submission System - TODO Tracker

**Last Updated:** October 23, 2025  
**Total Tasks:** 64  
**Completed:** 0  
**In Progress:** 0  
**Pending:** 64

---

## 🚀 QUICK START

### Immediate Actions (Today)

1. [ ] Add `submit_data()` method to SabyAgentic BackendAPIClient
2. [ ] Test POST /v1/submissions with sample data
3. [ ] Test GET /v1/submissions listing
4. [ ] Verify authentication works (JWT + API Key)

---

## 📋 PHASE 1: CRITICAL FIXES (Week 1)

### 1.1 SabyAgentic Integration ⚠️ BLOCKING
**Priority:** 🔴 CRITICAL  
**Assignee:** Backend Team  
**Estimate:** 2 hours

- [ ] **Task 1.1.1:** Add `submit_data()` method to BackendAPIClient
  - **File:** `sabyAgentic/app/clients/backend_api_client.py`
  - **Location:** After line 465 (after `delete_submission` method)
  - **Requirements:**
    - Accept all required submission fields
    - Support PERM submissions
    - Add proper type hints
    - Add comprehensive docstring
    - Handle errors gracefully
  - **Code Template:**
    ```python
    async def submit_data(
        self,
        tenant_id: str,
        project_id: str,
        form_id: str,
        payload: Dict[str, Any],
        node_id: Optional[str] = None,
        user_id: Optional[str] = None,
        source: str = "agent",
        month: Optional[str] = None,
        perm_enabled: bool = False
    ) -> Dict[str, Any]:
        """Submit data to unified submission endpoint."""
        json_data = {
            "tenantId": tenant_id,
            "projectId": project_id,
            "formId": form_id,
            "payload": payload,
            "source": source,
        }
        if node_id: json_data["nodeId"] = node_id
        if user_id: json_data["userId"] = user_id
        if month: json_data["month"] = month
        if perm_enabled: json_data["perm_enabled"] = perm_enabled
        
        return await self._request("POST", "/submissions", json_data=json_data)
    ```

- [ ] **Task 1.1.2:** Add convenience method `submit_perm_data()`
  - Wrapper for PERM submissions
  - Auto-sets `perm_enabled=True`
  - Validates month and nodeId

- [ ] **Task 1.1.3:** Update agent workflows to use new method
  - Review all agents
  - Replace old submission calls
  - Test agent submissions

---

### 1.2 Form Validation Service ⚠️ HIGH PRIORITY
**Priority:** 🟠 HIGH  
**Assignee:** Backend Team  
**Estimate:** 4 hours

- [ ] **Task 1.2.1:** Create Form Validation Service
  - **File:** `sabyBackend/src/services/formValidation.service.js` (NEW)
  - **Requirements:**
    - Validate payload against ProjectForm schema
    - Check required fields
    - Validate field types
    - Check field formats (email, phone, etc.)
    - Return detailed validation errors
  - **Functions Needed:**
    ```javascript
    validateSubmissionPayload(projectForm, payload)
    checkRequiredFields(formElements, payload)
    validateFieldTypes(formElements, payload)
    validateFieldFormats(formElements, payload)
    generateValidationErrors(errors)
    ```

- [ ] **Task 1.2.2:** Add form schema caching
  - Cache ProjectForm schemas in Redis
  - TTL: 5 minutes
  - Invalidate on form update

- [ ] **Task 1.2.3:** Create validation error response format
  ```json
  {
    "success": false,
    "errors": [
      {
        "field": "email",
        "type": "format",
        "message": "Invalid email format",
        "expected": "email",
        "received": "notanemail"
      }
    ]
  }
  ```

---

### 1.3 Enhanced Submission Controller ⚠️ HIGH PRIORITY
**Priority:** 🟠 HIGH  
**Assignee:** Backend Team  
**Estimate:** 3 hours

- [ ] **Task 1.3.1:** Add form existence check
  - **File:** `sabyBackend/src/controllers/unifiedSubmission.controller.js`
  - **Location:** In `submitData()` function, before queue
  - **Check:**
    ```javascript
    const projectForm = await ProjectForm.findOne({
      projectId: submissionBody.projectId,
      tenantId: submissionBody.tenantId
    });
    
    if (!projectForm) {
      throw new ApiError(404, 'Form not found');
    }
    ```

- [ ] **Task 1.3.2:** Verify tenant ownership
  ```javascript
  if (projectForm.tenantId !== submissionBody.tenantId) {
    throw new ApiError(403, 'Form belongs to different tenant');
  }
  ```

- [ ] **Task 1.3.3:** Check form status
  ```javascript
  if (projectForm.status !== 'active') {
    throw new ApiError(400, 'Form is not active');
  }
  
  if (projectForm.metadata.deploymentStatus !== 'published') {
    throw new ApiError(400, 'Form is not published');
  }
  ```

- [ ] **Task 1.3.4:** Validate payload against form
  ```javascript
  const validationErrors = await formValidationService.validateSubmissionPayload(
    projectForm,
    submissionBody.payload
  );
  
  if (validationErrors.length > 0) {
    throw new ApiError(400, 'Validation failed', validationErrors);
  }
  ```

---

### 1.4 Form Status Validation ⚠️ MEDIUM PRIORITY
**Priority:** 🟡 MEDIUM  
**Assignee:** Backend Team  
**Estimate:** 1 hour

- [ ] **Task 1.4.1:** Verify form is published
- [ ] **Task 1.4.2:** Verify form is not archived
- [ ] **Task 1.4.3:** Return appropriate error codes

---

## 📋 PHASE 2: SYSTEMATIC TESTING (Week 1-2)

### 2.1 Test POST Routes
**Priority:** 🔴 CRITICAL  
**Assignee:** QA Team  
**Estimate:** 4 hours

- [ ] **Task 2.1.1:** Test POST /v1/submissions (Regular)
  - Valid submission
  - Invalid payload
  - Missing required fields
  - Wrong tenant
  - Inactive form
  - Unpublished form

- [ ] **Task 2.1.2:** Test POST /v1/submissions (PERM)
  - Valid PERM submission
  - Missing nodeId
  - Missing month
  - Invalid month format

- [ ] **Task 2.1.3:** Test POST /v1/submissions/:id/retry
  - Retry successful
  - Retry non-existent submission
  - Retry non-failed submission

- [ ] **Task 2.1.4:** Test POST /v1/submissions/activity-log/bulk-delete
  - Bulk delete successful
  - Invalid IDs
  - Tenant isolation

---

### 2.2 Test GET Routes
**Priority:** 🟠 HIGH  
**Assignee:** QA Team  
**Estimate:** 3 hours

- [ ] **Task 2.2.1:** Test GET /v1/submissions
  - List all submissions
  - Filter by tenant
  - Filter by project
  - Filter by status
  - Pagination works
  - Sorting works

- [ ] **Task 2.2.2:** Test GET /v1/submissions/:id
  - Get existing submission
  - Get non-existent submission
  - Tenant isolation

- [ ] **Task 2.2.3:** Test GET /v1/submissions/activity-log
  - All logs returned
  - Filtering works
  - Pagination works

- [ ] **Task 2.2.4:** Test GET /v1/submissions/activity-log/summary
  - Summary correct
  - No auth required

- [ ] **Task 2.2.5:** Test GET /v1/submissions/activity-log/recent
  - Recent logs returned
  - Time filter works

- [ ] **Task 2.2.6:** Test GET /v1/submissions/activity-log/user/:user_id
  - User logs returned
  - Tenant isolation

- [ ] **Task 2.2.7:** Test GET /v1/submissions/activity-log/action/:action
  - Action filter works
  - Valid actions only

- [ ] **Task 2.2.8:** Test GET /v1/submissions/activity-log/job/:job_id
  - Job logs returned
  - Invalid job ID handled

---

### 2.3 Test PATCH Routes
**Priority:** 🟡 MEDIUM  
**Assignee:** QA Team  
**Estimate:** 1 hour

- [ ] **Task 2.3.1:** Test PATCH /v1/submissions/activity-log/:id
  - Update successful
  - Invalid ID
  - Tenant isolation

---

### 2.4 Test DELETE Routes
**Priority:** 🟡 MEDIUM  
**Assignee:** QA Team  
**Estimate:** 1 hour

- [ ] **Task 2.4.1:** Test DELETE /v1/submissions/activity-log/:id
  - Delete successful
  - Invalid ID
  - Tenant isolation

---

### 2.5 Test Multi-Tenant Isolation
**Priority:** 🔴 CRITICAL  
**Assignee:** Security Team  
**Estimate:** 2 hours

- [ ] **Task 2.5.1:** Tenant A cannot see Tenant B submissions
- [ ] **Task 2.5.2:** Tenant A cannot submit to Tenant B forms
- [ ] **Task 2.5.3:** Activity logs properly isolated
- [ ] **Task 2.5.4:** API keys scoped to tenant

---

### 2.6 Test Authentication Methods
**Priority:** 🔴 CRITICAL  
**Assignee:** Security Team  
**Estimate:** 2 hours

- [ ] **Task 2.6.1:** Test JWT token auth
  - Valid token
  - Expired token
  - Invalid token

- [ ] **Task 2.6.2:** Test API Key auth
  - Valid API key
  - Invalid API key
  - Revoked API key

- [ ] **Task 2.6.3:** Test public form submissions
  - No auth required for public forms
  - Auth required for private forms

- [ ] **Task 2.6.4:** Test permission checks
  - `create:submission` permission
  - `view:submission` permission
  - Owner role access

---

### 2.7 Test Queue & Worker System
**Priority:** 🟠 HIGH  
**Assignee:** DevOps Team  
**Estimate:** 3 hours

- [ ] **Task 2.7.1:** Jobs queue successfully
- [ ] **Task 2.7.2:** Worker processes jobs
- [ ] **Task 2.7.3:** Failed jobs retry (3 attempts)
- [ ] **Task 2.7.4:** Activity logs at each step
  - Queued
  - Processing
  - Completed
  - Failed
- [ ] **Task 2.7.5:** Redis connection issues handled

---

### 2.8 Test PERM Auto-Detection
**Priority:** 🟠 HIGH  
**Assignee:** Backend Team  
**Estimate:** 2 hours

- [ ] **Task 2.8.1:** Detects when `month` present
- [ ] **Task 2.8.2:** Detects when `perm_enabled` true
- [ ] **Task 2.8.3:** Detects when `payload.month` exists
- [ ] **Task 2.8.4:** Validates nodeId required
- [ ] **Task 2.8.5:** Routes to PERM service
- [ ] **Task 2.8.6:** Calculates compliance correctly

---

## 📋 PHASE 3: FORM INTEGRATION (Week 2)

### 3.1 Verify ProjectForm Creation Flow
**Priority:** 🟡 MEDIUM  
**Assignee:** Frontend Team  
**Estimate:** 2 hours

- [ ] **Task 3.1.1:** User creates form in frontend
- [ ] **Task 3.1.2:** Form saved to MongoDB
- [ ] **Task 3.1.3:** projectId generated correctly
- [ ] **Task 3.1.4:** Form published successfully
- [ ] **Task 3.1.5:** Form appears in list

---

### 3.2 Test Form → Submission Flow
**Priority:** 🟠 HIGH  
**Assignee:** Full Stack Team  
**Estimate:** 3 hours

- [ ] **Task 3.2.1:** Create test form with various field types
- [ ] **Task 3.2.2:** Submit data matching form structure
- [ ] **Task 3.2.3:** Verify data saved correctly
- [ ] **Task 3.2.4:** Check validation errors work
- [ ] **Task 3.2.5:** Verify analytics updated

---

### 3.3 Test Form Field Types
**Priority:** 🟡 MEDIUM  
**Assignee:** QA Team  
**Estimate:** 4 hours

- [ ] **Task 3.3.1:** Text input
- [ ] **Task 3.3.2:** Number input
- [ ] **Task 3.3.3:** Email input (with validation)
- [ ] **Task 3.3.4:** Phone input (with format)
- [ ] **Task 3.3.5:** Date input
- [ ] **Task 3.3.6:** Select/Dropdown
- [ ] **Task 3.3.7:** Radio buttons
- [ ] **Task 3.3.8:** Checkboxes
- [ ] **Task 3.3.9:** File upload
- [ ] **Task 3.3.10:** Calculated fields

---

### 3.4 Test Form Validation Rules
**Priority:** 🟠 HIGH  
**Assignee:** QA Team  
**Estimate:** 3 hours

- [ ] **Task 3.4.1:** Required fields enforced
- [ ] **Task 3.4.2:** Min/max length validation
- [ ] **Task 3.4.3:** Email format validation
- [ ] **Task 3.4.4:** Phone format validation
- [ ] **Task 3.4.5:** Custom regex validation
- [ ] **Task 3.4.6:** Conditional field logic

---

## 📋 PHASE 4: SABYAGENTIC INTEGRATION (Week 2-3)

### 4.1 Python Client Implementation
**Priority:** 🔴 CRITICAL  
**Assignee:** SabyAgentic Team  
**Estimate:** 3 hours

- [ ] **Task 4.1.1:** Implement `submit_data()` method ✅ (Code provided above)
- [ ] **Task 4.1.2:** Implement `submit_perm_data()` convenience method
- [ ] **Task 4.1.3:** Add comprehensive docstrings
- [ ] **Task 4.1.4:** Add type hints
- [ ] **Task 4.1.5:** Add error handling
- [ ] **Task 4.1.6:** Add unit tests

---

### 4.2 Update Agent Workflows
**Priority:** 🟠 HIGH  
**Assignee:** SabyAgentic Team  
**Estimate:** 4 hours

- [ ] **Task 4.2.1:** Review all agents using submissions
- [ ] **Task 4.2.2:** Update Church Agent
- [ ] **Task 4.2.3:** Update CRM Agent
- [ ] **Task 4.2.4:** Update Finance Agent
- [ ] **Task 4.2.5:** Update HR Agent
- [ ] **Task 4.2.6:** Update Sales Agent
- [ ] **Task 4.2.7:** Test all agent submissions

---

### 4.3 Test Agent Submissions
**Priority:** 🟠 HIGH  
**Assignee:** SabyAgentic Team  
**Estimate:** 3 hours

- [ ] **Task 4.3.1:** Test from each agent type
- [ ] **Task 4.3.2:** Verify data reaches PostgreSQL
- [ ] **Task 4.3.3:** Check activity logs
- [ ] **Task 4.3.4:** Verify analytics tracking
- [ ] **Task 4.3.5:** Test error scenarios

---

### 4.4 Agent-Specific Features
**Priority:** 🟡 MEDIUM  
**Assignee:** Backend + SabyAgentic Team  
**Estimate:** 4 hours

- [ ] **Task 4.4.1:** Agent authentication
- [ ] **Task 4.4.2:** Agent-specific source tracking
- [ ] **Task 4.4.3:** Agent analytics dashboard
- [ ] **Task 4.4.4:** Agent submission quotas

---

## 📋 PHASE 5: DOCUMENTATION & MONITORING (Week 3)

### 5.1 API Documentation
**Priority:** 🟡 MEDIUM  
**Assignee:** Tech Writer  
**Estimate:** 4 hours

- [ ] **Task 5.1.1:** Document all 13 endpoints
- [ ] **Task 5.1.2:** Add request/response examples
- [ ] **Task 5.1.3:** Document error codes
- [ ] **Task 5.1.4:** Create Postman collection
- [ ] **Task 5.1.5:** Add to Swagger/OpenAPI

---

### 5.2 Integration Guides
**Priority:** 🟡 MEDIUM  
**Assignee:** Tech Writer  
**Estimate:** 6 hours

- [ ] **Task 5.2.1:** WhatsApp bot integration guide
- [ ] **Task 5.2.2:** Telegram bot integration guide
- [ ] **Task 5.2.3:** Email integration guide
- [ ] **Task 5.2.4:** Agent integration guide
- [ ] **Task 5.2.5:** Frontend integration guide

---

### 5.3 Monitoring & Alerts
**Priority:** 🟠 HIGH  
**Assignee:** DevOps Team  
**Estimate:** 4 hours

- [ ] **Task 5.3.1:** Queue depth monitoring
- [ ] **Task 5.3.2:** Failed submission alerts
- [ ] **Task 5.3.3:** Slow query alerts
- [ ] **Task 5.3.4:** Worker health checks
- [ ] **Task 5.3.5:** Redis health monitoring

---

### 5.4 Performance Optimization
**Priority:** 🟡 MEDIUM  
**Assignee:** Backend + DevOps Team  
**Estimate:** 6 hours

- [ ] **Task 5.4.1:** Add Redis caching for forms
- [ ] **Task 5.4.2:** Optimize PostgreSQL queries
- [ ] **Task 5.4.3:** Add database indexes
- [ ] **Task 5.4.4:** Monitor worker concurrency
- [ ] **Task 5.4.5:** Load testing

---

## 📋 PHASE 6: MIGRATION & CLEANUP (Week 3-4)

### 6.1 Deprecate Old Routes
**Priority:** 🟡 MEDIUM  
**Assignee:** Backend Team  
**Estimate:** 2 hours

- [ ] **Task 6.1.1:** Mark `/v1/form-submissions` deprecated
- [ ] **Task 6.1.2:** Add deprecation warnings
- [ ] **Task 6.1.3:** Set sunset date (3 months)
- [ ] **Task 6.1.4:** Notify stakeholders

---

### 6.2 Migrate Existing Data
**Priority:** 🟡 MEDIUM  
**Assignee:** Backend + DevOps Team  
**Estimate:** 8 hours

- [ ] **Task 6.2.1:** Create migration script
- [ ] **Task 6.2.2:** Move MongoDB submissions to PostgreSQL
- [ ] **Task 6.2.3:** Verify data integrity
- [ ] **Task 6.2.4:** Update foreign key references
- [ ] **Task 6.2.5:** Backup data before migration

---

### 6.3 Update Frontend
**Priority:** 🟡 MEDIUM  
**Assignee:** Frontend Team  
**Estimate:** 4 hours

- [ ] **Task 6.3.1:** Change all submission calls to `/v1/submissions`
- [ ] **Task 6.3.2:** Update error handling
- [ ] **Task 6.3.3:** Test all form submissions
- [ ] **Task 6.3.4:** Update analytics dashboards

---

### 6.4 Remove Deprecated Code
**Priority:** ⚪ LOW  
**Assignee:** Backend Team  
**Estimate:** 3 hours

- [ ] **Task 6.4.1:** Remove old submission routes
- [ ] **Task 6.4.2:** Remove old controllers
- [ ] **Task 6.4.3:** Remove old models
- [ ] **Task 6.4.4:** Clean up documentation
- [ ] **Task 6.4.5:** Remove migration scripts

---

## 📊 PROGRESS TRACKING

### By Phase
- [ ] Phase 1: Critical Fixes (0/4 tasks completed)
- [ ] Phase 2: Systematic Testing (0/8 sections completed)
- [ ] Phase 3: Form Integration (0/4 sections completed)
- [ ] Phase 4: SabyAgentic Integration (0/4 sections completed)
- [ ] Phase 5: Documentation & Monitoring (0/4 sections completed)
- [ ] Phase 6: Migration & Cleanup (0/4 sections completed)

### By Priority
- 🔴 Critical: 0 completed
- 🟠 High: 0 completed
- 🟡 Medium: 0 completed
- ⚪ Low: 0 completed

### By Team
- Backend Team: 0 tasks completed
- Frontend Team: 0 tasks completed
- SabyAgentic Team: 0 tasks completed
- QA Team: 0 tasks completed
- DevOps Team: 0 tasks completed
- Security Team: 0 tasks completed

---

## 🎯 TODAY'S FOCUS

### Must Do Today:
1. [ ] Add `submit_data()` method to SabyAgentic
2. [ ] Test POST /v1/submissions with sample data
3. [ ] Verify JWT authentication works

### Should Do Today:
4. [ ] Create form validation service skeleton
5. [ ] Add form existence check to controller
6. [ ] Test GET /v1/submissions

### Could Do Today:
7. [ ] Write first integration test
8. [ ] Update API documentation
9. [ ] Add monitoring dashboard

---

## 📅 WEEKLY MILESTONES

### Week 1 Goals:
- [ ] Complete Phase 1 (Critical Fixes)
- [ ] Complete Phase 2 (Testing) - 50%
- [ ] Start Phase 3 (Form Integration)

### Week 2 Goals:
- [ ] Complete Phase 2 (Testing) - 100%
- [ ] Complete Phase 3 (Form Integration)
- [ ] Complete Phase 4 (SabyAgentic) - 50%

### Week 3 Goals:
- [ ] Complete Phase 4 (SabyAgentic) - 100%
- [ ] Complete Phase 5 (Documentation)
- [ ] Start Phase 6 (Migration)

### Week 4 Goals:
- [ ] Complete Phase 6 (Migration)
- [ ] Final review and cleanup
- [ ] Production deployment

---

## 📝 NOTES

- Keep this document updated daily
- Mark tasks as completed with ✅
- Add blockers in comments
- Update estimates as needed
- Escalate critical issues immediately

---

**Last Updated:** October 23, 2025  
**Next Review:** Daily standup


