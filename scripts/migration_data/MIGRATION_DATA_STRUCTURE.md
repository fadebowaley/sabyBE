# 📊 Data Migration Structure Requirements

## 🎯 Migration Phases

| Phase | Order | Entity     | Dependencies              | Purpose                                    |
| ----- | ----- | ---------- | ------------------------- | ------------------------------------------ |
| 1     | 1st   | Roles      | None                      | Define user permissions and access levels  |
| 1     | 2nd   | Users      | Roles                     | Create user accounts with role assignments |
| 2     | 3rd   | Levels     | None                      | Define organizational hierarchy levels     |
| 2     | 4th   | Structures | Levels                    | Create organizational structure framework  |
| 2     | 5th   | Nodes      | Levels, Structures, Users | Create physical/logical locations          |

## 📋 Required Data Fields

### 🔐 Phase 1: Roles & Users

#### **roles.csv**

| Field         | Type   | Required | Validation        | Example                             |
| ------------- | ------ | -------- | ----------------- | ----------------------------------- |
| `name`        | String | ✅       | Unique per tenant | "Admin", "Manager", "Support Agent" |
| `description` | String | ❌       | Max 200 chars     | "Administrator with full access"    |

#### **users.csv**

| Field             | Type    | Required | Validation                | Example                |
| ----------------- | ------- | -------- | ------------------------- | ---------------------- |
| `email`           | String  | ✅       | Valid email, unique       | "john.doe@company.com" |
| `firstname`       | String  | ✅       | Trimmed, required         | "John"                 |
| `lastname`        | String  | ✅       | Trimmed, required         | "Doe"                  |
| `password`        | String  | ✅       | Min 8 chars, alphanumeric | "Password123!"         |
| `phoneNumber`     | String  | ❌       | Valid phone format        | "+1234567890"          |
| `isEmailVerified` | Boolean | ❌       | true/false                | true                   |
| `isPhoneVerified` | Boolean | ❌       | true/false                | true                   |
| `status`          | Boolean | ❌       | true/false                | true                   |
| `roles`           | String  | ❌       | Comma-separated           | "Admin,Manager"        |

### 🏗️ Phase 2: Levels, Structures & Nodes

#### **levels.csv**

| Field         | Type   | Required | Validation        | Example                         |
| ------------- | ------ | -------- | ----------------- | ------------------------------- |
| `name`        | String | ✅       | Unique per tenant | "Global", "Regional", "Country" |
| `description` | String | ❌       | Optional          | "Global corporate level"        |
| `rank`        | Number | ✅       | 1-10, unique      | 1, 2, 3                         |

#### **structures.csv**

| Field         | Type   | Required | Validation                   | Example                         |
| ------------- | ------ | -------- | ---------------------------- | ------------------------------- |
| `name`        | String | ✅       | Unique per tenant            | "Headquarters", "North America" |
| `code`        | String | ❌       | Optional                     | "HQ", "NA"                      |
| `type`        | String | ❌       | From enum list               | "headquarters", "region"        |
| `level`       | String | ✅       | Must exist in levels.csv     | "Global", "Regional"            |
| `parent`      | String | ❌       | Must exist in structures.csv | "Headquarters"                  |
| `description` | String | ❌       | Optional                     | "Main corporate HQ"             |

**Structure Types (enum):**

- `administrative`, `geographical`, `organizational`, `functional`
- `project`, `business-unit`, `customer`, `territory`
- `facility`, `service`, `warehouse`, `branch`, `division`
- `region`, `department`, `zone`, `hub`, `store`
- `community`, `headquarters`, `branch-office`, `sub-unit`
- `affiliate`, `outpost`, `data-center`, `subdivision`

#### **nodes.csv**

| Field                 | Type    | Required | Validation                   | Example                         |
| --------------------- | ------- | -------- | ---------------------------- | ------------------------------- |
| `name`                | String  | ✅       | Unique per tenant            | "Main Office", "NYC Branch"     |
| `level`               | String  | ✅       | Must exist in levels.csv     | "Global", "City"                |
| `structure`           | String  | ✅       | Must exist in structures.csv | "Headquarters", "New York"      |
| `parent`              | String  | ❌       | Must exist in nodes.csv      | "Main Office"                   |
| `address`             | String  | ❌       | Optional                     | "123 Corporate Blvd"            |
| `city`                | String  | ❌       | Optional                     | "New York"                      |
| `state`               | String  | ❌       | Optional                     | "NY"                            |
| `country`             | String  | ❌       | Optional                     | "USA"                           |
| `postalCode`          | String  | ❌       | Optional                     | "10001"                         |
| `dateOfEstablishment` | Date    | ❌       | YYYY-MM-DD format            | "2020-01-01"                    |
| `isMain`              | Boolean | ❌       | true/false                   | true                            |
| `users`               | String  | ❌       | Comma-separated emails       | "john@email.com,jane@email.com" |

## 🔗 Referential Integrity Rules

### **Dependencies Chain**

```
Users → Roles (many-to-many)
Structures → Levels (many-to-one)
Nodes → Levels (many-to-one)
Nodes → Structures (many-to-one)
Nodes → Nodes (self-referencing parent)
Nodes → Users (many-to-many)
```

### **Validation Rules**

1. **Roles**: No dependencies, can be created first
2. **Users**: Must reference existing roles
3. **Levels**: No dependencies, but rank must be unique
4. **Structures**: Must reference existing levels, optional parent structures
5. **Nodes**: Must reference existing levels and structures, optional parent nodes and users

## 📝 Sample Data Examples

### **Hierarchical Structure Example**

```
Global (Level 1)
├── Headquarters (Structure)
│   └── Main Office (Node)
│       └── North America (Structure, Level 2)
│           └── NA Operations (Node)
│               └── United States (Structure, Level 3)
│                   └── US Operations (Node)
│                       └── New York (Structure, Level 4)
│                           └── NYC Branch (Node)
│                               ├── Sales (Structure, Level 8)
│                               │   └── Sales Team (Node)
│                               └── Marketing (Structure, Level 8)
│                                   └── Marketing Team (Node)
```

### **User Assignment Example**

```
Sales Team (Node)
├── Users: john.doe@company.com, jane.smith@company.com
├── Level: Department (Level 8)
├── Structure: Sales
└── Parent: NYC Branch
```

## ⚠️ Critical Considerations

### **Data Validation**

- All email addresses must be valid format
- Phone numbers should follow international format
- Dates must be in YYYY-MM-DD format
- Boolean values must be "true" or "false" (string)
- Parent references must exist before child creation

### **Performance**

- Large datasets should be processed in batches
- Consider database indexes for large migrations
- Monitor memory usage during migration

### **Security**

- Passwords are automatically hashed
- All data is tenant-isolated
- No sensitive data should be in CSV files
- Use secure file transfer for CSV uploads

## 🚀 Migration Execution

### **Command Line**

```bash
# Install dependencies
cd scripts/migration_data
npm install

# Run migration
npm run migrate
# OR
node ../comprehensive_data_migration.js
```

### **Expected Output**

```
🚀 Initializing Data Migration...
✅ Connected to MongoDB
✅ Tenant ID: yawzTWT6ra
✅ Created By: 68b6ce7c22b060446e0abc94

📋 PHASE 1: Migrating Roles and Users
1️⃣ Migrating Roles...
   ✅ Created role: Admin
   ✅ Created role: Manager
   📊 Roles: 2 created, 0 errors

2️⃣ Migrating Users...
   ✅ Created user: john.doe@company.com
   ✅ Created user: jane.smith@company.com
   📊 Users: 2 created, 0 errors

✅ Phase 1 completed successfully!

📋 PHASE 2: Migrating Levels, Structures, and Nodes
1️⃣ Migrating Levels...
   ✅ Created level: Global (rank: 1)
   ✅ Created level: Regional (rank: 2)
   📊 Levels: 2 created, 0 errors

2️⃣ Migrating Structures...
   ✅ Created structure: Headquarters
   ✅ Created structure: North America
   📊 Structures: 2 created, 0 errors

3️⃣ Migrating Nodes...
   ✅ Created node: Main Office
   ✅ Created node: NA Operations
   📊 Nodes: 2 created, 0 errors

✅ Phase 2 completed successfully!

📊 MIGRATION SUMMARY REPORT
==================================================
ROLES:
  ✅ Created: 2
  ❌ Errors: 0
  📁 Total: 2

USERS:
  ✅ Created: 2
  ❌ Errors: 0
  📁 Total: 2

LEVELS:
  ✅ Created: 2
  ❌ Errors: 0
  📁 Total: 2

STRUCTURES:
  ✅ Created: 2
  ❌ Errors: 0
  📁 Total: 2

NODES:
  ✅ Created: 2
  ❌ Errors: 0
  📁 Total: 2

==================================================
TOTAL: 10 created, 0 errors
==================================================

🎉 Migration completed successfully!
🔌 Database disconnected
```
