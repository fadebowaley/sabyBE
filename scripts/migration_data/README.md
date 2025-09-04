# Data Migration System

This directory contains the CSV templates and migration script for comprehensive data migration in the Halo system.

## 📁 Files

### Migration Script

- `../comprehensive_data_migration.js` - Main migration script

### CSV Templates

- `roles.csv` - Role definitions
- `users.csv` - User accounts
- `levels.csv` - Hierarchy levels
- `structures.csv` - Organizational structures
- `nodes.csv` - Physical/Logical nodes

## 🚀 Migration Order

The migration follows a specific order to maintain referential integrity:

### Phase 1: Foundation

1. **Roles** - Create user roles and permissions
2. **Users** - Create user accounts with role assignments

### Phase 2: Structure

3. **Levels** - Create hierarchy levels (Global → Individual)
4. **Structures** - Create organizational structures
5. **Nodes** - Create physical/logical nodes

## 📊 CSV Template Structure

### roles.csv

| Field       | Type   | Required | Description        |
| ----------- | ------ | -------- | ------------------ |
| name        | String | ✅       | Role name (unique) |
| description | String | ❌       | Role description   |

### users.csv

| Field           | Type    | Required | Description                |
| --------------- | ------- | -------- | -------------------------- |
| email           | String  | ✅       | User email (unique)        |
| firstname       | String  | ✅       | First name                 |
| lastname        | String  | ✅       | Last name                  |
| password        | String  | ✅       | Password (min 8 chars)     |
| phoneNumber     | String  | ❌       | Phone number               |
| isEmailVerified | Boolean | ❌       | Email verification status  |
| isPhoneVerified | Boolean | ❌       | Phone verification status  |
| status          | Boolean | ❌       | User active status         |
| roles           | String  | ❌       | Comma-separated role names |

### levels.csv

| Field       | Type   | Required | Description           |
| ----------- | ------ | -------- | --------------------- |
| name        | String | ✅       | Level name (unique)   |
| description | String | ❌       | Level description     |
| rank        | Number | ✅       | Hierarchy rank (1-10) |

### structures.csv

| Field       | Type   | Required | Description                              |
| ----------- | ------ | -------- | ---------------------------------------- |
| name        | String | ✅       | Structure name (unique)                  |
| code        | String | ❌       | Structure code                           |
| type        | String | ❌       | Structure type (default: administrative) |
| level       | String | ✅       | Level name (must exist)                  |
| parent      | String | ❌       | Parent structure name                    |
| description | String | ❌       | Structure description                    |

**Structure Types:**

- administrative, geographical, organizational, functional
- project, business-unit, customer, territory
- facility, service, warehouse, branch, division
- region, department, zone, hub, store
- community, headquarters, branch-office, sub-unit
- affiliate, outpost, data-center, subdivision

### nodes.csv

| Field               | Type    | Required | Description                     |
| ------------------- | ------- | -------- | ------------------------------- |
| name                | String  | ✅       | Node name (unique)              |
| level               | String  | ✅       | Level name (must exist)         |
| structure           | String  | ✅       | Structure name (must exist)     |
| parent              | String  | ❌       | Parent node name                |
| address             | String  | ❌       | Physical address                |
| city                | String  | ❌       | City                            |
| state               | String  | ❌       | State/Province                  |
| country             | String  | ❌       | Country                         |
| postalCode          | String  | ❌       | Postal/ZIP code                 |
| dateOfEstablishment | Date    | ❌       | Establishment date (YYYY-MM-DD) |
| isMain              | Boolean | ❌       | Is main node (true/false)       |
| users               | String  | ❌       | Comma-separated user emails     |

## 🔧 Usage

### 1. Install Dependencies

```bash
npm install csv-parser csv-writer
```

### 2. Prepare CSV Files

- Copy the template files
- Fill in your actual data
- Ensure referential integrity (parent names exist)

### 3. Run Migration

```bash
node scripts/comprehensive_data_migration.js
```

## ⚠️ Important Notes

1. **Backup First**: Always backup your database before migration
2. **Data Validation**: Ensure CSV data is properly formatted
3. **Referential Integrity**: Parent structures/nodes must exist before children
4. **Tenant Isolation**: All data is created under the same tenant as fadebowaley@gmail.com
5. **Duplicate Prevention**: Existing records are skipped automatically

## 🔍 Troubleshooting

### Common Issues

- **CSV Format**: Ensure proper CSV formatting with commas
- **Missing References**: Check that parent structures/nodes exist
- **Permission Errors**: Ensure database connection and permissions
- **Validation Errors**: Check required fields and data types

### Debug Mode

The script provides detailed logging for each step. Check the console output for specific error messages.

## 📈 Migration Results

The script generates a comprehensive report showing:

- Number of records created
- Number of errors encountered
- Detailed status for each entity type
- Total migration summary

## 🔄 Re-running Migration

The script is idempotent - it can be run multiple times safely:

- Existing records are skipped
- New records are created
- No duplicate data is generated
