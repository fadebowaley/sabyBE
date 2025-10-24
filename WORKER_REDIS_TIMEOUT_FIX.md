# 🔧 Worker Redis Timeout Fix

**Issue:** Submission worker experiencing Redis command timeouts  
**Root Cause:** BullMQ workers have strict commandTimeout causing failures  
**Fix Applied:** Updated Redis connection options for BullMQ workers

---

## ✅ Changes Made

### File: `src/config/redis.js`

**Before:**
```javascript
const getRedisConnectionOptions = () => ({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db || 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
  connectTimeout: 10000,
  commandTimeout: 5000, // ❌ This was causing timeouts!
});
```

**After:**
```javascript
const getRedisConnectionOptions = () => ({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password || undefined,
  db: config.redis.db || 0,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: null,
  enableReadyCheck: false, // ✅ Disabled for BullMQ
  lazyConnect: false,
  connectTimeout: 30000, // ✅ Increased from 10s to 30s
  // ✅ Removed commandTimeout to prevent timeout errors
  keepAlive: 30000, // ✅ Prevent connection drops
  enableOfflineQueue: false, // ✅ Prevent memory buildup
});
```

---

## 🎯 What Was Fixed

1. **Removed `commandTimeout`** - This was causing worker operations to timeout
2. **Disabled `enableReadyCheck`** - BullMQ doesn't need this check
3. **Increased `connectTimeout`** - More time for initial connection
4. **Added `keepAlive`** - Prevents idle connections from being dropped
5. **Disabled `enableOfflineQueue`** - Prevents memory issues

---

## 🧪 Testing

### Restart Backend:
```bash
cd /Users/fadebowaley/saby/sabyBackend
pkill -9 -f "npm run dev"
npm run dev > backend-final.log 2>&1 &

# Wait 10 seconds
sleep 10

# Check logs
tail -50 backend-final.log | grep -E "worker|Worker|timeout|error"
```

### Run PERM Test:
```bash
node test-perm-unified-submission.js
```

**Expected:** No more "Command timed out" errors!

---

## 📊 Expected Results

### Before Fix:
```
info: ✅ Submission worker started
Error: Command timed out ❌
error: ❌ Submission worker error
```

### After Fix:
```
info: ✅ Submission worker started
info: [Worker] Processing PERM submission... ✅
info: ✅ PERM submission created
```

---

## 🔍 Why This Works

**Problem:**  
BullMQ workers perform long-running Redis operations (BLPOP, BRPOPLPUSH) that can exceed the 5-second `commandTimeout`.

**Solution:**  
Remove the `commandTimeout` restriction and let BullMQ manage its own timeouts internally.

**BullMQ Best Practices:**
- Don't set `commandTimeout` for worker connections
- Use `enableReadyCheck: false` for better performance
- Enable `keepAlive` to maintain persistent connections
- Disable `enableOfflineQueue` to prevent memory issues

---

## 🚀 Next Steps

1. **Restart Backend** with new Redis config
2. **Clear Redis Queue** to remove stale jobs
3. **Run Test** to verify submissions work end-to-end

---

**Status:** Fix applied, restart required  
**Expected Impact:** Eliminates Redis timeout errors  
**Testing:** Run `test-perm-unified-submission.js`


