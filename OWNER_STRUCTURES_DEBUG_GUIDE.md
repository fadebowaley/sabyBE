# 🔍 Owner Structures Access Debug Guide

## Problem Summary

You're experiencing a 403 Forbidden error when an Owner tries to access the `/v1/structure` endpoint:

```
Required Permissions: [ 'view:structures' ]
User is an Owner. Checking resource-based permissions with regex matching...
Action: Resource = structures
Resource structures is not in Owner's allowed bundle.
error: ::ffff:172.19.0.1 - GET /v1/structure 403 - 8.574 ms
message: Owner does not have access to this resource
```

## What We've Done

### 1. Added Debug Logging

We've enhanced both middleware files with comprehensive debug logging:

**Files modified:**

- `sabyBackend/src/middlewares/auth.js`
- `sabyBackend/src/middlewares/requireAccess.js`

**What the logs will show:**

- ✅ The exact contents of `ownerResourceBundle` when loaded
- ✅ The type and structure of the bundle
- ✅ Character-by-character comparison when checking permissions
- ✅ String length and type information for each resource
- ✅ Individual comparisons with each bundle item

### 2. Created Test Script

We've created a test script to help reproduce and debug the issue:

**File:** `sabyBackend/test-owner-structures-access.js`

## How to Debug

### Step 1: Restart the Backend

The enhanced logging will only show up after restarting:

```bash
cd sabyBackend

# If using npm/node directly
npm run dev

# If using Docker
docker-compose restart backend

# If using PM2
pm2 restart all
```

### Step 2: Watch the Startup Logs

Look for these lines when the backend starts:

```
🔍 [AUTH MIDDLEWARE] Owner Resource Bundle loaded: [...]
🔍 [AUTH MIDDLEWARE] Bundle type: object
🔍 [AUTH MIDDLEWARE] Is Array?: true
```

**Expected output:**

```json
[
  "user",
  "app",
  "structures",
  "node",
  "payment",
  "level",
  "storage",
  "project",
  "apikeys",
  "project-form",
  "roles",
  "permissions"
]
```

### Step 3: Run the Test Script

```bash
cd sabyBackend

# Get an Owner JWT token first (from your frontend or login endpoint)
# Then run:
OWNER_JWT=<your-jwt-token> node test-owner-structures-access.js
```

The script will:

1. ✅ Check if the JSON file is valid
2. ✅ Show all resources in the bundle
3. ✅ Check for whitespace issues
4. ✅ Verify "structures" is present
5. ✅ Make a test API call
6. ✅ Show the exact error response

### Step 4: Make a Real API Request

While watching the backend logs, make a request:

```bash
# Replace <JWT_TOKEN> with your actual Owner JWT
curl -X GET http://localhost:3000/v1/structure \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Step 5: Analyze the Logs

Look for these log sections in your backend console:

#### Section A: Bundle Loading (at startup)

```
🔍 [AUTH MIDDLEWARE] Owner Resource Bundle loaded: [...]
```

#### Section B: Permission Check (during request)

```
--- AUTH DEBUG ---
Route: /v1/structure
HTTP Method: GET
Required Permissions: [ 'view:structures' ]
User is an Owner. Checking resource-based permissions with regex matching...
🔍 Owner Resource Bundle: [...]
🔍 Required Rights: [ 'view:structures' ]
```

#### Section C: Resource Extraction

```
🔍 Extracted Resource from "view:structures": "structures"
🔍 Resource type: string
🔍 Resource length: 10
```

#### Section D: Bundle Check

```
🔍 Checking if "structures" is in bundle...
🔍 Bundle contents: ["user","app","structures",...]
🔍 includes() result: true/false
```

#### Section E: Detailed Comparison (if check fails)

```
🔍 Checking each bundle item:
  [0] "user" === "structures"? false
  [1] "app" === "structures"? false
  [2] "structures" === "structures"? true/false
  ...
```

## Possible Root Causes

### 1. JSON File Not Reloaded

**Symptom:** Old bundle shown in logs  
**Solution:** Restart the backend server

### 2. Whitespace in JSON

**Symptom:** `includes()` returns false, but item appears to be in array  
**Solution:** Check for extra spaces in `ownerResource.json`

```json
// BAD - has extra space
{"ownerResourceBundle": ["user", "structures ", "node"]}
                                            ↑

// GOOD
{"ownerResourceBundle": ["user", "structures", "node"]}
```

### 3. Character Encoding Issue

**Symptom:** String lengths don't match, comparison fails  
**Solution:** Re-save the JSON file with UTF-8 encoding

### 4. Case Sensitivity

**Symptom:** Bundle has "Structures" but checking for "structures"  
**Solution:** Ensure lowercase in JSON file

### 5. Typo in Permission Name

**Symptom:** Route uses "structure" but bundle has "structures"  
**Solution:** Verify consistency

## Quick Fixes

### Fix 1: Re-create the JSON file

```bash
cd sabyBackend/src/scripts/permissions

# Backup the old file
cp ownerResource.json ownerResource.json.backup

# Create a clean new file
cat > ownerResource.json << 'EOF'
{
  "ownerResourceBundle": ["user", "app", "structures", "node", "payment", "level", "storage", "project", "apikeys", "project-form", "roles", "permissions"]
}
EOF

# Restart backend
```

### Fix 2: Verify JSON Manually

```bash
cd sabyBackend/src/scripts/permissions

# Check for hidden characters
cat -A ownerResource.json

# Parse and pretty-print
node -e "console.log(JSON.stringify(require('./ownerResource.json'), null, 2))"
```

### Fix 3: Test Programmatically

```javascript
// Quick test in Node.js REPL
const bundle = require('./src/scripts/permissions/ownerResource.json');
console.log(bundle.ownerResourceBundle);
console.log(
  'Has structures?',
  bundle.ownerResourceBundle.includes('structures')
);
```

## Expected Behavior

When everything works correctly, you should see:

### In Logs:

```
--- AUTH DEBUG ---
Route: /v1/structure
HTTP Method: GET
Required Permissions: [ 'view:structures' ]
User is an Owner. Checking resource-based permissions with regex matching...
🔍 Extracted Resource from "view:structures": "structures"
🔍 Checking if "structures" is in bundle...
🔍 includes() result: true
✅ Owner has access to resource
```

### In Response:

```json
{
  "results": [...],
  "page": 1,
  "limit": 10,
  "totalPages": 1,
  "totalResults": 5
}
```

## Still Not Working?

If the issue persists after trying the above:

1. **Share the complete logs** from both startup and request time
2. **Run the test script** and share its output
3. **Check for middleware conflicts** - are there multiple auth middlewares?
4. **Verify the route registration** - is the route actually using the `auth` middleware?

### Collect Full Debug Info

```bash
# Run this to collect all relevant info
cd sabyBackend

echo "=== ownerResource.json ===" > debug-output.txt
cat src/scripts/permissions/ownerResource.json >> debug-output.txt

echo -e "\n=== Test Script Output ===" >> debug-output.txt
OWNER_JWT=$OWNER_JWT node test-owner-structures-access.js >> debug-output.txt 2>&1

echo -e "\n=== Backend Logs (last 200 lines) ===" >> debug-output.txt
tail -n 200 backend.log >> debug-output.txt

# Share debug-output.txt
```

## Files Modified

1. ✅ `sabyBackend/src/middlewares/auth.js` - Enhanced debug logging
2. ✅ `sabyBackend/src/middlewares/requireAccess.js` - Enhanced debug logging
3. ✅ `sabyBackend/test-owner-structures-access.js` - New test script
4. ✅ `sabyBackend/OWNER_STRUCTURES_DEBUG_GUIDE.md` - This guide

## Next Steps

1. **Restart the backend server**
2. **Check the startup logs** for bundle loading
3. **Run the test script** to verify JSON file
4. **Make a test request** and examine detailed logs
5. **Share the output** if the issue persists

The enhanced logging will pinpoint exactly where the check is failing!
