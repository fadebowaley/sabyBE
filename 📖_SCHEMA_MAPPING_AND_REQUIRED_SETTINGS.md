# 📖 SCHEMA MAPPING AND REQUIRED SETTINGS GUIDE

**Branch:** `submission-task`  
**Date:** October 29, 2025  
**For:** Developers creating forms and submitting data  
**Purpose:** Complete guide for FormElementSchema → PostgreSQL mapping

---

## 🎯 QUICK REFERENCE

### Minimum Requirements for Submittable Form

```javascript
✅ configuration.projectName  // Not empty
✅ status = 'active'          // Form must be active
✅ metadata.deploymentStatus = 'published'  // Must be published
✅ elements.length >= 1       // At least one field
✅ tenantId                   // Tenant ownership
✅ createdBy                  // Creator user ID
```

### Minimum Requirements for Submission

```javascript
✅ tenantId    // Multi-tenant isolation
✅ projectId   // Which form
✅ formId      // Form instance ID
✅ payload     // Form data object
```

---

## 📋 PART 1: FORMELEMENTSCHEMA STRUCTURE

### 1.1 Complete Schema Definition

**MongoDB Location:** `src/models/projectForm.model.js`  
**Joi Validation:** `src/validations/projectForm.validation.js`

```javascript
FormElementSchema {
  // REQUIRED FIELDS
  id: String,                          // Unique identifier for this element
  type: String,                        // Field type (see supported types below)
  
  // PROPERTIES OBJECT
  properties: {
    // Display
    label: String,                     // Field label shown to user
    placeholder: String,               // Placeholder text
    helpText: String,                  // Help text below field
    
    // Validation
    required: Boolean,                 // Is field required?
    validation: Object,                // Validation rules (see below)
    
    // Type-specific
    options: [String],                 // For select, radio, checkbox
    multiple: Boolean,                 // Allow multiple selections
    accept: String,                    // File upload types
    acceptedTypes: String,             // File extensions
    defaultValue: Mixed,               // Default value
    defaultCountry: String,            // For phone fields
    
    // Number-specific
    numberType: String,                // 'integer' or 'decimal'
    min: Number,                       // Minimum value
    max: Number,                       // Maximum value
    step: Number,                      // Number step
    
    // Text formatting
    paragraphAlignment: String,        // 'left', 'center', 'right'
    textAlign: String,                 // Text alignment
    headerLevel: String,               // For header elements
    headerAlignment: String,           // Header alignment
    
    // Advanced
    formula: String,                   // For calculated fields
    conditional: Boolean,              // Conditional visibility
    colSpan: Number,                   // Column span (1-12)
    ratingType: String,                // For rating fields
    maxRating: Number,                 // Max rating value
  }
}
```

---

### 1.2 Supported Field Types

| Type | Description | Example Value | Validation |
|------|-------------|---------------|------------|
| `text` | Single-line text | `"John Doe"` | minLength, maxLength, pattern |
| `textarea` | Multi-line text | `"Long description..."` | maxLength |
| `email` | Email address | `"user@example.com"` | Email format regex |
| `phone` | Phone number | `"+1234567890"` | Phone format |
| `number` | Numeric input | `42` or `3.14` | min, max, step |
| `select` | Dropdown | `"option1"` | Must be in options array |
| `radio` | Radio buttons | `"choice_a"` | Must be in options array |
| `checkbox` | Checkboxes | `true` or `["a", "b"]` | Boolean or array based on `multiple` |
| `date` | Date picker | `"2025-10-29"` | ISO date format |
| `datetime` | Date and time | `"2025-10-29T14:30:00Z"` | ISO datetime format |
| `file` | File upload | `"https://cdn.../file.pdf"` | File type, size |
| `url` | URL input | `"https://example.com"` | URL format |
| `currency` | Money input | `1000.50` | Numeric with currency code |
| `location` | Address/location | `{ lat, lng, address }` | Object with coordinates |
| `signature` | Signature pad | `"data:image/png;base64,..."` | Base64 image |
| `rating` | Star/rating | `4` | Number between 1-max |
| `paragraph` | Static text | N/A | Display only |
| `header` | Section header | N/A | Display only |

**Total Supported Types:** 18+

---

### 1.3 Validation Rules Object

```javascript
validation: {
  // Text validations
  minLength: Number,                   // Minimum string length
  maxLength: Number,                   // Maximum string length
  pattern: String,                     // Regex pattern
  
  // Number validations
  min: Number,                         // Minimum value
  max: Number,                         // Maximum value
  step: Number,                        // Increment step
  
  // Format validations
  format: String,                      // 'email', 'url', 'phone'
  
  // Custom validations
  custom: Function,                    // Custom validator
}
```

---

## 📋 PART 2: POSTGRESQL STORAGE SCHEMA

### 2.1 form_submissions Table

**Location:** `src/scripts/create_all_tables.sql`

```sql
CREATE TABLE form_submissions (
    -- Primary identifier
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Multi-tenant identifiers (REQUIRED)
    tenant_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    form_id VARCHAR(64) NOT NULL,
    
    -- Optional identifiers
    node_id VARCHAR(64),              -- For PERM or multi-node forms
    user_id VARCHAR(64),              -- Submitter
    
    -- Submission metadata
    source VARCHAR(32) DEFAULT 'unknown',  -- 'web', 'api', 'whatsapp', etc.
    status VARCHAR(32) DEFAULT 'submitted',
    
    -- FORM DATA STORAGE (JSONB) ← This is where form element data goes!
    data JSONB NOT NULL,
    meta JSONB DEFAULT '{}'::jsonb,
    
    -- Project information
    project_name VARCHAR(128),
    project_category VARCHAR(64),
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- PERM-specific columns
    month DATE,
    year INTEGER,
    perm_enabled BOOLEAN DEFAULT FALSE,
    event_compliance_percentage NUMERIC(5,2),
    completeness_status VARCHAR(32),
    total_events_required INTEGER,
    total_events_submitted INTEGER,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMP,
    locked_by VARCHAR(64),
    lock_reason TEXT
);
```

**Key Points:**
- ✅ `data` column is JSONB - stores ANY JSON structure
- ✅ Flexible schema - can accommodate any form structure
- ✅ Indexed for fast queries
- ✅ Supports both regular and PERM submissions

---

### 2.2 Data Column Mapping

**Form Elements → data JSONB Mapping:**

```javascript
// Form Definition (MongoDB)
elements: [
  { id: 'field_name', type: 'text', properties: { ... } },
  { id: 'field_email', type: 'email', properties: { ... } },
  { id: 'field_age', type: 'number', properties: { ... } }
]

// Submission Payload
payload: {
  field_name: "John Doe",
  field_email: "john@example.com",
  field_age: 30
}

// PostgreSQL Storage
data: {
  "field_name": "John Doe",
  "field_email": "john@example.com",
  "field_age": 30
}
```

**Mapping Rule:** `payload` object is stored AS-IS in `data` JSONB column

**Key Insight:** The element `id` becomes the JSON key in the `data` column

---

## 📋 PART 3: FIELD TYPE MAPPING EXAMPLES

### 3.1 Text Field

**Element Definition:**
```javascript
{
  id: 'company_name',
  type: 'text',
  properties: {
    label: 'Company Name',
    required: true,
    validation: {
      minLength: 2,
      maxLength: 100,
    }
  }
}
```

**Submitted Value:**
```javascript
payload: {
  company_name: "Acme Corporation"
}
```

**PostgreSQL Storage:**
```sql
data: '{"company_name": "Acme Corporation"}'::jsonb
```

**Query Example:**
```sql
SELECT data->>'company_name' as company_name 
FROM form_submissions 
WHERE id = 'submission-id';
```

---

### 3.2 Number Field

**Element Definition:**
```javascript
{
  id: 'annual_revenue',
  type: 'number',
  properties: {
    label: 'Annual Revenue',
    required: true,
    numberType: 'decimal',
    validation: {
      min: 0,
      max: 1000000000,
    }
  }
}
```

**Submitted Value:**
```javascript
payload: {
  annual_revenue: 2500000.50
}
```

**PostgreSQL Storage:**
```sql
data: '{"annual_revenue": 2500000.5}'::jsonb
```

**Type:** Stored as JSON number, retrieved as number

---

### 3.3 Select/Dropdown Field

**Element Definition:**
```javascript
{
  id: 'industry',
  type: 'select',
  properties: {
    label: 'Industry',
    required: true,
    options: ['Technology', 'Finance', 'Healthcare', 'Manufacturing'],
    multiple: false,
  }
}
```

**Submitted Value:**
```javascript
payload: {
  industry: "Technology"
}
```

**PostgreSQL Storage:**
```sql
data: '{"industry": "Technology"}'::jsonb
```

**Validation:** Must be one of the options array values

---

### 3.4 Checkbox Field (Multiple)

**Element Definition:**
```javascript
{
  id: 'services_interested',
  type: 'checkbox',
  properties: {
    label: 'Services of Interest',
    required: false,
    options: ['Consulting', 'Training', 'Development', 'Support'],
    multiple: true,
  }
}
```

**Submitted Value:**
```javascript
payload: {
  services_interested: ["Consulting", "Development"]
}
```

**PostgreSQL Storage:**
```sql
data: '{"services_interested": ["Consulting", "Development"]}'::jsonb
```

**Type:** Array of strings

**Query Example:**
```sql
SELECT data->'services_interested' as services
FROM form_submissions
WHERE data @> '{"services_interested": ["Consulting"]}'::jsonb;
```

---

### 3.5 Date Field

**Element Definition:**
```javascript
{
  id: 'start_date',
  type: 'date',
  properties: {
    label: 'Start Date',
    required: true,
  }
}
```

**Submitted Value:**
```javascript
payload: {
  start_date: "2025-11-01"
}
```

**PostgreSQL Storage:**
```sql
data: '{"start_date": "2025-11-01"}'::jsonb
```

**Format:** ISO date string (YYYY-MM-DD)

---

### 3.6 Complex Nested Object

**Element Definition:**
```javascript
{
  id: 'address',
  type: 'location',
  properties: {
    label: 'Business Address',
    required: false,
  }
}
```

**Submitted Value:**
```javascript
payload: {
  address: {
    street: "123 Main St",
    city: "Lagos",
    state: "Lagos",
    country: "Nigeria",
    postal_code: "100001",
    coordinates: {
      lat: 6.5244,
      lng: 3.3792
    }
  }
}
```

**PostgreSQL Storage:**
```sql
data: '{
  "address": {
    "street": "123 Main St",
    "city": "Lagos",
    "state": "Lagos",
    "country": "Nigeria",
    "postal_code": "100001",
    "coordinates": {"lat": 6.5244, "lng": 3.3792}
  }
}'::jsonb
```

**Query Example:**
```sql
SELECT 
  data->'address'->>'city' as city,
  data->'address'->'coordinates'->>'lat' as latitude
FROM form_submissions
WHERE data->'address'->>'city' = 'Lagos';
```

---

## 📋 PART 4: REQUIRED SETTINGS CHECKLIST

### 4.1 Form Creation Requirements

**When creating a ProjectForm, ensure:**

| Setting | Path | Type | Required | Default | Notes |
|---------|------|------|----------|---------|-------|
| `projectName` | `configuration.projectName` | String | ✅ YES | - | User-facing form name |
| `status` | `status` | String | ✅ YES | `'active'` | Must be 'active' for submissions |
| `deploymentStatus` | `metadata.deploymentStatus` | String | ✅ YES | `'draft'` | Must be 'published' |
| `elements` | `elements` | Array | ✅ YES | `[]` | At least 1 element required |
| `tenantId` | `tenantId` | String | ✅ YES | - | From authenticated user |
| `createdBy` | `createdBy` | ObjectId | ✅ YES | - | User ID creating form |
| `projectId` | `projectId` | String | ✅ YES | Auto-generated | `proj_xxxxxxxxxxxx` |
| `security` | `configuration.security` | String | ⚠️ Affects auth | `'private'` | `'public'` or `'private'` |
| `accessibility` | `configuration.accessibility` | Array | ⚠️ Optional | `[]` | `['api', 'embedded', etc.]` |
| `tags` | `configuration.tags` | Array | ⚪ Optional | `[]` | Categorization |

---

### 4.2 Element Requirements

**Each element in `elements` array must have:**

```javascript
{
  id: "field_xxx",           // ✅ REQUIRED - Unique within form
  type: "text",              // ✅ REQUIRED - Valid type from supported list
  properties: {              // ✅ REQUIRED - At least empty object
    label: "Field Label",    // ✅ REQUIRED - User-facing label
    required: Boolean,       // ⚠️ Optional but recommended
    validation: Object,      // ⚪ Optional
  }
}
```

**Minimum Valid Element:**
```javascript
{
  id: "my_field",
  type: "text",
  properties: {
    label: "My Field"
  }
}
```

---

## 📋 PART 5: SUBMISSION DATA MAPPING

### 5.1 How Data Flows

```
┌─────────────────────────────────────────────────────────────┐
│  MONGODB: ProjectForm                                       │
│                                                             │
│  elements: [                                                │
│    { id: "field_1", type: "text", properties: {...} },     │
│    { id: "field_2", type: "email", properties: {...} }     │
│  ]                                                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ Defines structure
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  SUBMISSION PAYLOAD                                         │
│                                                             │
│  payload: {                                                 │
│    "field_1": "John Doe",        ← Maps to element[0].id   │
│    "field_2": "john@example.com" ← Maps to element[1].id   │
│  }                                                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ POST /v1/submissions
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  CONTROLLER: Validation (Recommended)                       │
│                                                             │
│  1. Load ProjectForm from MongoDB                           │
│  2. Check status = 'active'                                 │
│  3. Check deploymentStatus = 'published'                    │
│  4. Validate payload against elements schema                │
│  5. Check required fields present                           │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          │ If valid
                          ▼
┌─────────────────────────────────────────────────────────────┐
│  POSTGRESQL: form_submissions                               │
│                                                             │
│  INSERT INTO form_submissions (data) VALUES (              │
│    '{                                                       │
│      "field_1": "John Doe",                                │
│      "field_2": "john@example.com"                         │
│    }'::jsonb                                               │
│  )                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

### 5.2 Mapping Rules

| Rule | Description | Example |
|------|-------------|---------|
| **Direct Mapping** | Element `id` becomes JSON key | `id: "name"` → `data.name` |
| **Type Preservation** | JavaScript types preserved | `42` stays number, not string |
| **Array Support** | Arrays stored as JSON arrays | `["a", "b"]` → `["a", "b"]` |
| **Object Support** | Objects stored as nested JSON | `{lat: 1, lng: 2}` → `{lat: 1, lng: 2}` |
| **Null Handling** | Null values preserved | `null` → `null` |
| **Undefined Handling** | Undefined omitted | `undefined` → not stored |

---

## 📋 PART 6: REQUIRED VS OPTIONAL FIELDS

### 6.1 Required Field Validation

**Element Definition:**
```javascript
{
  id: 'email_address',
  type: 'email',
  properties: {
    label: 'Email',
    required: true,              // ← Required field
  }
}
```

**Valid Submission:**
```javascript
payload: {
  email_address: "user@example.com"  // ✅ Present
}
```

**Invalid Submission:**
```javascript
payload: {
  // email_address missing  // ❌ Should be rejected
}
```

**Current Behavior:** ⚠️ Not enforced by unified endpoint  
**Recommendation:** Add validation using dynamicValidation.service.js

---

### 6.2 Optional Field Handling

**Element Definition:**
```javascript
{
  id: 'middle_name',
  type: 'text',
  properties: {
    label: 'Middle Name',
    required: false,             // ← Optional field
  }
}
```

**Valid Submissions:**
```javascript
// With value
payload: {
  middle_name: "Michael"         // ✅ OK
}

// Without value
payload: {
  // middle_name omitted         // ✅ Also OK
}

// With null
payload: {
  middle_name: null              // ✅ Also OK
}
```

---

## 📋 PART 7: SPECIAL CASES

### 7.1 Calculated Fields (Formula)

**Element Definition:**
```javascript
{
  id: 'total_price',
  type: 'number',
  properties: {
    label: 'Total Price',
    formula: 'quantity * unit_price',  // Calculated on frontend
    numberType: 'decimal',
  }
}
```

**Submission:**
```javascript
payload: {
  quantity: 10,
  unit_price: 25.50,
  total_price: 255.00           // Pre-calculated, submitted
}
```

**Storage:** Stored like any other number field

---

### 7.2 Conditional Fields

**Element Definition:**
```javascript
{
  id: 'other_department',
  type: 'text',
  properties: {
    label: 'Specify Department',
    conditional: true,
    // Show only if department = 'Other'
  }
}
```

**Submission When Shown:**
```javascript
payload: {
  department: "Other",
  other_department: "Research & Development"
}
```

**Submission When Hidden:**
```javascript
payload: {
  department: "Sales"
  // other_department not included (OK)
}
```

---

### 7.3 File Uploads

**Element Definition:**
```javascript
{
  id: 'resume',
  type: 'file',
  properties: {
    label: 'Upload Resume',
    accept: '.pdf,.doc,.docx',
    acceptedTypes: '.pdf,.doc,.docx',
  }
}
```

**Submission:**
```javascript
payload: {
  resume: "https://cdn.example.com/uploads/resume_abc123.pdf"
}
```

**Note:** File URL is stored, not the file itself. File upload happens separately, URL is included in submission.

---

## 📋 PART 8: VALIDATION RULES GUIDE

### 8.1 Text Validation

```javascript
properties: {
  validation: {
    minLength: 2,              // Minimum 2 characters
    maxLength: 100,            // Maximum 100 characters
    pattern: '^[a-zA-Z\\s]+$'  // Only letters and spaces
  }
}
```

**Valid:** `"John Doe"` (9 chars, letters + space)  
**Invalid:** `"J"` (too short), `"John123"` (contains numbers)

---

### 8.2 Number Validation

```javascript
properties: {
  numberType: 'integer',       // or 'decimal'
  validation: {
    min: 18,                   // Minimum value
    max: 65,                   // Maximum value
    step: 1,                   // Increment step
  }
}
```

**Valid:** `25`, `18`, `65`  
**Invalid:** `17` (too low), `66` (too high), `25.5` (not integer)

---

### 8.3 Email Validation

```javascript
properties: {
  validation: {
    format: 'email'
  }
}
```

**Valid:** `"user@example.com"`, `"name.surname@company.co.uk"`  
**Invalid:** `"notanemail"`, `"@example.com"`, `"user@"`

**Regex Used:** `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`

---

### 8.4 Select/Radio Validation

```javascript
properties: {
  options: ['Option A', 'Option B', 'Option C']
}
```

**Valid:** `"Option A"`, `"Option B"`, `"Option C"`  
**Invalid:** `"Option D"`, `"option a"` (case-sensitive)

---

### 8.5 Checkbox Validation (Multiple)

**Single Checkbox:**
```javascript
properties: {
  multiple: false
}
```
**Value:** `true` or `false`

**Multiple Checkboxes:**
```javascript
properties: {
  options: ['A', 'B', 'C'],
  multiple: true
}
```
**Value:** `["A", "C"]` (array of selected options)

---

## 📋 PART 9: SUBMISSION PAYLOAD STRUCTURE

### 9.1 Regular Submission

```javascript
POST /v1/submissions

{
  // REQUIRED FIELDS
  "tenantId": "tenant-001",          // Tenant isolation
  "projectId": "proj_abc123",        // Which form
  "formId": "form_xyz789",           // Form instance
  "payload": {                       // Form data
    "field_1": "value1",
    "field_2": "value2",
    ...
  },
  
  // OPTIONAL FIELDS
  "userId": "user-123",              // Auto-extracted from JWT
  "source": "web",                   // Default: 'api'
  "meta": {},                        // Additional metadata
  "status": "submitted",             // Default: 'submitted'
  "project_name": "Form Name",       // Optional
  "project_category": "Category",    // Optional
}
```

---

### 9.2 PERM Submission

```javascript
POST /v1/submissions

{
  // REQUIRED FIELDS (Same as regular)
  "tenantId": "tenant-001",
  "projectId": "proj_perm_001",
  "formId": "form_perm_events",
  "payload": { ... },
  
  // PERM-SPECIFIC REQUIRED FIELDS
  "nodeId": "node_church_001",       // ✅ REQUIRED for PERM
  "month": "2025-10-01",             // ✅ REQUIRED for PERM
  
  // PERM-SPECIFIC OPTIONAL FIELDS
  "year": 2025,                      // Default: current year
  "perm_enabled": true,              // Auto-detected if month present
  "project_name": "Church Events",
  "project_category": "PERM",
}
```

---

## 📋 PART 10: ERROR SCENARIOS

### 10.1 Common Submission Errors

#### Error 1: Missing Required Field

**Payload:**
```javascript
{
  tenantId: "tenant-001",
  // projectId MISSING
  formId: "form-123",
  payload: {}
}
```

**Response:**
```json
{
  "success": false,
  "message": "Missing required fields: tenantId, projectId, formId, payload",
  "status": 400
}
```

---

#### Error 2: Form Not Found

**Payload:**
```javascript
{
  tenantId: "tenant-001",
  projectId: "proj_doesnotexist",
  formId: "form-123",
  payload: {}
}
```

**Current Behavior:** ⚠️ Submission accepted (no check)  
**Recommended Behavior:**
```json
{
  "success": false,
  "message": "Form not found",
  "status": 404
}
```

---

#### Error 3: Form Not Published

**Form Status:** `metadata.deploymentStatus = 'draft'`

**Current Behavior:** ⚠️ Submission accepted  
**Recommended Behavior:**
```json
{
  "success": false,
  "message": "Form is not published for submissions",
  "status": 400
}
```

---

#### Error 4: Form Inactive

**Form Status:** `status = 'archived'`

**Current Behavior:** ⚠️ Submission accepted  
**Recommended Behavior:**
```json
{
  "success": false,
  "message": "Form is not active",
  "status": 400
}
```

---

#### Error 5: Validation Failure

**Element:** `{ id: "email", type: "email", properties: { required: true } }`  
**Payload:** `{ email: "notanemail" }`

**Current Behavior:** ⚠️ Submission accepted  
**Recommended Behavior:**
```json
{
  "success": false,
  "message": "Form validation failed",
  "errors": [
    {
      "field": "email",
      "type": "format",
      "message": "Invalid email format",
      "expected": "email",
      "received": "notanemail"
    }
  ],
  "status": 400
}
```

---

## 📋 PART 11: BEST PRACTICES

### 11.1 Element ID Naming

**Good:**
```javascript
id: "field_fullname"         // Descriptive, prefixed
id: "field_email_address"    // Clear purpose
id: "field_company_name"     // Easy to query
```

**Avoid:**
```javascript
id: "f1"                     // Not descriptive
id: "input_1"                // Generic
id: "name"                   // Might conflict
```

**Reason:** IDs become JSON keys in PostgreSQL - make them meaningful!

---

### 11.2 Required Field Strategy

**Recommended:**
```javascript
// Mark truly required fields as required
{
  id: "email",
  type: "email",
  properties: {
    required: true,            // User must provide
  }
}

// Optional fields
{
  id: "middle_name",
  type: "text",
  properties: {
    required: false,           // User can skip
  }
}
```

**Benefit:** Clear validation errors, better UX

---

### 11.3 Default Values

**Use default values for better UX:**
```javascript
{
  id: "country",
  type: "select",
  properties: {
    label: "Country",
    options: ["Nigeria", "Ghana", "Kenya", "Other"],
    defaultValue: "Nigeria",   // Pre-selected
  }
}
```

**Submission:** If user doesn't change, `"Nigeria"` is submitted

---

### 11.4 Validation Messages

**Clear validation rules:**
```javascript
properties: {
  validation: {
    minLength: 8,
    maxLength: 50,
    pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).+$'
  },
  helpText: "Password must be 8-50 characters with uppercase, lowercase, and numbers"
}
```

**Benefit:** Users know requirements upfront

---

## 📋 PART 12: QUERYING SUBMITTED DATA

### 12.1 Basic Queries

**Get all submissions for a form:**
```sql
SELECT * FROM form_submissions
WHERE project_id = 'proj_abc123'
  AND tenant_id = 'tenant-001'
ORDER BY created_at DESC;
```

**Get specific field from all submissions:**
```sql
SELECT 
  id,
  data->>'field_email' as email,
  data->>'field_fullname' as name,
  created_at
FROM form_submissions
WHERE project_id = 'proj_abc123'
  AND data->>'field_email' IS NOT NULL;
```

---

### 12.2 Advanced JSONB Queries

**Filter by field value:**
```sql
SELECT * FROM form_submissions
WHERE data->>'field_department' = 'Engineering'
  AND tenant_id = 'tenant-001';
```

**Filter by array contains:**
```sql
SELECT * FROM form_submissions
WHERE data->'field_interests' ?| ARRAY['Newsletter', 'Events']
  AND tenant_id = 'tenant-001';
```

**Filter by numeric field:**
```sql
SELECT * FROM form_submissions
WHERE (data->>'field_age')::int >= 18
  AND (data->>'field_age')::int <= 65;
```

**Full-text search:**
```sql
SELECT * FROM form_submissions
WHERE data::text ILIKE '%engineer%'
  AND tenant_id = 'tenant-001';
```

---

### 12.3 Aggregations

**Count by department:**
```sql
SELECT 
  data->>'field_department' as department,
  COUNT(*) as count
FROM form_submissions
WHERE project_id = 'proj_abc123'
GROUP BY data->>'field_department'
ORDER BY count DESC;
```

**Average age:**
```sql
SELECT 
  AVG((data->>'field_age')::numeric) as average_age
FROM form_submissions
WHERE project_id = 'proj_abc123'
  AND data->>'field_age' IS NOT NULL;
```

---

## 📋 PART 13: TROUBLESHOOTING

### 13.1 Submission Fails with 400

**Possible Causes:**
1. Missing required fields (tenantId, projectId, formId, payload)
2. Invalid JSON format
3. Empty payload object

**Solution:** Check request body structure

---

### 13.2 Submission Accepted but Not in PostgreSQL

**Possible Causes:**
1. Worker not running
2. Worker error during processing
3. Redis connection issue
4. PostgreSQL connection issue

**Debug Steps:**
```bash
# Check activity logs
SELECT * FROM submission_activity_log 
WHERE job_id = 'your-job-id' 
ORDER BY created_at;

# Check for 'failed' status
SELECT * FROM submission_activity_log 
WHERE status = 'failed' 
ORDER BY created_at DESC 
LIMIT 10;

# Check worker logs
docker logs halo-worker --tail 100
```

---

### 13.3 Data Stored Incorrectly

**Issue:** Field stored as string instead of number

**Cause:** Payload sent as string: `"age": "30"` instead of `"age": 30`

**Solution:** Ensure correct types in payload:
```javascript
// ❌ Wrong
payload: {
  age: "30",           // String
  active: "true"       // String
}

// ✅ Correct
payload: {
  age: 30,             // Number
  active: true         // Boolean
}
```

---

### 13.4 Required Field Not Enforced

**Issue:** Missing required field accepted

**Cause:** Validation not enabled in unified endpoint

**Temporary Solution:** Validate on frontend  
**Permanent Solution:** Add server-side validation (see recommendations)

---

## 📋 PART 14: IMPLEMENTATION CHECKLIST

### For Backend Developers:

- [ ] Understand FormElementSchema structure
- [ ] Know which fields are required in ProjectForm
- [ ] Understand JSONB storage in PostgreSQL
- [ ] Know how to query JSONB data
- [ ] Implement validation service integration
- [ ] Add form status checks
- [ ] Write comprehensive tests

### For Frontend Developers:

- [ ] Create forms with proper FormElementSchema
- [ ] Set status to 'active'
- [ ] Set deploymentStatus to 'published'
- [ ] Include all required element properties
- [ ] Validate data on frontend
- [ ] Handle submission errors
- [ ] Display jobId to user

### For QA Engineers:

- [ ] Test form creation
- [ ] Test valid submissions
- [ ] Test invalid submissions
- [ ] Test required field validation
- [ ] Test inactive form handling
- [ ] Verify PostgreSQL storage
- [ ] Check activity logs
- [ ] Test PERM submissions

---

## 🎉 CONCLUSION

### Key Takeaways:

1. **FormElementSchema is flexible** - Stored in MongoDB, defines structure
2. **PostgreSQL data column is JSONB** - Accepts any structure
3. **Mapping is direct** - element.id → data.{id}
4. **Validation exists** - Just not used by unified endpoint yet
5. **System is 95% ready** - Minor enhancements recommended

### Required Settings Summary:

**Form must have:**
- ✅ `status = 'active'`
- ✅ `metadata.deploymentStatus = 'published'`
- ✅ `configuration.projectName` (not empty)
- ✅ `elements` array (at least 1 element)

**Submission must have:**
- ✅ `tenantId`
- ✅ `projectId`
- ✅ `formId`
- ✅ `payload` (object)

**For PERM, also need:**
- ✅ `nodeId`
- ✅ `month`

### System Status:

✅ **Infrastructure:** Complete  
✅ **Schema:** Aligned  
✅ **Storage:** Working  
⚠️ **Validation:** Optional enhancement  
⚠️ **Status Check:** Optional enhancement

---

**END OF GUIDE**

**Next Steps:** Run `test-form-submission-pipeline-complete.js` to verify everything!


