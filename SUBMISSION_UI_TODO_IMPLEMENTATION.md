# 📋 SUBMISSION UI TODO IMPLEMENTATION GUIDE

**Project:** sabyFrontend  
**Date:** October 23, 2025  
**Status:** Planning Phase  
**Backend APIs:** All 31 submission endpoints tested & working ✅

---

## 🎯 GOAL

Create comprehensive frontend UI tables and dashboards for managing all submission endpoints tested in the backend. Build upon the existing `/log-dashboard` template to provide users with complete visibility and control over:

1. **Submissions** (Main data)
2. **Activity Logs** (Already exists, needs enhancement)
3. **PERM Compliance** (Specialized reporting)
4. **Analytics & Reporting**
5. **Export & Management Tools**

---

## 📊 EXISTING STRUCTURE ANALYSIS

### Current Implementation:

**Location:** `/Users/fadebowaley/saby/sabyFrontend/apps/isomorphic/src/app/(berrylium)/log-dashboard/`

**Files:**

```
├── page.tsx            # Main page component
├── layout.tsx          # Layout wrapper
├── LogTable.tsx        # Activity logs table
└── StatCards.tsx       # Summary statistics cards
```

**Hooks Used:**

- `useActivityLogs.ts` - Fetches activity logs with real-time WebSocket updates
- Pattern: API service → Custom hook → Page component

**API Services:**

- `/app/lib/api/logs.ts` - Activity log API calls
- Uses axios with interceptors for auth

**Key Features:**

- ✅ Real-time WebSocket updates
- ✅ Pagination (TanStack Table)
- ✅ Filtering (status, search)
- ✅ Summary statistics cards
- ✅ Retry failed submissions
- ✅ Error handling & loading states

---

## 🗂️ NEW STRUCTURE TO BUILD

### 1. Submissions Dashboard (NEW) 🔥

**Route:** `/submissions` or `/submissions-dashboard`

**Purpose:** Main submissions management interface

**Features:**

- List all submissions with advanced filtering
- View submission details
- Retry failed submissions
- Export submissions (CSV/JSON)
- Multi-tenant isolation
- PERM-specific indicators

**Components:**

```
/submissions
├── page.tsx                       # Main dashboard
├── SubmissionsTable.tsx           # Main table
├── SubmissionDetails.tsx          # Modal/drawer for details
├── SubmissionFilters.tsx          # Advanced filters
├── SubmissionStats.tsx            # KPI cards
└── SubmissionActions.tsx          # Bulk actions
```

---

### 2. Enhanced Log Dashboard (ENHANCE) ✨

**Route:** `/log-dashboard` (existing)

**Enhancements:**

- Add bulk delete for activity logs
- Add advanced filtering (by action, user, job)
- Add timeline view for job activities
- Add export functionality
- Add activity trends chart

**New Components:**

```
/log-dashboard
├── page.tsx                       # (enhance existing)
├── LogTable.tsx                   # (enhance existing)
├── StatCards.tsx                  # (enhance existing)
├── LogTimeline.tsx                # NEW - Job timeline view
├── ActivityTrends.tsx             # NEW - Trend chart
├── BulkActions.tsx                # NEW - Bulk operations
└── AdvancedFilters.tsx            # NEW - Extended filters
```

---

### 3. PERM Compliance Dashboard (NEW) 🎯

**Route:** `/perm-dashboard` or `/compliance-dashboard`

**Purpose:** PERM-specific compliance tracking and monitoring

**Features:**

- Node compliance overview
- Monthly compliance trends
- Event tracking status
- Compliance alerts & warnings
- Node comparison
- Downloadable compliance reports

**Components:**

```
/perm-dashboard
├── page.tsx                       # Main dashboard
├── ComplianceOverview.tsx         # Summary cards
├── NodeComplianceTable.tsx        # Nodes with compliance %
├── MonthlyTrends.tsx              # Chart
├── EventTracking.tsx              # Event status grid
├── ComplianceAlerts.tsx           # Warnings & critical alerts
└── ComplianceFilters.tsx          # Month, node, project filters
```

---

### 4. Analytics & Reports (NEW) 📈

**Route:** `/submission-analytics` or `/reports`

**Purpose:** Data visualization and insights

**Features:**

- Submission trends over time
- Success/failure rates
- Top performing nodes
- Rejection reasons analysis
- Processing time metrics
- Custom date ranges

**Components:**

```
/analytics
├── page.tsx                       # Main analytics page
├── SubmissionTrends.tsx           # Line/bar chart
├── StatusDistribution.tsx         # Pie/donut chart
├── TopNodes.tsx                   # Leaderboard
├── RejectionAnalysis.tsx          # Reasons breakdown
├── ProcessingMetrics.tsx          # Performance stats
└── DateRangePicker.tsx            # Custom date selection
```

---

### 5. Export & Management Tools (NEW) 🛠️

**Route:** `/export-center` or integrate into existing dashboards

**Purpose:** Data export and management

**Features:**

- Export submissions (CSV/JSON)
- Export activity logs (CSV/JSON)
- Export compliance reports
- Scheduled exports
- Bulk operations (delete, retry, archive)

**Components:**

```
/export-center
├── page.tsx                       # Main export page
├── ExportSubmissions.tsx          # Submission export
├── ExportLogs.tsx                 # Log export
├── ExportCompliance.tsx           # PERM export
├── BulkOperations.tsx             # Bulk actions
└── ScheduledExports.tsx           # Automated exports
```

---

## 📁 FILE STRUCTURE OVERVIEW

```
sabyFrontend/apps/isomorphic/src/
├── app/
│   ├── (berrylium)/
│   │   ├── submissions/                    # NEW
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── [id]/
│   │   │   │   └── page.tsx               # Submission details
│   │   │   ├── SubmissionsTable.tsx
│   │   │   ├── SubmissionDetails.tsx
│   │   │   ├── SubmissionFilters.tsx
│   │   │   ├── SubmissionStats.tsx
│   │   │   └── SubmissionActions.tsx
│   │   │
│   │   ├── log-dashboard/                  # ENHANCE
│   │   │   ├── page.tsx                   # (enhance)
│   │   │   ├── LogTable.tsx               # (enhance)
│   │   │   ├── StatCards.tsx              # (enhance)
│   │   │   ├── LogTimeline.tsx            # NEW
│   │   │   ├── ActivityTrends.tsx         # NEW
│   │   │   ├── BulkActions.tsx            # NEW
│   │   │   └── AdvancedFilters.tsx        # NEW
│   │   │
│   │   ├── perm-dashboard/                 # NEW
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── ComplianceOverview.tsx
│   │   │   ├── NodeComplianceTable.tsx
│   │   │   ├── MonthlyTrends.tsx
│   │   │   ├── EventTracking.tsx
│   │   │   ├── ComplianceAlerts.tsx
│   │   │   └── ComplianceFilters.tsx
│   │   │
│   │   ├── analytics/                      # NEW
│   │   │   ├── page.tsx
│   │   │   ├── layout.tsx
│   │   │   ├── SubmissionTrends.tsx
│   │   │   ├── StatusDistribution.tsx
│   │   │   ├── TopNodes.tsx
│   │   │   ├── RejectionAnalysis.tsx
│   │   │   ├── ProcessingMetrics.tsx
│   │   │   └── DateRangePicker.tsx
│   │   │
│   │   └── export-center/                  # NEW
│   │       ├── page.tsx
│   │       ├── layout.tsx
│   │       ├── ExportSubmissions.tsx
│   │       ├── ExportLogs.tsx
│   │       ├── ExportCompliance.tsx
│   │       ├── BulkOperations.tsx
│   │       └── ScheduledExports.tsx
│   │
│   └── lib/
│       ├── api/
│       │   ├── logs.ts                     # (enhance)
│       │   ├── submissions.ts              # NEW
│       │   ├── perm.ts                     # NEW
│       │   ├── analytics.ts                # NEW
│       │   └── exports.ts                  # NEW
│       │
│       └── hooks/
│           ├── useActivityLogs.ts          # (enhance)
│           ├── useSubmissions.ts           # NEW
│           ├── usePERMCompliance.ts        # NEW
│           ├── useAnalytics.ts             # NEW
│           └── useExports.ts               # NEW
│
└── config/
    └── routes.ts                           # (add new routes)
```

---

## 🔧 IMPLEMENTATION PHASES

### Phase 1: API Services & Hooks (Week 1) 🏗️

**Priority:** HIGH  
**Estimated Time:** 3-4 days

#### Task 1.1: Create Submissions API Service

**File:** `src/app/lib/api/submissions.ts`

```typescript
// Submission API endpoints
import { api } from '../axios';

export interface SubmissionFilters {
  tenant_id?: string;
  project_id?: string;
  node_id?: string;
  month?: string;
  perm_enabled?: boolean;
  limit?: number;
  offset?: number;
}

export interface Submission {
  id: string;
  tenant_id: string;
  project_id: string;
  form_id: string;
  node_id?: string;
  month?: string;
  payload: any;
  perm_enabled: boolean;
  event_compliance_percentage?: number;
  completeness_status?: string;
  total_events_submitted?: number;
  total_events_required?: number;
  created_at: string;
  updated_at: string;
}

export interface PaginatedSubmissionsResponse {
  submissions: Submission[];
  total: number;
  limit: number;
  offset: number;
}

// GET /v1/submissions
export const getSubmissions = async (
  filters: SubmissionFilters,
  token: string
): Promise<PaginatedSubmissionsResponse> => {
  const response = await api.get('/submissions', {
    params: filters,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// GET /v1/submissions/:id
export const getSubmissionById = async (
  submissionId: string,
  token: string
): Promise<Submission> => {
  const response = await api.get(`/submissions/${submissionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// POST /v1/submissions/:id/retry
export const retrySubmission = async (
  submissionId: string,
  token: string
): Promise<void> => {
  const response = await api.post(
    `/submissions/${submissionId}/retry`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

// Additional endpoints...
```

**Success Criteria:**

- ✅ All submission endpoints mapped
- ✅ TypeScript interfaces defined
- ✅ Error handling implemented
- ✅ Token authentication added

---

#### Task 1.2: Create useSubmissions Hook

**File:** `src/app/lib/hooks/useSubmissions.ts`

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  getSubmissions,
  getSubmissionById,
  retrySubmission,
} from '../api/submissions';
import type { Submission, SubmissionFilters } from '../api/submissions';

interface UseSubmissionsOptions {
  filters?: SubmissionFilters;
  autoRefresh?: boolean;
  refreshInterval?: number;
  pageIndex?: number;
  pageSize?: number;
}

export const useSubmissions = (options: UseSubmissionsOptions = {}) => {
  const { data: session } = useSession();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissions = useCallback(async () => {
    if (!session?.user?.accessToken) return;

    setLoading(true);
    try {
      const filtersWithPagination = {
        ...options.filters,
        limit: options.pageSize || 25,
        offset: (options.pageIndex || 0) * (options.pageSize || 25),
      };

      const response = await getSubmissions(
        filtersWithPagination,
        session.user.accessToken
      );

      setSubmissions(response.submissions);
      setTotal(response.total);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch submissions');
    } finally {
      setLoading(false);
    }
  }, [
    session?.user?.accessToken,
    options.filters,
    options.pageIndex,
    options.pageSize,
  ]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const refresh = useCallback(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  return {
    submissions,
    total,
    loading,
    error,
    refresh,
  };
};
```

**Success Criteria:**

- ✅ Hook follows existing pattern
- ✅ Pagination support
- ✅ Filtering support
- ✅ Auto-refresh optional
- ✅ Error handling

---

#### Task 1.3: Create PERM Compliance API Service

**File:** `src/app/lib/api/perm.ts`

```typescript
import { api } from '../axios';

export interface PERMSubmission {
  id: string;
  node_id: string;
  month: string;
  event_compliance_percentage: number;
  completeness_status: string;
  total_events_submitted: number;
  total_events_required: number;
  events: Record<string, boolean>;
  locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface ComplianceSummary {
  total_submissions: number;
  complete_count: number;
  partial_count: number;
  incomplete_count: number;
  average_compliance: number;
}

// GET /v1/perm-submissions
export const getPERMSubmissions = async (filters: any, token: string) => {
  const response = await api.get('/perm-submissions', {
    params: filters,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// GET /v1/perm-submissions/compliance/summary
export const getComplianceSummary = async (
  token: string
): Promise<ComplianceSummary> => {
  const response = await api.get('/perm-submissions/compliance/summary', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// POST /v1/perm-submissions/:id/lock
export const lockPERMSubmission = async (
  submissionId: string,
  token: string
) => {
  const response = await api.post(
    `/perm-submissions/${submissionId}/lock`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

// POST /v1/perm-submissions/:id/unlock
export const unlockPERMSubmission = async (
  submissionId: string,
  token: string
) => {
  const response = await api.post(
    `/perm-submissions/${submissionId}/unlock`,
    {},
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};
```

**Success Criteria:**

- ✅ PERM-specific endpoints mapped
- ✅ Compliance interfaces defined
- ✅ Lock/unlock functionality
- ✅ Validation endpoint included

---

#### Task 1.4: Create usePERMCompliance Hook

**File:** `src/app/lib/hooks/usePERMCompliance.ts`

```typescript
'use client';

import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';
import { getPERMSubmissions, getComplianceSummary } from '../api/perm';
import type { PERMSubmission, ComplianceSummary } from '../api/perm';

export const usePERMCompliance = (filters: any = {}) => {
  const { data: session } = useSession();
  const [submissions, setSubmissions] = useState<PERMSubmission[]>([]);
  const [summary, setSummary] = useState<ComplianceSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!session?.user?.accessToken) return;

    setLoading(true);
    try {
      const [submissionsData, summaryData] = await Promise.all([
        getPERMSubmissions(filters, session.user.accessToken),
        getComplianceSummary(session.user.accessToken),
      ]);

      setSubmissions(submissionsData.submissions || []);
      setSummary(summaryData);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch PERM data');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.accessToken, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    submissions,
    summary,
    loading,
    error,
    refresh: fetchData,
  };
};
```

---

#### Task 1.5: Enhance Activity Logs API & Hook

**File:** `src/app/lib/api/logs.ts` (enhance)

**Add:**

```typescript
// PATCH /v1/submissions/activity-log/:id
export const updateActivityLog = async (
  logId: string,
  updates: { status?: string; notes?: string },
  token: string
) => {
  const response = await api.patch(
    `/submissions/activity-log/${logId}`,
    updates,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return response.data;
};

// DELETE /v1/submissions/activity-log/:id
export const deleteActivityLog = async (logId: string, token: string) => {
  const response = await api.delete(`/submissions/activity-log/${logId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// POST /v1/submissions/activity-log/bulk-delete
export const bulkDeleteActivityLogs = async (
  logIds: string[],
  token: string
) => {
  const response = await api.post(
    '/submissions/activity-log/bulk-delete',
    { ids: logIds },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

// GET /v1/submissions/activity-log/user/:user_id
export const getActivityLogsByUser = async (userId: string, token: string) => {
  const response = await api.get(`/submissions/activity-log/user/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// GET /v1/submissions/activity-log/job/:job_id
export const getActivityLogsByJob = async (jobId: string, token: string) => {
  const response = await api.get(`/submissions/activity-log/job/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};
```

---

### Phase 2: Submissions Dashboard (Week 2) 📊

**Priority:** HIGH  
**Estimated Time:** 4-5 days

#### Task 2.1: Create Submissions Page

**File:** `src/app/(berrylium)/submissions/page.tsx`

**Template:**

```typescript
'use client';

import PageHeader from '@/app/shared/page-header';
import SubmissionsTable from './SubmissionsTable';
import SubmissionStats from './SubmissionStats';
import SubmissionFilters from './SubmissionFilters';
import { useSubmissions } from '@/app/lib/hooks/useSubmissions';
import { useState, useMemo } from 'react';

const pageHeader = {
  title: 'Submissions Management',
  breadcrumb: [{ href: '/', name: 'Home' }, { name: 'Submissions' }],
};

export default function SubmissionsPage() {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 25,
  });

  const [filters, setFilters] = useState({
    project_id: '',
    node_id: '',
    month: '',
    perm_enabled: undefined,
  });

  const { submissions, total, loading, error, refresh } = useSubmissions({
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    filters,
  });

  // Calculate statistics
  const stats = useMemo(() => {
    return {
      total: total,
      perm: submissions.filter((s) => s.perm_enabled).length,
      complete: submissions.filter((s) => s.completeness_status === 'complete')
        .length,
      partial: submissions.filter((s) => s.completeness_status === 'partial')
        .length,
      incomplete: submissions.filter(
        (s) => s.completeness_status === 'incomplete'
      ).length,
    };
  }, [submissions, total]);

  if (loading && submissions.length === 0) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <>
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb} />
      <div className="mt-6 space-y-8">
        <SubmissionStats stats={stats} />
        <SubmissionFilters filters={filters} setFilters={setFilters} />
        <SubmissionsTable
          data={submissions}
          pagination={pagination}
          setPagination={setPagination}
          total={total}
        />
      </div>
    </>
  );
}
```

**Success Criteria:**

- ✅ Page follows existing structure
- ✅ Uses useSubmissions hook
- ✅ Pagination working
- ✅ Filtering working
- ✅ Stats displayed

---

#### Task 2.2: Create SubmissionsTable Component

**File:** `src/app/(berrylium)/submissions/SubmissionsTable.tsx`

**Pattern:** Copy from `LogTable.tsx`, adapt columns

**Columns:**

1. Submission ID
2. Project
3. Node
4. Month (if PERM)
5. Compliance % (if PERM)
6. Status
7. Date
8. Actions (View, Retry)

**Features:**

- TanStack Table
- Pagination
- Sortable columns
- Action buttons (view details, retry)
- PERM indicator badges

---

#### Task 2.3: Create SubmissionStats Component

**File:** `src/app/(berrylium)/submissions/SubmissionStats.tsx`

**Pattern:** Similar to `StatCards.tsx`

**Cards:**

1. Total Submissions
2. PERM Submissions
3. Complete (100%)
4. Partial (40-99%)
5. Incomplete (<40%)

---

#### Task 2.4: Create SubmissionFilters Component

**File:** `src/app/(berrylium)/submissions/SubmissionFilters.tsx`

**Filters:**

- Project dropdown
- Node dropdown
- Month picker
- PERM toggle
- Search (by ID)
- Date range

---

#### Task 2.5: Create SubmissionDetails Modal

**File:** `src/app/(berrylium)/submissions/SubmissionDetails.tsx`

**Content:**

- Full submission data
- Payload preview (JSON)
- Compliance details (if PERM)
- Event checklist (if PERM)
- Activity timeline
- Retry button
- Export button

---

### Phase 3: PERM Compliance Dashboard (Week 3) 📈

**Priority:** MEDIUM  
**Estimated Time:** 4-5 days

#### Task 3.1: Create PERM Dashboard Page

**File:** `src/app/(berrylium)/perm-dashboard/page.tsx`

**Sections:**

1. Compliance Overview Cards
2. Monthly Trends Chart
3. Node Compliance Table
4. Event Tracking Grid
5. Compliance Alerts

---

#### Task 3.2: Create ComplianceOverview Component

**Cards:**

- Total Nodes Tracked
- Average Compliance
- Complete Submissions
- Critical Alerts (<40%)
- Warnings (40-79%)

---

#### Task 3.3: Create NodeComplianceTable Component

**Columns:**

- Node Name
- Month
- Compliance %
- Events Submitted/Required
- Status
- Actions

**Features:**

- Color-coded compliance (red < 40%, yellow 40-79%, green >= 80%)
- Sortable by compliance
- Filter by month
- Drill-down to node details

---

#### Task 3.4: Create MonthlyTrends Component

**Chart:** Line chart showing compliance trends over time

**Options:**

- Multiple nodes comparison
- Date range selector
- Export chart

---

#### Task 3.5: Create EventTracking Component

**Grid:** Show all required events and their status across nodes

**Layout:**

```
Node     | Event 1 | Event 2 | Event 3 | Event 4 | Event 5 | Compliance
---------|---------|---------|---------|---------|---------|------------
Node A   |    ✓    |    ✓    |    ✗    |    ✓    |    ✗    |    60%
Node B   |    ✓    |    ✓    |    ✓    |    ✓    |    ✓    |   100%
```

---

#### Task 3.6: Create ComplianceAlerts Component

**Alerts:**

- Critical (<40% compliance) - Red badge
- Warning (40-79% compliance) - Orange badge
- Missing submissions - Yellow badge
- Late submissions - Gray badge

**Actions:**

- Send reminder
- View details
- Acknowledge alert

---

### Phase 4: Enhanced Log Dashboard (Week 4) ✨

**Priority:** MEDIUM  
**Estimated Time:** 3-4 days

#### Task 4.1: Enhance LogTable

**Add:**

- Bulk selection checkboxes
- Bulk delete action
- Export selected logs
- Advanced filtering drawer

---

#### Task 4.2: Create LogTimeline Component

**File:** `src/app/(berrylium)/log-dashboard/LogTimeline.tsx`

**Purpose:** Show all activities for a specific job in timeline format

**Features:**

- Vertical timeline
- Status indicators
- Time elapsed
- Error messages

---

#### Task 4.3: Create ActivityTrends Component

**File:** `src/app/(berrylium)/log-dashboard/ActivityTrends.tsx`

**Chart:** Bar/line chart showing activity over time

**Metrics:**

- Submissions per hour/day/week
- Success vs. failure rate
- Average processing time

---

#### Task 4.4: Create BulkActions Component

**File:** `src/app/(berrylium)/log-dashboard/BulkActions.tsx`

**Actions:**

- Bulk delete
- Bulk export
- Mark as reviewed

---

#### Task 4.5: Create AdvancedFilters Component

**File:** `src/app/(berrylium)/log-dashboard/AdvancedFilters.tsx`

**Filters:**

- Action type (queued, processing, completed, failed)
- Date range
- User ID
- Job ID
- Project
- Status

---

### Phase 5: Analytics & Reports (Week 5-6) 📊

**Priority:** LOW  
**Estimated Time:** 5-6 days

#### Task 5.1: Create Analytics Page

**File:** `src/app/(berrylium)/analytics/page.tsx`

**Sections:**

1. Submission Trends (line chart)
2. Status Distribution (pie chart)
3. Top Nodes (leaderboard)
4. Rejection Analysis (bar chart)
5. Processing Metrics (KPIs)

---

#### Task 5.2: Create SubmissionTrends Component

**Chart:** Line chart

**Metrics:**

- Submissions over time
- Success rate trend
- Compliance trend (PERM)

---

#### Task 5.3: Create StatusDistribution Component

**Chart:** Pie/Donut chart

**Data:**

- Success
- Failed
- Queued
- In Progress
- Rejected

---

#### Task 5.4: Create TopNodes Component

**Layout:** Leaderboard table

**Metrics:**

- Most submissions
- Highest compliance
- Best streak

---

#### Task 5.5: Create RejectionAnalysis Component

**Chart:** Bar chart

**Data:**

- Rejection reasons
- Count per reason
- Trend over time

---

### Phase 6: Export Center (Week 7) 🛠️

**Priority:** LOW  
**Estimated Time:** 3-4 days

#### Task 6.1: Create Export Center Page

**Features:**

- Export submissions
- Export activity logs
- Export compliance reports
- Scheduled exports

---

#### Task 6.2: Create Export Components

**Files:**

- `ExportSubmissions.tsx`
- `ExportLogs.tsx`
- `ExportCompliance.tsx`

**Features:**

- Format selection (CSV/JSON)
- Date range
- Filter options
- Download button

---

### Phase 7: Testing & Polish (Week 8) ✅

**Priority:** HIGH  
**Estimated Time:** 3-5 days

#### Task 7.1: Integration Testing

- Test all CRUD operations
- Test pagination
- Test filtering
- Test real-time updates
- Test error handling

---

#### Task 7.2: UI/UX Polish

- Responsive design
- Loading states
- Empty states
- Error states
- Tooltips & help text

---

#### Task 7.3: Performance Optimization

- Lazy loading
- Memoization
- Debounced filters
- Virtual scrolling (large tables)

---

#### Task 7.4: Documentation

- User guide
- Component documentation
- API documentation
- Deployment guide

---

## 🎨 UI/UX GUIDELINES

### Design System

**Use existing components from:**

- `@core/components/table` - TanStack Table
- `rizzui` - UI components (Button, Tooltip, etc.)
- `lucide-react` - Icons
- Tailwind CSS - Styling

### Color Coding

**Status Colors:**

```typescript
const statusColors = {
  success: 'bg-green-50 border-green-500 text-green-700',
  failed: 'bg-red-50 border-red-500 text-red-700',
  queued: 'bg-blue-50 border-blue-500 text-blue-700',
  'in progress': 'bg-yellow-50 border-yellow-500 text-yellow-700',
  rejected: 'bg-orange-50 border-orange-500 text-orange-700',
};

const complianceColors = {
  critical: 'bg-red-50 border-red-500 text-red-700', // < 40%
  warning: 'bg-yellow-50 border-yellow-500 text-yellow-700', // 40-79%
  good: 'bg-blue-50 border-blue-500 text-blue-700', // 80-99%
  complete: 'bg-green-50 border-green-500 text-green-700', // 100%
};
```

### Layout Pattern

```typescript
// Standard page structure
<>
  <PageHeader title={...} breadcrumb={...} />
  <div className="mt-6 space-y-8">
    <StatCards {...} />      // Summary KPIs
    <Filters {...} />        // Filtering options
    <DataTable {...} />      // Main data table
  </div>
</>
```

---

## 🔌 API INTEGRATION

### Pattern to Follow

```typescript
// 1. API Service (src/app/lib/api/submissions.ts)
export const getSubmissions = async (filters, token) => {
  const response = await api.get('/submissions', {
    params: filters,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

// 2. Custom Hook (src/app/lib/hooks/useSubmissions.ts)
export const useSubmissions = (options) => {
  const { data: session } = useSession();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!session?.user?.accessToken) return;
    setLoading(true);
    try {
      const result = await getSubmissions(filters, session.user.accessToken);
      setData(result);
    } catch (error) {
      // Handle error
    } finally {
      setLoading(false);
    }
  }, [session, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refresh: fetchData };
};

// 3. Page Component (src/app/(berrylium)/submissions/page.tsx)
export default function SubmissionsPage() {
  const { data, loading, refresh } = useSubmissions({ ... });

  return (
    <>
      <PageHeader {...} />
      <SubmissionsTable data={data} loading={loading} />
    </>
  );
}
```

---

## 📦 COMPONENT REUSABILITY

### Shared Components to Create

**File:** `src/app/shared/submission-components/`

```
├── StatusBadge.tsx          # Reusable status badge
├── ComplianceBadge.tsx      # Compliance percentage badge
├── DateFormatter.tsx        # Consistent date formatting
├── ActionMenu.tsx           # Dropdown action menu
├── ExportButton.tsx         # Generic export button
├── RefreshButton.tsx        # Manual refresh button
├── EmptyState.tsx           # No data state
└── LoadingSpinner.tsx       # Loading state
```

---

## 🚀 ROUTES CONFIGURATION

**File:** `src/config/routes.ts` (add)

```typescript
export const routes = {
  // ... existing routes

  submissions: {
    dashboard: '/submissions',
    details: (id: string) => `/submissions/${id}`,
  },

  perm: {
    dashboard: '/perm-dashboard',
    compliance: '/perm-dashboard/compliance',
  },

  analytics: {
    dashboard: '/analytics',
    submissions: '/analytics/submissions',
    compliance: '/analytics/compliance',
  },

  export: {
    center: '/export-center',
  },

  logs: '/log-dashboard', // existing
};
```

---

## 📊 DATA FLOW DIAGRAM

```
┌─────────────────┐
│   Backend API   │
│  (31 endpoints) │
└────────┬────────┘
         │
         │ axios with auth
         ▼
┌─────────────────┐
│  API Services   │
│  (logs.ts,      │
│   submissions.  │
│   ts, etc.)     │
└────────┬────────┘
         │
         │ async/await
         ▼
┌─────────────────┐
│  Custom Hooks   │
│  (useActivity   │
│   Logs, use     │
│   Submissions)  │
└────────┬────────┘
         │
         │ state management
         ▼
┌─────────────────┐
│ Page Components │
│  (page.tsx)     │
└────────┬────────┘
         │
         │ props
         ▼
┌─────────────────┐
│ UI Components   │
│  (Tables,       │
│   Cards, etc.)  │
└─────────────────┘
```

---

## 🧪 TESTING CHECKLIST

### Unit Tests

- [ ] API services
- [ ] Custom hooks
- [ ] Utility functions

### Integration Tests

- [ ] Submissions page flow
- [ ] Log dashboard flow
- [ ] PERM dashboard flow
- [ ] Filtering & pagination
- [ ] Real-time updates

### E2E Tests

- [ ] Login → View submissions
- [ ] Filter submissions
- [ ] View submission details
- [ ] Retry failed submission
- [ ] Export submissions
- [ ] View compliance dashboard

---

## 📈 SUCCESS METRICS

### Performance

- ⚡ Page load < 2s
- ⚡ API calls < 500ms
- ⚡ Real-time updates < 1s latency

### User Experience

- ✨ Responsive on all devices
- ✨ Intuitive navigation
- ✨ Clear error messages
- ✨ Loading states for all actions

### Functionality

- 🎯 All CRUD operations working
- 🎯 Pagination working correctly
- 🎯 Filters working as expected
- 🎯 Real-time updates functional
- 🎯 Export features working

---

## 🔜 FUTURE ENHANCEMENTS (Post-MVP)

### Phase 8: Advanced Features

- Saved filter presets
- Custom dashboard layouts
- Email notifications settings
- Webhook integrations
- API rate limiting UI
- Batch operations UI
- Submission templates
- Compliance forecasting
- AI-powered insights

### Phase 9: Mobile App

- React Native app
- Push notifications
- Offline support
- Mobile-optimized tables

---

## 📝 DEVELOPMENT NOTES

### Prerequisites

- Node.js 18+
- Next.js 14
- React 18
- TypeScript 5
- TanStack Table
- Axios
- Socket.io-client
- Chart.js or Recharts

### Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

### Code Standards

- TypeScript strict mode
- ESLint + Prettier
- Component naming: PascalCase
- File naming: camelCase
- Use functional components
- Use hooks for state management
- Follow existing patterns

---

## 📞 SUPPORT & RESOURCES

### Documentation

- Backend API: `sabyBackend/SUBMISSION_ENDPOINTS_LIST.md`
- Test Results: `sabyBackend/✅_ENDPOINT_TESTING_COMPLETE.md`
- Existing Log Dashboard: `/log-dashboard`

### Existing Examples

- Table: `log-dashboard/LogTable.tsx`
- Hook: `hooks/useActivityLogs.ts`
- API: `api/logs.ts`
- Stats Cards: `log-dashboard/StatCards.tsx`

---

## ✅ QUICK START CHECKLIST

**Week 1:**

- [ ] Create submissions API service
- [ ] Create useSubmissions hook
- [ ] Create PERM API service
- [ ] Create usePERMCompliance hook
- [ ] Enhance logs API with CRUD operations

**Week 2:**

- [ ] Create submissions page
- [ ] Create SubmissionsTable
- [ ] Create SubmissionStats
- [ ] Create SubmissionFilters
- [ ] Create SubmissionDetails modal

**Week 3:**

- [ ] Create PERM dashboard page
- [ ] Create ComplianceOverview
- [ ] Create NodeComplianceTable
- [ ] Create MonthlyTrends chart
- [ ] Create EventTracking grid

**Week 4:**

- [ ] Enhance LogTable with bulk actions
- [ ] Create LogTimeline component
- [ ] Create ActivityTrends chart
- [ ] Create BulkActions component
- [ ] Create AdvancedFilters

**Week 5-6:**

- [ ] Create analytics page
- [ ] Create SubmissionTrends chart
- [ ] Create StatusDistribution chart
- [ ] Create TopNodes leaderboard
- [ ] Create RejectionAnalysis

**Week 7:**

- [ ] Create export center
- [ ] Add export functionality
- [ ] Add scheduled exports

**Week 8:**

- [ ] Integration testing
- [ ] UI/UX polish
- [ ] Performance optimization
- [ ] Documentation

---

## 🎉 CONCLUSION

This implementation guide provides a comprehensive roadmap for building enterprise-grade submission management UI. Follow the phases sequentially, maintain code quality, and leverage existing patterns.

**Estimated Total Time:** 7-8 weeks  
**Team Size:** 2-3 frontend developers  
**Priority:** HIGH for Phase 1-2, MEDIUM for Phase 3-4, LOW for Phase 5-7

**Start with Phase 1 (API Services & Hooks) to establish the foundation, then move to Phase 2 (Submissions Dashboard) for immediate user value.**

Good luck! 🚀

