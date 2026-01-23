# 🚀 Quick Start: Debug Owner Structures Access

## What's The Problem?

Owner users are getting **403 Forbidden** when trying to access `/v1/structure` endpoint:

```
Required Permissions: [ 'view:structures' ]
Resource structures is not in Owner's allowed bundle.
error: GET /v1/structure 403
```

## What We've Done

✅ **Enhanced debug logging** in both middleware files  
✅ **Created test script** to reproduce the issue  
✅ **Created comprehensive guide** for debugging

## Quick Steps to Debug

### Step 1: Restart Backend (IMPORTANT!)

The new debug logs will only appear after restarting:

```bash
cd sabyBackend

# Option 1: If using npm/node
npm run dev

# Option 2: If using Docker
docker-compose restart backend

# Option 3: If using PM2
pm2 restart all
```

### Step 2: Check Startup Logs

Look for these lines when backend starts:

```
🔍 [AUTH MIDDLEWARE] Owner Resource Bundle loaded: [...]
🔍 [AUTH MIDDLEWARE] Bundle type: object
🔍 [AUTH MIDDLEWARE] Is Array?: true
```

**Expected bundle:**

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

✅ Verify that `"structures"` is in the array

### Step 3: Try to Access Structures

Make a request as an Owner:

```bash
# Replace <JWT_TOKEN> with your actual Owner JWT
curl -X GET http://localhost:3000/v1/structure \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### Step 4: Check Detailed Logs

You'll now see MUCH more detailed logs:

```
--- AUTH DEBUG ---
Route: /v1/structure
HTTP Method: GET
Required Permissions: [ 'view:structures' ]
User is an Owner. Checking resource-based permissions with regex matching...
🔍 Owner Resource Bundle: [...]
🔍 Required Rights: [ 'view:structures' ]
🔍 Extracted Resource from "view:structures": "structures"
🔍 Resource type: string
🔍 Resource length: 10
🔍 Checking if "structures" is in bundle...
🔍 Bundle contents: [...]
🔍 includes() result: true/false
```

If `includes()` returns **false**, you'll see:

```
❌ Resource structures is not in Owner's allowed bundle.
🔍 Checking each bundle item:
  [0] "user" === "structures"? false
  [1] "app" === "structures"? false
  [2] "structures" === "structures"? false ← THIS SHOULD BE TRUE!
  ...
```

### Step 5: Run Test Script (Optional)

```bash
cd sabyBackend

# Get an Owner JWT token first, then:
OWNER_JWT=<your-jwt-token> node test-owner-structures-access.js
```

This will:

- ✅ Check if the JSON file is valid
- ✅ List all resources in the bundle
- ✅ Check for whitespace issues
- ✅ Make a test API call
- ✅ Show the exact error

## Common Issues & Solutions

### Issue 1: "structures" appears in bundle but check fails

**Cause:** Whitespace or encoding issue in JSON file

**Solution:**

```bash
cd sabyBackend/src/scripts/permissions

# Backup
cp ownerResource.json ownerResource.json.backup

# Recreate cleanly
cat > ownerResource.json << 'EOF'
{
  "ownerResourceBundle": ["user", "app", "structures", "node", "payment", "level", "storage", "project", "apikeys", "project-form", "roles", "permissions"]
}
EOF

# Restart backend
```

### Issue 2: Bundle doesn't include "structures"

**Cause:** Old version of JSON file loaded

**Solution:**

1. Check the file: `cat sabyBackend/src/scripts/permissions/ownerResource.json`
2. Verify "structures" is in the array
3. Restart the backend to reload it

### Issue 3: Still getting 403 after fixes

**Cause:** Multiple auth middlewares or cache issue

**Solution:**

1. Clear node_modules cache: `rm -rf node_modules && npm install`
2. Check for duplicate ownerResource.json files: `find . -name "ownerResource.json"`
3. Verify you're testing with an Owner account (not regular user)

## Files Modified

1. `sabyBackend/src/middlewares/auth.js` - Enhanced logging
2. `sabyBackend/src/middlewares/requireAccess.js` - Enhanced logging
3. `sabyBackend/test-owner-structures-access.js` - Test script (NEW)
4. `sabyBackend/OWNER_STRUCTURES_DEBUG_GUIDE.md` - Full guide (NEW)
5. `sabyBackend/DEBUG_STRUCTURES_ACCESS_START_HERE.md` - This file (NEW)

## Next Steps

1. **Restart backend** and check startup logs
2. **Make test request** and examine detailed debug output
3. **Share the logs** if issue persists (look for lines with 🔍 emoji)

## Expected Result

When working correctly, you should see:

```
🔍 Checking if "structures" is in bundle...
🔍 includes() result: true
✅ Owner has access to structures
```

And the API should return 200 with your structures data.

## Need More Help?

See the comprehensive guide: `OWNER_STRUCTURES_DEBUG_GUIDE.md`

The enhanced debug logging will pinpoint **exactly** where and why the permission check is failing! 🎯
