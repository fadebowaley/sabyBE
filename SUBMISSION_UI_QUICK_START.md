# 🚀 SUBMISSION UI - QUICK START GUIDE

**Status:** Ready to implement  
**Backend:** ✅ All 31 endpoints tested  
**Frontend:** 🔨 Implementation Phase

---

## 📋 WHAT TO BUILD

### 1. Submissions Dashboard (NEW) - Week 2
**Route:** `/submissions`  
**Purpose:** Main data management interface

### 2. Enhanced Log Dashboard (ENHANCE) - Week 4
**Route:** `/log-dashboard`  
**Purpose:** Activity monitoring (already exists)

### 3. PERM Compliance Dashboard (NEW) - Week 3
**Route:** `/perm-dashboard`  
**Purpose:** Compliance tracking & alerts

### 4. Analytics & Reports (NEW) - Week 5-6
**Route:** `/analytics`  
**Purpose:** Data visualization & insights

### 5. Export Center (NEW) - Week 7
**Route:** `/export-center`  
**Purpose:** Data export & management

---

## 🎯 IMPLEMENTATION ORDER

### Phase 1: Foundation (Week 1) - START HERE! 🚀

**Priority:** CRITICAL

#### 1.1 Create API Services
```bash
# Create these files:
src/app/lib/api/submissions.ts      # NEW
src/app/lib/api/perm.ts             # NEW
src/app/lib/api/analytics.ts        # NEW
src/app/lib/api/exports.ts          # NEW
src/app/lib/api/logs.ts             # ENHANCE
```

#### 1.2 Create Custom Hooks
```bash
# Create these files:
src/app/lib/hooks/useSubmissions.ts     # NEW
src/app/lib/hooks/usePERMCompliance.ts  # NEW
src/app/lib/hooks/useAnalytics.ts       # NEW
src/app/lib/hooks/useExports.ts         # NEW
src/app/lib/hooks/useActivityLogs.ts    # ENHANCE
```

**Action:** Copy patterns from `useActivityLogs.ts` and `api/logs.ts`

---

### Phase 2: Submissions Dashboard (Week 2) - HIGHEST VALUE 💎

**Priority:** HIGH

```bash
# Create directory structure:
mkdir -p src/app/\(berrylium\)/submissions

# Create these files:
src/app/(berrylium)/submissions/page.tsx
src/app/(berrylium)/submissions/layout.tsx
src/app/(berrylium)/submissions/SubmissionsTable.tsx
src/app/(berrylium)/submissions/SubmissionStats.tsx
src/app/(berrylium)/submissions/SubmissionFilters.tsx
src/app/(berrylium)/submissions/SubmissionDetails.tsx
```

**Template:** Copy from `/log-dashboard` and adapt

**Key Components:**
1. SubmissionsTable - TanStack Table with 8 columns
2. SubmissionStats - 5 KPI cards
3. SubmissionFilters - Advanced filtering
4. SubmissionDetails - Modal with full data

---

### Phase 3: PERM Dashboard (Week 3)

**Priority:** MEDIUM

```bash
mkdir -p src/app/\(berrylium\)/perm-dashboard

src/app/(berrylium)/perm-dashboard/page.tsx
src/app/(berrylium)/perm-dashboard/ComplianceOverview.tsx
src/app/(berrylium)/perm-dashboard/NodeComplianceTable.tsx
src/app/(berrylium)/perm-dashboard/MonthlyTrends.tsx
src/app/(berrylium)/perm-dashboard/EventTracking.tsx
src/app/(berrylium)/perm-dashboard/ComplianceAlerts.tsx
```

---

### Phase 4: Enhanced Logs (Week 4)

**Priority:** MEDIUM

```bash
# Add to existing log-dashboard:
src/app/(berrylium)/log-dashboard/LogTimeline.tsx
src/app/(berrylium)/log-dashboard/ActivityTrends.tsx
src/app/(berrylium)/log-dashboard/BulkActions.tsx
src/app/(berrylium)/log-dashboard/AdvancedFilters.tsx
```

**Enhancements:**
- Bulk delete
- Export logs
- Job timeline view
- Activity trends chart

---

## 🎨 UI PATTERN TO FOLLOW

### Standard Page Structure

```typescript
'use client';

import PageHeader from '@/app/shared/page-header';
import { useYourHook } from '@/app/lib/hooks/useYourHook';

export default function YourPage() {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 25,
  });
  
  const [filters, setFilters] = useState({});
  
  const { data, loading, error, refresh } = useYourHook({
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    filters,
  });
  
  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  
  return (
    <>
      <PageHeader title="..." breadcrumb={[...]} />
      <div className="mt-6 space-y-8">
        <StatsCards stats={...} />
        <Filters filters={filters} setFilters={setFilters} />
        <DataTable 
          data={data}
          pagination={pagination}
          setPagination={setPagination}
        />
      </div>
    </>
  );
}
```

---

## 🔌 API INTEGRATION PATTERN

### 3-Layer Architecture

```
1. API Service (api/submissions.ts)
   ↓
2. Custom Hook (hooks/useSubmissions.ts)
   ↓
3. Page Component (submissions/page.tsx)
```

### Example Implementation

**1. API Service:**
```typescript
// src/app/lib/api/submissions.ts
export const getSubmissions = async (filters, token) => {
  const response = await api.get('/submissions', {
    params: filters,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};
```

**2. Custom Hook:**
```typescript
// src/app/lib/hooks/useSubmissions.ts
export const useSubmissions = (options) => {
  const { data: session } = useSession();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const fetchData = useCallback(async () => {
    const result = await getSubmissions(
      options.filters,
      session.user.accessToken
    );
    setSubmissions(result.submissions);
  }, [session, options.filters]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  return { submissions, loading, refresh: fetchData };
};
```

**3. Page Component:**
```typescript
// src/app/(berrylium)/submissions/page.tsx
export default function SubmissionsPage() {
  const { submissions, loading, refresh } = useSubmissions({ ... });
  
  return (
    <SubmissionsTable data={submissions} loading={loading} />
  );
}
```

---

## 📦 EXISTING COMPONENTS TO USE

### From Core Library
- `@core/components/table` - TanStack Table
- `@core/components/table/pagination` - Pagination
- `@core/components/table/footer` - Table footer

### From rizzui
- `Button`
- `Tooltip`
- `Badge`
- `Dropdown`
- `Modal`
- `Drawer`

### Icons
- `lucide-react` - All icons

---

## 🎨 COLOR CODING REFERENCE

### Status Colors
```typescript
const statusColors = {
  success: 'bg-green-50 border-green-500 text-green-700',
  failed: 'bg-red-50 border-red-500 text-red-700',
  queued: 'bg-blue-50 border-blue-500 text-blue-700',
  'in progress': 'bg-yellow-50 border-yellow-500 text-yellow-700',
  rejected: 'bg-orange-50 border-orange-500 text-orange-700',
};
```

### Compliance Colors
```typescript
const complianceColors = {
  critical: 'bg-red-50 border-red-500 text-red-700',    // < 40%
  warning: 'bg-yellow-50 border-yellow-500 text-yellow-700',  // 40-79%
  good: 'bg-blue-50 border-blue-500 text-blue-700',    // 80-99%
  complete: 'bg-green-50 border-green-500 text-green-700',  // 100%
};
```

---

## 📊 TABLE COLUMNS REFERENCE

### Submissions Table
```typescript
const submissionColumns = [
  { header: 'ID', accessorKey: 'id' },
  { header: 'Project', accessorKey: 'project_id' },
  { header: 'Node', accessorKey: 'node_id' },
  { header: 'Month', accessorKey: 'month' },
  { header: 'Compliance', accessorKey: 'event_compliance_percentage' },
  { header: 'Status', accessorKey: 'completeness_status' },
  { header: 'Date', accessorKey: 'created_at' },
  { header: 'Actions', id: 'actions' },
];
```

### Activity Logs Table (existing)
```typescript
const logColumns = [
  { header: 'Job ID', accessorKey: 'job_id' },
  { header: 'Category', accessorKey: 'project_category' },
  { header: 'Action', accessorKey: 'action' },
  { header: 'Status', accessorKey: 'status' },
  { header: 'User', accessorKey: 'user_id' },
  { header: 'Date', accessorKey: 'created_at' },
  { header: 'Actions', id: 'actions' },
];
```

### PERM Compliance Table
```typescript
const complianceColumns = [
  { header: 'Node', accessorKey: 'node_id' },
  { header: 'Month', accessorKey: 'month' },
  { header: 'Compliance', accessorKey: 'event_compliance_percentage' },
  { header: 'Events', accessorKey: 'total_events_submitted' },
  { header: 'Status', accessorKey: 'completeness_status' },
  { header: 'Actions', id: 'actions' },
];
```

---

## 🚀 QUICK START COMMANDS

### 1. Start Development Server
```bash
cd /Users/fadebowaley/saby/sabyFrontend/apps/isomorphic
npm run dev
```

### 2. View Existing Log Dashboard
```
http://localhost:3000/log-dashboard
```

### 3. Backend Running
```bash
# In separate terminal:
cd /Users/fadebowaley/saby/sabyBackend
npm run dev
```

---

## ✅ WEEK 1 CHECKLIST

**Day 1-2: API Services**
- [ ] Create `api/submissions.ts`
- [ ] Create `api/perm.ts`
- [ ] Create `api/analytics.ts`
- [ ] Add CRUD operations to `api/logs.ts`

**Day 3-4: Custom Hooks**
- [ ] Create `hooks/useSubmissions.ts`
- [ ] Create `hooks/usePERMCompliance.ts`
- [ ] Enhance `hooks/useActivityLogs.ts`

**Day 5: Testing**
- [ ] Test all API services
- [ ] Test all hooks
- [ ] Verify backend integration

---

## 📚 KEY RESOURCES

### Reference Files
- **Existing Dashboard:** `/log-dashboard/page.tsx`
- **Existing Table:** `/log-dashboard/LogTable.tsx`
- **Existing Hook:** `/hooks/useActivityLogs.ts`
- **Existing API:** `/api/logs.ts`

### Backend Documentation
- **API List:** `sabyBackend/SUBMISSION_ENDPOINTS_LIST.md`
- **Test Results:** `sabyBackend/✅_ENDPOINT_TESTING_COMPLETE.md`
- **Full Guide:** `sabyBackend/SUBMISSION_UI_TODO_IMPLEMENTATION.md`

### API Base URL
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
```

---

## 🎯 SUCCESS CRITERIA

### Week 1 (Foundation)
- ✅ All API services created
- ✅ All hooks created
- ✅ Integration tests passing

### Week 2 (Submissions Dashboard)
- ✅ Page renders correctly
- ✅ Table shows data
- ✅ Pagination works
- ✅ Filters work
- ✅ Actions work (view, retry)

### Week 3 (PERM Dashboard)
- ✅ Compliance data displayed
- ✅ Charts rendered
- ✅ Alerts working
- ✅ Node tracking functional

### Week 4 (Enhanced Logs)
- ✅ Bulk actions working
- ✅ Timeline view functional
- ✅ Charts displayed
- ✅ Export working

---

## 💡 PRO TIPS

1. **Copy & Adapt** - Don't start from scratch, copy from `log-dashboard`
2. **Test Incrementally** - Test each component as you build
3. **Use TypeScript** - Define interfaces for all data
4. **Follow Patterns** - Maintain consistency with existing code
5. **Mobile First** - Use Tailwind responsive classes
6. **Error Handling** - Always show loading/error states
7. **Performance** - Use useMemo, useCallback for optimization

---

## 🆘 NEED HELP?

### Common Issues

**API not connecting?**
- Check backend is running on port 4000
- Verify `NEXT_PUBLIC_API_URL` in `.env`
- Check auth token in browser DevTools

**Table not rendering?**
- Verify data structure matches interface
- Check TanStack Table configuration
- Look for console errors

**Hooks not updating?**
- Check useEffect dependencies
- Verify token exists in session
- Look for infinite loop warnings

---

## 📞 NEXT STEPS

1. **Read full guide:** `SUBMISSION_UI_TODO_IMPLEMENTATION.md`
2. **Start Phase 1:** Create API services & hooks
3. **Test integration:** Verify backend connectivity
4. **Build dashboard:** Start with submissions page
5. **Iterate:** Add features incrementally

---

**Ready to build? Start with Week 1!** 🚀

See detailed guide: `SUBMISSION_UI_TODO_IMPLEMENTATION.md`
