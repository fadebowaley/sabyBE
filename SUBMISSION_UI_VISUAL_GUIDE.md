# 🎨 SUBMISSION UI - VISUAL COMPONENT GUIDE

**Quick visual reference for building beautiful submission UIs**

---

## 📊 STAT CARDS - 5 Visual Styles

### Style 1: Simple Metric (Recommended) ⭐
```
┌──────────────────────────────────────┐
│  [📊]  Total Submissions            │
│                                      │
│       12,450                         │
│                                      │
└──────────────────────────────────────┘
```
**Colors:** Blue icon, Dark text  
**Use:** Main KPIs, counts

---

### Style 2: With Trend Indicator
```
┌──────────────────────────────────────┐
│  Revenue              [↑ +32.4%]     │
│                                      │
│       $1,390                         │
│  ─────────────────────────           │
│  ↑ Increased last month              │
└──────────────────────────────────────┘
```
**Colors:** Green arrow + badge  
**Use:** Metrics with change

---

### Style 3: With Mini Chart
```
┌──────────────────────────────────────┐
│  [📊] Sales            [Chart ▅▃▄▆]  │
│                                      │
│       12,390                         │
│  ─────────────────────────           │
│  ↑ +32.40% Increased                 │
└──────────────────────────────────────┘
```
**Use:** Trending data

---

### Style 4: Comparison Card
```
┌──────────────────────────────────────┐
│  New Customers         [↑ +4.5%]     │
│                                      │
│       3,450                          │
│                                      │
│  vs last month: 3,302                │
└──────────────────────────────────────┘
```
**Use:** Period comparisons

---

### Style 5: Status Grid (5 columns)
```
┌────────┬────────┬────────┬────────┬────────┐
│ Total  │Success │Failed  │Progress│ Queued │
│ [📊]   │  [✓]   │  [✗]   │  [⏰]  │  [↗]   │
│ 12,450 │ 8,920  │  450   │ 1,580  │ 1,500  │
└────────┴────────┴────────┴────────┴────────┘
```
**Colors:** Blue, Green, Red, Yellow, Purple  
**Use:** Dashboard overview

---

## 📋 TABLE LAYOUTS

### Layout 1: Standard Data Table
```
┌─────────────────────────────────────────────────────────────┐
│  [🔍 Search...] [All Statuses ▼] [🔄 Refresh]              │
├─────────────────────────────────────────────────────────────┤
│ ID       │ Project  │ Node    │ Status    │ Date      │ •••│
├─────────────────────────────────────────────────────────────┤
│ abc123   │ Proj-01  │ Node-A  │ ✓ Success │ Oct 23   │ ⋮  │
│ def456   │ Proj-02  │ Node-B  │ ⏰ Queue  │ Oct 23   │ ⋮  │
│ ghi789   │ Proj-03  │ Node-C  │ ✗ Failed  │ Oct 22   │ ⋮  │
└─────────────────────────────────────────────────────────────┘
  « 1 2 3 4 5 »  Showing 1-25 of 450
```

---

### Layout 2: Compliance Table (PERM)
```
┌─────────────────────────────────────────────────────────────┐
│  Node      │ Month    │ Compliance │ Events │ Status       │
├─────────────────────────────────────────────────────────────┤
│ Church-01  │ Oct 2025 │  [100%] ✓  │  5/5   │ Complete     │
│ Church-02  │ Oct 2025 │  [80%]     │  4/5   │ Good         │
│ Church-03  │ Oct 2025 │  [60%]  ⚠  │  3/5   │ Partial      │
│ Church-04  │ Oct 2025 │  [20%]  🔴 │  1/5   │ Critical     │
└─────────────────────────────────────────────────────────────┘
```
**Color Coding:**
- 100%: Green ✓
- 80-99%: Blue
- 40-79%: Yellow ⚠
- <40%: Red 🔴

---

## 🎨 STATUS BADGES

### Success States
```
✓ Success    [Green: #22c55e]
✓ Complete   [Green: #22c55e]
✓ Active     [Green: #22c55e]
```

### Error States
```
✗ Failed     [Red: #ef4444]
✗ Error      [Red: #ef4444]
✗ Rejected   [Orange: #f97316]
```

### Pending States
```
⏰ Pending   [Yellow: #eab308]
⏰ In Progress [Purple: #a855f7]
⏰ Queued    [Blue: #3b82f6]
```

### Visual Style
```
┌────────────┐
│ ✓ Success  │  ← Rounded pill
└────────────┘
  Green bg with dark green text and border
```

---

## 📈 COMPLIANCE INDICATORS

### Visual Scale
```
Critical    Warning     Good        Complete
  20%        60%        85%         100%
  🔴         ⚠️          📘           ✓
  Red      Yellow      Blue        Green
```

### Progress Bars
```
100% ██████████████████████████████ Complete
 85% █████████████████████░░░░░░░░░ Good
 60% ████████████████░░░░░░░░░░░░░░ Warning  
 20% ██████░░░░░░░░░░░░░░░░░░░░░░░░ Critical
```

---

## 🎯 ICON SYSTEM

### Status Icons (lucide-react)
```
✓  CheckCircle     [Success]
✗  XCircle         [Failed]
⚠️  AlertTriangle   [Warning]
ℹ️  AlertCircle     [Info]
⏰  Clock           [Pending]
📊  Activity        [Active]
```

### Action Icons
```
🔄  RefreshCw      [Refresh/Retry]
📥  Download       [Export]
📤  Upload         [Import]
✏️  Edit3          [Edit]
👁️  Eye            [View]
🗑️  Trash2         [Delete]
⚙️  Settings       [Configure]
```

### Navigation Icons
```
▼  ChevronDown    [Expand]
▲  ChevronUp      [Collapse]
▶  ChevronRight   [Next]
◀  ChevronLeft    [Previous]
```

---

## 🎨 COLOR PALETTE

### Status Colors
```
Success:  #22c55e  ████  bg-green-50 border-green-500 text-green-700
Error:    #ef4444  ████  bg-red-50 border-red-500 text-red-700
Warning:  #eab308  ████  bg-yellow-50 border-yellow-500 text-yellow-700
Info:     #3b82f6  ████  bg-blue-50 border-blue-500 text-blue-700
Progress: #a855f7  ████  bg-purple-50 border-purple-500 text-purple-700
```

### Compliance Colors
```
Critical: #ef4444  ████  < 40%  Red
Warning:  #eab308  ████  40-79% Yellow
Good:     #3b82f6  ████  80-99% Blue
Complete: #22c55e  ████  100%   Green
```

---

## 📐 SPACING & SIZING

### Component Spacing
```
┌────────────────────────────────────────┐
│  mt-6                                  │
│  ┌──────────────────────────────────┐ │
│  │  Card padding: p-6               │ │
│  │                                  │ │
│  │  space-y-8                       │ │
│  └──────────────────────────────────┘ │
│                                        │
│  ┌──────────────────────────────────┐ │
│  │  Another Card                    │ │
│  └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

### Grid Gaps
```
Small:  gap-4   (1rem / 16px)
Medium: gap-5   (1.25rem / 20px)
Large:  gap-8   (2rem / 32px)
XLarge: gap-9   (2.25rem / 36px)
```

---

## 📱 RESPONSIVE BREAKPOINTS

### Grid Responsiveness
```
Mobile (< 640px):   1 column
Tablet (≥ 640px):   2 columns
Desktop (≥ 1024px): 5 columns (for stats)
                    3 columns (for cards)
```

### Visual Example
```
Mobile:
┌───────┐
│ Card  │
├───────┤
│ Card  │
├───────┤
│ Card  │
└───────┘

Desktop:
┌─────┬─────┬─────┬─────┬─────┐
│Card │Card │Card │Card │Card │
└─────┴─────┴─────┴─────┴─────┘
```

---

## 🎯 FILTER BAR LAYOUT

```
┌────────────────────────────────────────────────────────────┐
│  🔍 [Search by ID or Name...] [Status ▼] [Date ▼] [🔄]    │
└────────────────────────────────────────────────────────────┘
   └─ Input (200px)      └─Select  └─Date  └─Button
```

---

## 📊 DASHBOARD LAYOUTS

### 5-Section Dashboard
```
┌─────────────────────────────────────────────────────────────┐
│  📊 Submissions Dashboard                          [Home >] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────┬────┬────┬────┬────┐  ← Stats (5 columns)           │
│  │Tot │Succ│Fail│Prog│Que │                                │
│  └────┴────┴────┴────┴────┘                                │
│                                                              │
│  ┌──────────────────────────────────────────────┐           │
│  │  🔍 Filters                                  │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
│  ┌──────────────────────────────────────────────┐           │
│  │                                               │           │
│  │  Table (25 rows)                             │           │
│  │                                               │           │
│  └──────────────────────────────────────────────┘           │
│                                                              │
│  « 1 2 3 4 5 »  Showing 1-25 of 450                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 MODAL/DRAWER PATTERNS

### Detail Modal
```
┌─────────────────────────────────────────────┐
│  Submission Details                    [×]  │
├─────────────────────────────────────────────┤
│                                             │
│  ID:        abc123def456                   │
│  Project:   Healthcare PERM                │
│  Status:    ✓ Complete                     │
│                                             │
│  ┌───────────────────────────────────────┐ │
│  │ Payload (JSON)                        │ │
│  │ {                                     │ │
│  │   "event1": true,                     │ │
│  │   "event2": true                      │ │
│  │ }                                     │ │
│  └───────────────────────────────────────┘ │
│                                             │
│  [Close]                      [🔄 Retry]   │
└─────────────────────────────────────────────┘
```

---

## ✅ AESTHETICS CHECKLIST

### Visual Excellence
- [ ] **Consistent spacing** (use mt-6, space-y-8, gap-5)
- [ ] **Color harmony** (stick to status color palette)
- [ ] **Icon consistency** (lucide-react throughout)
- [ ] **Typography scale** (text-3xl → text-xs)
- [ ] **Rounded corners** (rounded-lg for cards, rounded-full for badges)
- [ ] **Border usage** (border-muted, border-2 for emphasis)
- [ ] **Shadow depth** (shadow-sm for cards)
- [ ] **Hover states** (hover:bg-gray-50, hover:border-gray-400)
- [ ] **Dark mode support** (dark:bg-gray-800)
- [ ] **Mobile responsive** (grid-cols-1 md:grid-cols-2)

---

## 🎯 COMPONENT HIERARCHY

```
Page
├── PageHeader (breadcrumbs, title)
├── Stats Section
│   └── Grid of MetricCards (5 columns)
├── Filters Section
│   ├── Search Input
│   ├── Dropdowns
│   └── Action Buttons
└── Data Section
    ├── Table (TanStack)
    ├── TableFooter
    └── TablePagination
```

---

## 🎨 MODERN DESIGN PRINCIPLES

### 1. Whitespace ⭐
```
Good:
┌─────────────────┐
│                 │  ← Padding: p-6
│  Content Here   │
│                 │
└─────────────────┘

Bad:
┌─────────────────┐
│Content Here     │  ← Too tight
└─────────────────┘
```

### 2. Visual Hierarchy
```
Page Title        → text-3xl font-bold
Section Title     → text-xl font-semibold
Card Title        → text-sm font-semibold
Body Text         → text-sm
Secondary Text    → text-xs text-gray-500
```

### 3. Color Consistency
- Use **ONE** color per status
- Don't mix color meanings
- Keep backgrounds light (50 shade)
- Keep text dark (700 shade)
- Keep borders medium (500 shade)

---

**Use this visual guide while implementing to ensure consistency!** 🎨✨
