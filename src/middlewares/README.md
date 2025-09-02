# 🔐 `requireAccess` Middleware — Unified JWT + API Key + RBAC System

## 📌 Overview

The `requireAccess` middleware simplifies and strengthens security by unifying:

- ✅ **JWT user authentication** (super admin, owner, regular user)
- ✅ **API key validation** (hashed key, rate limit, scope, environment)
- ✅ **Permission-based RBAC**
- ✅ **Tenant-scoped operations**
- ✅ **Ownership check for multitenant models**
- ✅ **Hybrid detection (JWT or API key)**

It auto-detects the type of request and enforces the necessary security checks.

---

## 🧠 How It Works

| Type     | Detected by                            | What It Checks                                                  |
|----------|-----------------------------------------|------------------------------------------------------------------|
| JWT      | `Authorization: Bearer <JWT>`           | Role-based permissions, super/owner bypass, ownership            |
| API Key  | `x-api-key` or `Authorization: Bearer sk_...` | Permissions, scope, environment, rate limit, tenant association  |

---

## 🚀 How to Use It in Routes

### 📦 Import require access

```
const requireAccess = require('../middlewares/requireAccess'); // Adjust path if needed
router.post(
  '/resource',
  requireAccess({
    permissions: ['create:resource']
  }),
  validate(resourceValidation.create),
  resourceController.create
);
```


### Full Example with All Options

```
router.post(
  '/resource',
  requireAccess({
    permissions: ['create:resource'],
    scope: 'api',
    environment: 'production',
    rateLimit: true,
    ownership: async (req) => req.body.tenantId,
  }),
  validate(resourceValidation.create),
  resourceController.create
);
```


### 🔐 JWT Token Access (User-Based)
📥 Request Headers

POST /api/v1/resource
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json


### 📦 JWT Token Payload Example

{
  "id": "userId123",
  "isSuper": false,
  "isOwner": true,
  "roles": ["admin"],
  "tenantId": "tenant123"
}

### 🔑 API Key Access
## API Key Headers


x-api-key: sk_live_abc123   // OR
Authorization: Bearer sk_live_abc123


####  📦 Required API Key Structure

{
  "_id": "keyId",
  "label": "Mobile App Key",
  "tenant": {
    "_id": "tenant123"
  },
  "permissions": ["create:resource"],
  "scope": "api",
  "environment": "production",
  "rateLimit": 1000,
  "usageCount": 12,
  "expires": "2025-12-31T23:59:59Z"
}


###  ❌ Error Responses

Status	Message	Reason
401	API key is required	No JWT or API key provided
401	Please authenticate	JWT token is missing or invalid
403	Missing required permissions	JWT or API key lacks permission
403	Scope mismatch	e.g., expected api, got mobile
403	Environment mismatch	Key env does not match required one
403	Owner does not have access to resource	Owner’s resource not in allowed bundle
429	Rate limit exceeded	Key used too many times

### 💡 Sample Scenarios
## ✅ JWT Auth — Admin

POST /api/v1/admins
Authorization: Bearer <JWT>

{
  "username": "admin1",
  "email": "admin1@example.com"
}



✅ API Key — External Client

POST /api/v1/data
x-api-key: sk_live_abc123

{
  "payload": "some data",
  "tenantId": "tenant123"
}
✅ Hybrid Detection
Automatically picks the right strategy:


Authorization: Bearer <JWT>         // uses user token
Authorization: Bearer sk_abc123...  // uses API key
x-api-key: sk_abc123                // uses API key
🛠 Middleware Options
Option	Type	Description
permissions	string[]	List of required permissions
scope	string	Enforce API key scope (e.g., api, mobile)
environment	string	Restrict to environment (production, development, etc.)
rateLimit	boolean	If true, enforces usage limit based on API key
ownership	(req) => id	Optional async function to get tenant/resource ID

### ⚙️ Example Login Route

router.post(
  '/login',
  requireAccess({
    permissions: ['login:auth'],
    scope: 'public',
    environment: 'development'
  }),
  validate(authValidation.login),
  authController.login
);


📊 Response Rate Limit Headers
Header	Description
X-RateLimit-Limit	Total allowed requests per minute
X-RateLimit-Remaining	Requests left in current window
X-RateLimit-Reset	Timestamp for next window reset

📬 Client Tips
Feature	Recommendation
API Key	Store securely and rotate periodically
JWT Token	Use only from secure frontend/session
Rate Limits	Respect provided headers
Ownership	Ensure tenantId is included in payload
Access Logs	Monitor API key usage & expiry dates


Let me know if you'd like:
- A Postman collection
- Swagger/OpenAPI YAML
- Or markdown export with table of contents generated automatically.

