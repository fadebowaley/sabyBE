# PERM Submission Guide: Frequency Enforcement & Backdating

## ✅ Frequency Enforcement - CONFIRMED WORKING

### How It Works

The system **DOES enforce daily submission frequency** from the calendar configuration:

1. **Calendar Config Structure** (`event_calendar` table):
   ```json
   {
     "dates": ["2025-11-24", "2025-11-25", ...],
     "frequency_per_day": 4,
     "total_days": 23,
     "total_expected": 92
   }
   ```

2. **Enforcement Logic** (`calendarEnforcement.service.js`):
   - Reads `frequency_per_day` from `daily_config` (line 78)
   - Counts existing submissions for the date (line 131-136)
   - Blocks if `usedSlots >= slot.totalSlots` (line 138-143)

3. **Current Status**:
   - November 2025 calendar: `frequency_per_day: 4`
   - Submissions for `2025-11-24`: **8 submissions**
   - **Result**: Quota reached (8 >= 4) ✅ **Enforcement is working correctly**

### Why Submissions Are Failing

Your recent failures show:
```
Daily submission quota reached for this date
```

This means:
- ✅ The frequency enforcement **IS working**
- ❌ The date has already reached its quota limit
- 💡 **Solution**: Submit for a different date that hasn't reached its quota

---

## 📅 Backdating (Past Date Submissions)

### Is Backdating Allowed?

**YES**, but only if the form's `permSettings.allowBackdating` is enabled.

### How to Enable Backdating

1. **Via Form Configuration**:
   ```javascript
   {
     permSettings: {
       enabled: true,
       calendarGeneration: {
         allowBackdating: true  // ← Enable this
       }
     }
   }
   ```

2. **Check Current Setting**:
   ```sql
   SELECT projectId, "permSettings.calendarGeneration.allowBackdating" 
   FROM project_forms 
   WHERE projectId = 'proj_testing-form-ebc81g';
   ```

### Payload Structure for Backdating

When submitting a past date, include `submission_date` in your payload:

```json
{
  "tenantId": "X9FixGtE6c",
  "projectId": "proj_testing-form-ebc81g",
  "formId": "form_command_line_perm",
  "nodeId": "node_cli_1234567890",
  "month": "2025-11-01",
  "submission_date": "2025-11-20",  // ← Past date (YYYY-MM-DD)
  "perm_enabled": true,
  "payload": {
    "attendance": {
      "records": [
        {
          "event": "sunday_service",
          "date": "2025-11-20",
          "total": 150,
          "men": 70,
          "women": 80
        }
      ]
    }
  },
  "source": "api",
  "project_name": "Test Form",
  "project_category": "compliance"
}
```

### Submission Date Priority

The system checks for `submission_date` in this order (line 248-252):
1. `submission_date_raw` (top-level field)
2. `payload.date`
3. `payload.payload?.date`
4. **Default**: Today's date (`new Date().toISOString().split('T')[0]`)

### Validation Rules

1. **Date must exist in calendar**: The `submission_date` must be in the calendar's `dates` array
2. **Frequency check**: Must not exceed `frequency_per_day` for that date
3. **Backdating check**: If `allowBackdating: false`, past dates are rejected (line 124-129)
4. **Month lock check**: Month must not be locked (`is_locked: false`)

---

## 🧪 Testing Examples

### Example 1: Submit for Today (Current Date)

```bash
# Uses today's date automatically
curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "X9FixGtE6c",
    "projectId": "proj_testing-form-ebc81g",
    "formId": "form_cli_demo",
    "nodeId": "node_test_123",
    "month": "2025-11-01",
    "perm_enabled": true,
    "payload": { "attendance": { "total": 100 } },
    "source": "api"
  }'
```

### Example 2: Submit for a Past Date (Backdating)

```bash
# Explicitly set submission_date to a past date
curl -X POST http://localhost:4000/v1/submissions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenantId": "X9FixGtE6c",
    "projectId": "proj_testing-form-ebc81g",
    "formId": "form_cli_demo",
    "nodeId": "node_test_123",
    "month": "2025-11-01",
    "submission_date": "2025-11-20",  // ← Past date
    "perm_enabled": true,
    "payload": {
      "date": "2025-11-20",  // ← Also in payload
      "attendance": { "total": 100 }
    },
    "source": "api"
  }'
```

### Example 3: Using the Test Script

```bash
# Submit for a specific past date
SUBMISSION_DATE="2025-11-20" \
MONTH="2025-11-01" \
PROJECT_ID="proj_testing-form-ebc81g" \
FORM_ID="form_cli_demo" \
scripts/run-perm-submission-test.sh
```

---

## 🔍 Troubleshooting

### Error: "Daily submission quota reached for this date"

**Cause**: The date has reached its `frequency_per_day` limit.

**Solutions**:
1. Submit for a different date (check calendar for available dates)
2. Increase `frequency_per_day` in calendar config
3. Delete old submissions for that date (if appropriate)

**Check current usage**:
```sql
SELECT submission_date, COUNT(*) as count 
FROM form_submissions 
WHERE tenant_id = 'X9FixGtE6c' 
  AND project_id = 'proj_testing-form-ebc81g'
  AND submission_date = '2025-11-24'
GROUP BY submission_date;
```

**Check calendar quota**:
```sql
SELECT daily_config->>'frequency_per_day' as frequency
FROM event_calendar 
WHERE tenant_id = 'X9FixGtE6c' 
  AND project_id = 'proj_testing-form-ebc81g'
  AND month = '2025-11-01';
```

### Error: "Backdated submissions are not allowed"

**Cause**: Form has `allowBackdating: false` (default).

**Solution**: Enable backdating in form config:
```javascript
await ProjectForm.updateOne(
  { projectId: 'proj_testing-form-ebc81g' },
  { 
    $set: { 
      'permSettings.calendarGeneration.allowBackdating': true 
    } 
  }
);
```

### Error: "Date is not configured in the calendar"

**Cause**: The `submission_date` is not in the calendar's `dates` array.

**Solution**: Use a date that exists in the calendar, or regenerate the calendar to include that date.

---

## 📊 Summary

| Feature | Status | Notes |
|---------|--------|-------|
| **Frequency Enforcement** | ✅ **WORKING** | Reads `frequency_per_day` from calendar, blocks when quota reached |
| **Backdating** | ✅ **SUPPORTED** | Requires `allowBackdating: true` in form config |
| **Date Priority** | ✅ **WORKING** | Checks `submission_date`, `payload.date`, then defaults to today |
| **Quota Tracking** | ✅ **WORKING** | Counts submissions per date/node/project |

---

## 🎯 Recommendations

1. **For Testing**: Use dates with available quota slots
2. **For Production**: Monitor DLQ for quota-related failures
3. **For Backdating**: Enable `allowBackdating` only when needed (security consideration)
4. **For High-Frequency Forms**: Set appropriate `frequency_per_day` values in calendar config

