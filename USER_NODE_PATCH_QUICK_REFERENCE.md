# ⚡ User & Node PATCH - Quick Reference

**Branch:** `user-node-patch` ✅ Created

## 🎯 What We're Fixing

| Issue | Current Behavior | New Behavior |
|-------|------------------|--------------|
| **PATCH Updates** | Updates all fields even if not sent | Only updates fields present in request |
| **Profile Updates** | Profile fields sent to user/node ignored | Auto-updates userProfile/nodeProfile |
| **GET User** | Returns only user data | Returns user + userProfile combined |
| **GET Nodes** | Returns only node data | Returns node + nodeProfile combined |
| **Super User** | Manual creation needed | Script to create saby@saby.ai |

## 📋 Implementation Phases

### Phase 1: User PATCH ⏳
- Update `user.service.js` - partial updates logic
- Update `user.controller.js` - profile handling
- Update `user.validation.js` - optional fields

### Phase 2: Node PATCH ⏳
- Update `node.service.js` - partial updates logic
- Update `node.controller.js` - profile handling
- Update `node.validation.js` - optional fields

### Phase 3: Super User ⏳
- Create `scripts/create-saby-super-user.js`
- Add npm script command
- Credentials: `saby@saby.ai` / `@saby_Saby1`
- Privileges: `isSaby`, `isSuper`, `isOwner`

### Phase 4: Combined Routes ⏳
- Update `getUser()` - return user + profile
- Update `getUserNodes()` - return nodes + profiles
- Update `getNodeById()` - return node + profile

### Phase 5: Testing ⏳
- Test partial updates
- Test profile auto-updates
- Test combined responses
- Test super user login

## 🔑 Key Files to Modify

```
sabyBackend/
├── src/
│   ├── services/
│   │   ├── user.service.js          ← Modify updateUserById()
│   │   └── node.service.js          ← Modify updateNodeById()
│   ├── controllers/
│   │   ├── user.controller.js       ← Modify getUser(), getUserNodes(), updateUser()
│   │   └── node.controller.js       ← Modify getNodeById(), updateNodeById()
│   └── validations/
│       ├── user.validation.js       ← Make fields optional
│       └── node.validation.js       ← Make fields optional
├── scripts/
│   └── create-saby-super-user.js    ← CREATE NEW
└── package.json                      ← Add script command
```

## 🧪 Quick Test Commands

### Test Partial Update
```bash
curl -X PATCH http://localhost:3000/v1/users/:userId \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"firstname": "NewName"}'
```

### Test User + Profile Update
```bash
curl -X PATCH http://localhost:3000/v1/users/:userId \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"firstname": "John", "dateOfBirth": "1990-01-01"}'
```

### Test Combined User Data
```bash
curl http://localhost:3000/v1/users/:userId \
  -H "Authorization: Bearer <TOKEN>"
```

### Create Super User
```bash
npm run create-saby-user
```

### Test Super User Login
```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -d '{"email": "saby@saby.ai", "password": "@saby_Saby1"}'
```

## 📊 Field Separation Reference

### User Entity

**User Table Fields:**
```javascript
['firstname', 'lastname', 'email', 'phone', 'password',
 'isSaby', 'isSuper', 'isOwner', 'isActive', 'roles']
```

**UserProfile Table Fields:**
```javascript
['dateOfBirth', 'gender', 'address', 'bio', 'avatar',
 'phoneNumber', 'alternateEmail', 'emergencyContact']
```

### Node Entity

**Node Table Fields:**
```javascript
['level', 'parent', 'name', 'address', 'city', 'state',
 'country', 'postalCode', 'isMain', 'users', 'isActive']
```

**NodeProfile Table Fields:**
```javascript
['dateOfEstablishment', 'propertyStatus', 'estimatedValue',
 'buildingType', 'status']
```

## 🎯 Expected Response Formats

### GET /v1/users/:userId (New Format)
```json
{
  "_id": "...",
  "firstname": "John",
  "lastname": "Doe",
  "email": "john@example.com",
  "profile": {
    "dateOfBirth": "1990-01-01",
    "address": "123 Main St",
    "gender": "Male"
  }
}
```

### GET /v1/users/:userId/nodes (New Format)
```json
[
  {
    "_id": "...",
    "name": "Church Name",
    "level": "...",
    "profile": {
      "dateOfEstablishment": "2020-01-01",
      "propertyStatus": "Owned",
      "estimatedValue": 500000
    }
  }
]
```

### GET /v1/node/:nodeId (New Format)
```json
{
  "_id": "...",
  "name": "Church Name",
  "level": "...",
  "address": "123 Church St",
  "profile": {
    "dateOfEstablishment": "2020-01-01",
    "propertyStatus": "Owned",
    "estimatedValue": 500000,
    "buildingType": "Auditorium",
    "status": "Active"
  }
}
```

## ⚠️ Important Notes

1. **Backwards Compatibility:** Old API clients should continue to work
2. **Profile Fields:** If profile doesn't exist, return `"profile": null`
3. **Partial Updates:** Only fields in request body should be updated
4. **Error Handling:** Profile update errors should not fail main update
5. **Logging:** Add detailed logs for debugging

## 🚀 Deployment Steps

1. ✅ Create branch: `git checkout -b user-node-patch`
2. ⏳ Implement all phases
3. ⏳ Run tests
4. ⏳ Update documentation
5. ⏳ Create PR for review
6. ⏳ Merge to main after approval
7. ⏳ Deploy to staging
8. ⏳ Create super user on staging
9. ⏳ Test on staging
10. ⏳ Deploy to production

## 📚 Documentation

**Full Guide:** `USER_NODE_PATCH_IMPLEMENTATION_GUIDE.md`  
**This File:** Quick reference and cheat sheet

---

**Status:** 🟡 In Progress  
**Branch:** `user-node-patch`  
**Created:** October 22, 2025

