# 🎨 SUBMISSION UI - DESIGN SYSTEM & PATTERNS

**Based on:** Existing sabyFrontend patterns  
**Framework:** Next.js 14, React 18, TypeScript  
**UI Library:** rizzui + @core components  
**Icons:** lucide-react + react-icons/pi

---

## 📦 EXISTING COMPONENTS TO REUSE

### 1. Card Components (@core/components/cards/)

#### MetricCard - **USE THIS!** ⭐

```typescript
import MetricCard from '@core/components/cards/metric-card';

<MetricCard
  title="Total Submissions"
  metric="12,450"
  icon={<Activity className="h-7 w-7" />}
  iconClassName="bg-transparent w-11 h-11"
  chart={<YourChart />} // optional
  className="@container"
/>;
```

**Features:**

- Title + metric display
- Icon support
- Optional chart integration
- Responsive with @container queries
- Trend indicators support

**Example from existing code:**

```typescript
// From: src/app/shared/logistics/dashboard/stat-cards.tsx
<MetricCard
  title="Revenue"
  metric={1390}
  icon={<RevenueUpIcon className="h-7 w-7" />}
  graphIcon={<TrendingUpIcon className="me-1 h-4 w-4" />}
  graphColor="text-green"
  percentage="+32.40"
/>
```

---

#### WidgetCard - For complex widgets

```typescript
import WidgetCard from '@core/components/cards/widget-card';

<WidgetCard
  title="Submission Trends"
  action={<DropdownAction />}
  className="dark:bg-gray-100/50"
>
  <YourContent />
</WidgetCard>;
```

---

### 2. Table Components (@core/components/table/)

#### TanStack Table - **USE THIS!** ⭐

```typescript
import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';

const { table } = useTanStackTable<YourDataType>({
  tableData: data,
  columnConfig: columns,
  options: {
    state: { pagination },
    manualPagination: true,
    totalCount: total,
    onPaginationChange: setPagination,
    enableColumnResizing: false,
  },
});

<Table
  table={table}
  variant="modern"  // or "minimal", "elegant", "retro"
  classNames={{
    container: 'border border-muted rounded-md',
    rowClassName: 'last:border-0',
  }}
/>
<TableFooter table={table} />
<TablePagination table={table} />
```

**Existing Pattern from log-dashboard:**

```typescript
// From: src/app/(berrylium)/log-dashboard/LogTable.tsx
const logColumns = [
  {
    header: 'Job ID',
    accessorKey: 'job_id',
    cell: ({ getValue }: any) => (
      <span className="font-mono text-xs text-gray-700">{getValue()}</span>
    ),
  },
  {
    header: 'Status',
    accessorKey: 'status',
    cell: ({ row, getValue }: any) => {
      const status = getValue();
      return (
        <span
          className={cn(
            'inline-block rounded-full border px-3 py-1 text-xs font-semibold',
            statusBadge(status)
          )}
        >
          {status}
        </span>
      );
    },
  },
  // ... more columns
];
```

---

### 3. UI Components (rizzui)

#### Button

```typescript
import { Button } from 'rizzui';

<Button
  size="sm" // xs, sm, md, lg, xl
  variant="solid" // solid, outline, flat, text
  color="primary" // default, primary, secondary, danger, warning, success, info
  rounded="md" // none, sm, DEFAULT, md, lg, full, pill
  className="..."
>
  Click Me
</Button>;
```

#### Badge

```typescript
import { Badge } from 'rizzui';

<Badge
  color="success" // default, primary, secondary, danger, warning, success, info
  variant="solid" // solid, flat, outline
  size="sm" // sm, DEFAULT, lg, xl
  rounded="md" // none, sm, DEFAULT, md, lg, full, pill
>
  Active
</Badge>;
```

#### Tooltip

```typescript
import { Tooltip } from 'rizzui';

<Tooltip
  content="Helpful message"
  placement="top" // top, bottom, left, right
  color="dark" // dark, light
>
  <YourComponent />
</Tooltip>;
```

#### Dropdown

```typescript
import { Dropdown, ActionIcon } from 'rizzui';
import { PiDotsThreeBold } from 'react-icons/pi';

<Dropdown>
  <Dropdown.Trigger>
    <ActionIcon variant="outline" rounded="full">
      <PiDotsThreeBold className="h-6 w-6" />
    </ActionIcon>
  </Dropdown.Trigger>
  <Dropdown.Menu>
    <Dropdown.Item onClick={handleEdit}>Edit</Dropdown.Item>
    <Dropdown.Item onClick={handleDelete}>Delete</Dropdown.Item>
  </Dropdown.Menu>
</Dropdown>;
```

#### Modal

```typescript
import { Modal, Button } from 'rizzui';

<Modal isOpen={isOpen} onClose={onClose} size="lg">
  <Modal.Header>Title</Modal.Header>
  <Modal.Body>Content</Modal.Body>
  <Modal.Footer>
    <Button onClick={onClose}>Close</Button>
    <Button onClick={onSave}>Save</Button>
  </Modal.Footer>
</Modal>;
```

---

## 🎨 ICONS LIBRARY

### Lucide React Icons (PRIMARY) ⭐

**Installation:** Already installed

```bash
import { IconName } from 'lucide-react';
```

#### Commonly Used Icons by Category:

**Status Icons:**

```typescript
import {
  CheckCircle, // Success, Complete
  XCircle, // Error, Failed
  AlertTriangle, // Warning, Alert
  AlertCircle, // Info, Notice
  Clock, // Pending, In Progress
  Activity, // Active, Processing
} from 'lucide-react';
```

**Action Icons:**

```typescript
import {
  RefreshCw, // Refresh, Retry
  Download, // Export, Download
  Upload, // Import, Upload
  Send, // Submit, Send
  Eye, // View, Preview
  Edit3, // Edit
  Trash2, // Delete
  Copy, // Duplicate, Copy
  Share, // Share
  Settings, // Settings, Configure
} from 'lucide-react';
```

**Navigation Icons:**

```typescript
import {
  ChevronDown, // Expand
  ChevronUp, // Collapse
  ChevronRight, // Next, Forward
  ChevronLeft, // Previous, Back
  ArrowRight, // Move Right
  ArrowLeft, // Move Left
  Minimize2, // Minimize
  Maximize2, // Maximize
} from 'lucide-react';
```

**Data Icons:**

```typescript
import {
  BarChart3, // Charts, Analytics
  TrendingUp, // Growth, Increase
  TrendingDown, // Decline, Decrease
  FileText, // Document, File
  Filter, // Filter, Sort
  Calendar, // Date, Schedule
  Users, // Users, Team
  Globe, // Global, Public
} from 'lucide-react';
```

**Form Icons:**

```typescript
import {
  Search, // Search
  Plus, // Add, Create
  Minus, // Remove, Subtract
  Check, // Confirm, Validate
  X, // Close, Cancel
} from 'lucide-react';
```

**Specialized:**

```typescript
import {
  Zap, // Speed, Power
  Power, // On/Off
  PowerOff, // Disabled
  Code, // Code, Developer
  Webhook, // API, Webhook
  ExternalLink, // External
} from 'lucide-react';
```

### React Icons (Phosphor) - Secondary

```typescript
import {
  PiDotsThreeBold, // More options
  PiCaretDoubleUpDuotone, // Increase trend
  PiCaretDoubleDownDuotone, // Decrease trend
  PiTrendUpBold, // Trending up
  PiTrendDownBold, // Trending down
  PiCheckCircle, // Success
  PiTrashSimple, // Delete
  PiWarningCircle, // Warning
  PiProhibitInset, // Block
  PiMagnifyingGlassBold, // Search
} from 'react-icons/pi';
```

**Icon Usage Pattern:**

```typescript
// Standard size
<CheckCircle className="h-5 w-5" />

// Small
<CheckCircle className="h-4 w-4" />

// Large
<CheckCircle className="h-7 w-7" />

// With color
<CheckCircle className="h-5 w-5 text-green-600" />

// In button
<Button>
  <RefreshCw className="h-4 w-4 mr-2" />
  Refresh
</Button>
```

---

## 🎨 COLOR SYSTEM

### Status Colors (USE THESE!) ⭐

```typescript
// Success (Green)
const success = {
  bg: 'bg-green-50',
  border: 'border-green-500',
  text: 'text-green-700',
  icon: 'text-green-600',
  full: 'bg-green-50 border-green-500 text-green-700',
};

// Error/Failed (Red)
const error = {
  bg: 'bg-red-50',
  border: 'border-red-500',
  text: 'text-red-700',
  icon: 'text-red-600',
  full: 'bg-red-50 border-red-500 text-red-700',
};

// Warning (Yellow/Orange)
const warning = {
  bg: 'bg-yellow-50',
  border: 'border-yellow-500',
  text: 'text-yellow-700',
  icon: 'text-yellow-600',
  full: 'bg-yellow-50 border-yellow-500 text-yellow-700',
};

// Info/Queued (Blue)
const info = {
  bg: 'bg-blue-50',
  border: 'border-blue-500',
  text: 'text-blue-700',
  icon: 'text-blue-600',
  full: 'bg-blue-50 border-blue-500 text-blue-700',
};

// In Progress (Purple/Indigo)
const inProgress = {
  bg: 'bg-purple-50',
  border: 'border-purple-500',
  text: 'text-purple-700',
  icon: 'text-purple-600',
  full: 'bg-purple-50 border-purple-500 text-purple-700',
};

// Rejected (Orange)
const rejected = {
  bg: 'bg-orange-50',
  border: 'border-orange-500',
  text: 'text-orange-700',
  icon: 'text-orange-600',
  full: 'bg-orange-50 border-orange-500 text-orange-700',
};
```

### Compliance Colors (PERM-Specific)

```typescript
// Critical (< 40%)
const critical = {
  bg: 'bg-red-50',
  border: 'border-red-500',
  text: 'text-red-700',
  badge: 'bg-red-100 text-red-800',
};

// Warning (40-79%)
const warning = {
  bg: 'bg-yellow-50',
  border: 'border-yellow-500',
  text: 'text-yellow-700',
  badge: 'bg-yellow-100 text-yellow-800',
};

// Good (80-99%)
const good = {
  bg: 'bg-blue-50',
  border: 'border-blue-500',
  text: 'text-blue-700',
  badge: 'bg-blue-100 text-blue-800',
};

// Complete (100%)
const complete = {
  bg: 'bg-green-50',
  border: 'border-green-500',
  text: 'text-green-700',
  badge: 'bg-green-100 text-green-800',
};
```

### Helper Function (Copy This!)

```typescript
// Status badge helper
const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    success: 'bg-green-50 border-green-500 text-green-700',
    failed: 'bg-red-50 border-red-500 text-red-700',
    queued: 'bg-blue-50 border-blue-500 text-blue-700',
    'in progress': 'bg-purple-50 border-purple-500 text-purple-700',
    rejected: 'bg-orange-50 border-orange-500 text-orange-700',
  };
  return (
    colors[status.toLowerCase()] || 'bg-gray-50 border-gray-300 text-gray-700'
  );
};

// Compliance color helper
const getComplianceColor = (percentage: number) => {
  if (percentage === 100) return 'bg-green-50 border-green-500 text-green-700';
  if (percentage >= 80) return 'bg-blue-50 border-blue-500 text-blue-700';
  if (percentage >= 40) return 'bg-yellow-50 border-yellow-500 text-yellow-700';
  return 'bg-red-50 border-red-500 text-red-700';
};

// Icon color helper
const getStatusIcon = (status: string) => {
  const icons: Record<string, { Icon: any; color: string }> = {
    success: { Icon: CheckCircle, color: 'text-green-600' },
    failed: { Icon: XCircle, color: 'text-red-600' },
    queued: { Icon: Clock, color: 'text-blue-600' },
    'in progress': { Icon: Activity, color: 'text-purple-600' },
    rejected: { Icon: AlertTriangle, color: 'text-orange-600' },
  };
  return (
    icons[status.toLowerCase()] || { Icon: AlertCircle, color: 'text-gray-600' }
  );
};
```

---

## 📐 LAYOUT PATTERNS

### Standard Page Layout ⭐

```typescript
'use client';

import PageHeader from '@/app/shared/page-header';

const pageHeader = {
  title: 'Page Title',
  breadcrumb: [{ href: '/', name: 'Home' }, { name: 'Current Page' }],
};

export default function YourPage() {
  return (
    <>
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb} />
      <div className="mt-6 space-y-8">{/* Your content */}</div>
    </>
  );
}
```

### Grid Layouts (COPY THESE!)

```typescript
// Stat Cards Grid
<div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5 3xl:gap-8 4xl:gap-9">
  {cards.map(card => <StatCard key={card.id} {...card} />)}
</div>

// 2-Column Layout
<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
  <LeftComponent />
  <RightComponent />
</div>

// 3-Column Layout
<div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>

// 4-Column Layout
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

### Spacing System

```typescript
// Consistent spacing
const spacing = {
  section: 'mt-6 space-y-8', // Between major sections
  card: 'p-6', // Card padding
  cardSmall: 'p-4', // Small card padding
  cardLarge: 'p-8', // Large card padding
  gap: 'gap-5 3xl:gap-8 4xl:gap-9', // Grid gaps
};
```

---

## 🎯 STAT CARD PATTERN (COPY THIS!) ⭐

### Version 1: Simple Metric Card

```typescript
import MetricCard from '@core/components/cards/metric-card';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
} from 'lucide-react';

const statData = [
  {
    id: '1',
    title: 'Total Submissions',
    metric: '12,450',
    icon: <Activity className="h-7 w-7" />,
    iconClassName: 'bg-transparent text-blue-600',
  },
  {
    id: '2',
    title: 'Successful',
    metric: '8,920',
    icon: <CheckCircle className="h-7 w-7" />,
    iconClassName: 'bg-transparent text-green-600',
  },
  {
    id: '3',
    title: 'Failed',
    metric: '450',
    icon: <XCircle className="h-7 w-7" />,
    iconClassName: 'bg-transparent text-red-600',
  },
  {
    id: '4',
    title: 'In Progress',
    metric: '1,580',
    icon: <Clock className="h-7 w-7" />,
    iconClassName: 'bg-transparent text-yellow-600',
  },
  {
    id: '5',
    title: 'Queued',
    metric: '1,500',
    icon: <TrendingUp className="h-7 w-7" />,
    iconClassName: 'bg-transparent text-purple-600',
  },
];

export default function StatCards() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5 3xl:gap-8 4xl:gap-9">
      {statData.map((stat) => (
        <MetricCard
          key={stat.id}
          title={stat.title}
          metric={stat.metric}
          icon={stat.icon}
          iconClassName={stat.iconClassName}
        />
      ))}
    </div>
  );
}
```

### Version 2: With Trend Indicators

```typescript
import MetricCard from '@core/components/cards/metric-card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  PiCaretDoubleUpDuotone,
  PiCaretDoubleDownDuotone,
} from 'react-icons/pi';
import { Text } from 'rizzui';

const statWithTrend = {
  title: 'Revenue',
  metric: '$1,390',
  icon: <Activity className="h-7 w-7" />,
  increased: true,
  percentage: '32.40',
};

<MetricCard
  title={statWithTrend.title}
  metric={statWithTrend.metric}
  icon={statWithTrend.icon}
>
  <Text className="mt-5 flex items-center border-t border-dashed border-muted pt-4 text-gray-500">
    <Text
      as="span"
      className={cn(
        'me-2 inline-flex items-center font-medium',
        statWithTrend.increased ? 'text-green' : 'text-red'
      )}
    >
      {statWithTrend.increased ? (
        <PiCaretDoubleUpDuotone className="me-1 h-4 w-4" />
      ) : (
        <PiCaretDoubleDownDuotone className="me-1 h-4 w-4" />
      )}
      {statWithTrend.percentage}%
    </Text>
    {statWithTrend.increased ? 'Increased' : 'Decreased'} last month
  </Text>
</MetricCard>;
```

### Version 3: Custom StatCard Component

```typescript
import { Box, Flex, Text, Badge, Title } from 'rizzui';
import { PiTrendUpBold, PiTrendDownBold } from 'react-icons/pi';
import cn from '@core/utils/class-names';

interface StatCardProps {
  title: string;
  metric: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    increased: boolean;
  };
  className?: string;
}

export function StatCard({
  title,
  metric,
  icon,
  trend,
  className,
}: StatCardProps) {
  return (
    <Box
      className={cn(
        'space-y-3 rounded-lg border border-muted p-6 dark:bg-[#181818]',
        className
      )}
    >
      <Flex justify="between" align="center">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100">
            {icon}
          </div>
          <Text className="font-semibold text-gray-900">{title}</Text>
        </div>
        {trend && (
          <Badge
            style={{
              backgroundColor: trend.increased ? '#C0F2CC' : '#FCECD6',
              color: trend.increased ? '#22973F' : '#EE6D3D',
            }}
          >
            <span className="pe-1">{trend.value}%</span>
            {trend.increased ? (
              <PiTrendUpBold className="size-3" />
            ) : (
              <PiTrendDownBold className="size-3" />
            )}
          </Badge>
        )}
      </Flex>

      <Title className="text-3xl font-normal leading-none">{metric}</Title>
    </Box>
  );
}
```

---

## 🔄 STATUS BADGE COMPONENT (COPY THIS!)

```typescript
import { Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import { CheckCircle, XCircle, Clock, Activity, AlertTriangle } from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  showIcon?: boolean;
}

export function StatusBadge({ status, showIcon = true }: StatusBadgeProps) {
  const getConfig = (status: string) => {
    const configs: Record<string, {
      className: string;
      Icon: any;
      label: string;
    }> = {
      success: {
        className: 'bg-green-50 border-green-500 text-green-700',
        Icon: CheckCircle,
        label: 'Success',
      },
      failed: {
        className: 'bg-red-50 border-red-500 text-red-700',
        Icon: XCircle,
        label: 'Failed',
      },
      queued: {
        className: 'bg-blue-50 border-blue-500 text-blue-700',
        Icon: Clock,
        label: 'Queued',
      },
      'in progress': {
        className: 'bg-yellow-50 border-yellow-500 text-yellow-700',
        Icon: Activity,
        label: 'In Progress',
      },
      rejected: {
        className: 'bg-orange-50 border-orange-500 text-orange-700',
        Icon: AlertTriangle,
        label: 'Rejected',
      },
    };
    return configs[status.toLowerCase()] || {
      className: 'bg-gray-50 border-gray-300 text-gray-700',
      Icon: Activity,
      label: status,
    };
  };

  const config = getConfig(status);
  const { Icon } = config;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold',
        config.className
      )}
    >
      {showIcon && <Icon className="h-3.5 w-3.5" />}
      {config.label}
    </span>
  );
}

// Usage
<StatusBadge status="success" />
<StatusBadge status="failed" showIcon={false} />
```

---

## 📊 TABLE COLUMN PATTERNS (COPY THIS!)

### Submissions Table Columns

```typescript
import { StatusBadge } from './StatusBadge';
import { Tooltip, Button } from 'rizzui';
import { Eye, RefreshCw, MoreVertical } from 'lucide-react';
import cn from '@core/utils/class-names';

const submissionColumns = [
  {
    header: 'Submission ID',
    accessorKey: 'id',
    size: 180,
    cell: ({ getValue }: any) => (
      <span className="font-mono text-xs text-gray-700">
        {getValue()?.substring(0, 8)}...
      </span>
    ),
  },
  {
    header: 'Project',
    accessorKey: 'project_id',
    cell: ({ getValue }: any) => (
      <span className="font-medium text-gray-900">{getValue()}</span>
    ),
  },
  {
    header: 'Node',
    accessorKey: 'node_id',
    cell: ({ getValue }: any) => (
      <span className="text-sm text-gray-600">{getValue() || 'N/A'}</span>
    ),
  },
  {
    header: 'Month',
    accessorKey: 'month',
    cell: ({ getValue }: any) => {
      const month = getValue();
      return month ? (
        <span className="text-sm text-gray-600">
          {new Date(month).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
          })}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      );
    },
  },
  {
    header: 'Compliance',
    accessorKey: 'event_compliance_percentage',
    cell: ({ getValue, row }: any) => {
      const percentage = getValue();
      if (!row.original.perm_enabled)
        return <span className="text-gray-400">—</span>;

      const getColor = (p: number) => {
        if (p === 100) return 'text-green-600 bg-green-50';
        if (p >= 80) return 'text-blue-600 bg-blue-50';
        if (p >= 40) return 'text-yellow-600 bg-yellow-50';
        return 'text-red-600 bg-red-50';
      };

      return (
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
            getColor(percentage)
          )}
        >
          {percentage}%
        </span>
      );
    },
  },
  {
    header: 'Status',
    accessorKey: 'completeness_status',
    cell: ({ getValue }: any) => {
      const status = getValue();
      return status ? (
        <StatusBadge status={status} />
      ) : (
        <span className="text-gray-400">—</span>
      );
    },
  },
  {
    header: 'Date',
    accessorKey: 'created_at',
    cell: ({ getValue }: any) => (
      <span className="text-sm text-gray-600">
        {new Date(getValue()).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    ),
  },
  {
    header: () => <MoreVertical className="mx-auto h-4 w-4 text-gray-400" />,
    id: 'actions',
    size: 80,
    cell: ({ row }: any) => (
      <div className="flex items-center justify-center gap-2">
        <Tooltip content="View Details">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleView(row.original.id)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </Tooltip>
        {row.original.status === 'failed' && (
          <Tooltip content="Retry Submission">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRetry(row.original.id)}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </Tooltip>
        )}
      </div>
    ),
  },
];
```

---

## 🎨 CHART PATTERNS

### Simple Bar Chart (from existing code)

```typescript
import { BarChart, Bar, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={60}>
  <BarChart barSize={5} barGap={2} data={chartData}>
    <Bar dataKey="value" fill="#3b82f6" radius={5} />
  </BarChart>
</ResponsiveContainer>;
```

### Line Chart (from existing code)

```typescript
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <XAxis dataKey="month" />
    <YAxis />
    <Tooltip />
    <Line
      type="monotone"
      dataKey="compliance"
      stroke="#3b82f6"
      strokeWidth={2}
    />
  </LineChart>
</ResponsiveContainer>;
```

---

## 🚨 EMPTY STATES

```typescript
import { Empty, EmptyProductBoxIcon } from 'rizzui';

<Empty
  image={<EmptyProductBoxIcon />}
  text="No submissions found"
  textClassName="mt-4 text-gray-500"
/>;
```

---

## ⚡ LOADING STATES

```typescript
// Spinner
<div className="flex items-center justify-center py-12">
  <div className="text-center">
    <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-gray-900"></div>
    <p className="text-gray-600">Loading...</p>
  </div>
</div>

// Skeleton (for tables)
<div className="animate-pulse space-y-4">
  {[1, 2, 3, 4, 5].map((i) => (
    <div key={i} className="h-12 bg-gray-200 rounded"></div>
  ))}
</div>
```

---

## 🎯 FILTER COMPONENTS

```typescript
import { Input, Select } from 'rizzui';
import { Search, Filter } from 'lucide-react';

<div className="flex flex-wrap items-center gap-4">
  {/* Search */}
  <div className="relative min-w-[200px]">
    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
    <Input
      type="text"
      placeholder="Search..."
      className="pl-10"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
    />
  </div>

  {/* Status Filter */}
  <Select
    value={status}
    onChange={(value) => setStatus(value)}
    options={[
      { value: '', label: 'All Statuses' },
      { value: 'success', label: 'Success' },
      { value: 'failed', label: 'Failed' },
    ]}
    className="min-w-[150px]"
  />

  {/* Refresh Button */}
  <Button onClick={refresh} variant="outline">
    <RefreshCw className="h-4 w-4 mr-2" />
    Refresh
  </Button>
</div>;
```

---

## 📱 RESPONSIVE PATTERNS

```typescript
// Mobile-first grid
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

// Hide on mobile
<div className="hidden md:block">

// Show only on mobile
<div className="block md:hidden">

// Responsive text
<h1 className="text-2xl md:text-3xl lg:text-4xl">

// Responsive spacing
<div className="p-4 md:p-6 lg:p-8">
```

---

## ✅ COMPLETE COMPONENT EXAMPLE

### Submissions Page (Full Example)

```typescript
'use client';

import PageHeader from '@/app/shared/page-header';
import MetricCard from '@core/components/cards/metric-card';
import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import TablePagination from '@core/components/table/pagination';
import { useState, useMemo } from 'react';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Search,
  RefreshCw,
} from 'lucide-react';
import { Input, Select, Button } from 'rizzui';
import { useSubmissions } from '@/app/lib/hooks/useSubmissions';
import cn from '@core/utils/class-names';

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
    status: '',
    search: '',
  });

  const { submissions, total, loading, error, refresh } = useSubmissions({
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    filters,
  });

  // Stats calculation
  const stats = useMemo(() => {
    return [
      {
        id: '1',
        title: 'Total Submissions',
        metric: total.toString(),
        icon: <Activity className="h-7 w-7" />,
        iconClassName: 'bg-transparent text-blue-600',
      },
      {
        id: '2',
        title: 'Successful',
        metric: submissions
          .filter((s) => s.status === 'success')
          .length.toString(),
        icon: <CheckCircle className="h-7 w-7" />,
        iconClassName: 'bg-transparent text-green-600',
      },
      {
        id: '3',
        title: 'Failed',
        metric: submissions
          .filter((s) => s.status === 'failed')
          .length.toString(),
        icon: <XCircle className="h-7 w-7" />,
        iconClassName: 'bg-transparent text-red-600',
      },
      {
        id: '4',
        title: 'In Progress',
        metric: submissions
          .filter((s) => s.status === 'in progress')
          .length.toString(),
        icon: <Clock className="h-7 w-7" />,
        iconClassName: 'bg-transparent text-yellow-600',
      },
      {
        id: '5',
        title: 'Queued',
        metric: submissions
          .filter((s) => s.status === 'queued')
          .length.toString(),
        icon: <TrendingUp className="h-7 w-7" />,
        iconClassName: 'bg-transparent text-purple-600',
      },
    ];
  }, [submissions, total]);

  const { table } = useTanStackTable({
    tableData: submissions,
    columnConfig: submissionColumns,
    options: {
      state: { pagination },
      manualPagination: true,
      totalCount: total,
      onPaginationChange: setPagination,
    },
  });

  if (loading && submissions.length === 0) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={refresh} />;
  }

  return (
    <>
      <PageHeader title={pageHeader.title} breadcrumb={pageHeader.breadcrumb} />

      <div className="mt-6 space-y-8">
        {/* Stats */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5 3xl:gap-8 4xl:gap-9">
          {stats.map((stat) => (
            <MetricCard
              key={stat.id}
              title={stat.title}
              metric={stat.metric}
              icon={stat.icon}
              iconClassName={stat.iconClassName}
            />
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search submissions..."
              className="pl-10"
              value={filters.search}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, search: e.target.value }))
              }
            />
          </div>

          <Select
            value={filters.status}
            onChange={(value) =>
              setFilters((prev) => ({ ...prev, status: value }))
            }
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'success', label: 'Success' },
              { value: 'failed', label: 'Failed' },
              { value: 'queued', label: 'Queued' },
            ]}
            className="min-w-[150px]"
          />

          <Button onClick={refresh} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Table */}
        <div>
          <Table
            table={table}
            variant="modern"
            classNames={{
              container: 'border border-muted rounded-md',
              rowClassName: 'last:border-0',
            }}
          />
          <TablePagination
            table={table}
            className="py-4"
            totalPages={Math.ceil(total / pagination.pageSize)}
          />
        </div>
      </div>
    </>
  );
}
```

---

## 🎯 QUICK REFERENCE

### Component Imports Checklist

```typescript
// Page Structure
import PageHeader from '@/app/shared/page-header';

// Cards
import MetricCard from '@core/components/cards/metric-card';
import WidgetCard from '@core/components/cards/widget-card';

// Table
import Table from '@core/components/table';
import { useTanStackTable } from '@core/components/table/custom/use-TanStack-Table';
import TablePagination from '@core/components/table/pagination';
import TableFooter from '@core/components/table/footer';

// UI Components
import { Button, Badge, Tooltip, Dropdown, Modal, Input, Select } from 'rizzui';

// Icons
import { CheckCircle, XCircle, Clock, Activity, RefreshCw } from 'lucide-react';
import { PiCaretDoubleUpDuotone, PiDotsThreeBold } from 'react-icons/pi';

// Utilities
import cn from '@core/utils/class-names';
```

---

**This design system ensures consistency, reusability, and aesthetic excellence across all submission UI components!** 🎨✨

