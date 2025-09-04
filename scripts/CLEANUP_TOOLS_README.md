# 🧹 Database Cleanup Tools

This directory contains three powerful database cleanup tools for the Halo CRM system, each designed for different use cases and user types.

## 📋 Available Tools

### 1. `selective_cleanup.js` - Basic Selective Cleanup
**Purpose:** Simple command-line cleanup for the current tenant (fadebowaley@gmail.com)

**Usage:**
```bash
node scripts/selective_cleanup.js [collections...]
node scripts/selective_cleanup.js all
node scripts/selective_cleanup.js --help
```

**Examples:**
```bash
# Clean specific collections
node scripts/selective_cleanup.js users roles
node scripts/selective_cleanup.js levels structures nodes

# Clean all collections
node scripts/selective_cleanup.js all

# Show help
node scripts/selective_cleanup.js --help
```

**Features:**
- ✅ Tenant-isolated (only affects current tenant)
- ✅ Preserves tenant owner and Support Agent role
- ✅ Command-line interface
- ✅ Preview before deletion
- ✅ Detailed reporting

---

### 2. `tenant_cleanup.js` - Tenant-Specific Cleanup
**Purpose:** Super admin tool for cleaning any tenant by tenant ID

**Usage:**
```bash
node scripts/tenant_cleanup.js <tenantId> [collections...]
node scripts/tenant_cleanup.js <tenantId> all
node scripts/tenant_cleanup.js --list-tenants
node scripts/tenant_cleanup.js --help
```

**Examples:**
```bash
# List all tenants
node scripts/tenant_cleanup.js --list-tenants

# Clean specific tenant
node scripts/tenant_cleanup.js yawzTWT6ra users roles
node scripts/tenant_cleanup.js qs8Nr3CQWS all

# Show help
node scripts/tenant_cleanup.js --help
```

**Features:**
- ✅ Multi-tenant support
- ✅ Tenant listing with statistics
- ✅ Tenant validation
- ✅ Owner information display
- ✅ Preview before deletion
- ✅ Detailed reporting

---

### 3. `interactive_cleanup.js` - Interactive Terminal Interface
**Purpose:** User-friendly interactive cleanup with guided selection

**Usage:**
```bash
node scripts/interactive_cleanup.js
```

**Features:**
- ✅ Interactive tenant selection
- ✅ Interactive collection selection
- ✅ Data preview with samples
- ✅ Confirmation prompts
- ✅ User-friendly interface
- ✅ Multi-tenant support

---

## 🗂️ Available Collections

All tools support cleaning these collections:

| Collection | Description | Preserved Items |
|------------|-------------|-----------------|
| `users` | User accounts | Tenant owner |
| `roles` | User roles | Support Agent role |
| `levels` | Organizational hierarchy levels | None |
| `structures` | Organizational structures | None |
| `nodes` | Physical/logical nodes | None |

## 🔒 Safety Features

### Tenant Isolation
- All operations are tenant-scoped
- Other tenants' data remains untouched
- Multi-tenant architecture is respected

### Data Preservation
- Tenant owners are never deleted
- Support Agent role is preserved
- System-critical data is protected

### Validation
- Tenant existence validation
- Collection validation
- Data preview before deletion
- Confirmation prompts (interactive mode)

## 📊 Reporting

All tools provide detailed reports including:
- ✅ Deletion counts per collection
- ❌ Error counts and details
- 📁 Total records processed
- �� Tenant owner information
- 🎯 Target collections summary

## ⚠️ Important Notes

### Prerequisites
- Node.js environment
- MongoDB connection
- Proper database permissions
- `inquirer` package (for interactive mode)

### Installation
```bash
# Install required dependencies
npm install inquirer
```

### Backup Recommendations
- Always backup your database before cleanup
- Test on development environment first
- Use preview functionality to verify targets

### Multi-Tenant Considerations
- Each tenant operates independently
- No cross-tenant data access
- Tenant owners cannot be deleted
- Support Agent role is system-wide

## 🚀 Quick Start

### For Basic Cleanup (Current Tenant)
```bash
node scripts/selective_cleanup.js --help
```

### For Super Admin Operations
```bash
# List all tenants
node scripts/tenant_cleanup.js --list-tenants

# Clean specific tenant
node scripts/tenant_cleanup.js <tenantId> <collections>
```

### For Interactive Experience
```bash
node scripts/interactive_cleanup.js
```

## 🔧 Troubleshooting

### Common Issues

1. **"Tenant not found"**
   - Verify tenant ID exists
   - Use `--list-tenants` to see available tenants

2. **"No collections selected"**
   - Specify at least one collection
   - Use `all` to select all collections

3. **"Permission denied"**
   - Ensure proper database permissions
   - Check MongoDB connection

4. **"Module not found"**
   - Install required dependencies: `npm install inquirer`
   - Verify script paths

### Support
For issues or questions, check:
- Database connection status
- Tenant plugin configuration
- Model schema definitions
- MongoDB logs

---

**⚠️ WARNING: These tools permanently delete data. Always backup your database before use.**
