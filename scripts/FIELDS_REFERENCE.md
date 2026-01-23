# Fields Reference for User and Node Profile Updates

This document lists all fields that can be updated via the API for users and nodes. Use this as a guide when configuring the update script.

## User Fields

### Direct User Fields (Top-level)

| Field | Type | Description | Example Values |
|-------|------|-------------|----------------|
| `email` | string | User's email address | "user@example.com" |
| `password` | string | User's password (min 8 chars, must contain uppercase, lowercase, number, special char) | "SecurePass123!" |
| `firstname` | string | User's first name | "John" |
| `lastname` | string | User's last name | "Doe" |
| `phoneNumber` | string | Phone number (pattern: /^[+]?[1-9][\d]{0,15}$/) | "+2348012345678" |
| `isSuper` | boolean | Whether user is a super user | true / false |
| `isOwner` | boolean | Whether user is an owner | true / false |
| `isSaby` | boolean | Whether user is a Saby user | true / false |
| `isActive` | boolean | Whether user is active | true / false |
| `isEmailVerified` | boolean | Whether email is verified | true / false |
| `roles` | array | Array of role IDs (ObjectId strings) | ["507f1f77bcf86cd799439011"] |

### Profile Fields (Nested under `profile` object)

| Field | Type | Description | Valid Values / Examples |
|-------|------|-------------|------------------------|
| `title` | string | Title prefix | "Mr.", "Mrs.", "Miss", "Dr.", "Prof.", "Engr.", "Pastor", "Rev." |
| `otherName` | string | Middle name or other name | "A.", "B.", "Chukwu" |
| `gender` | string | Gender | "Male", "Female", "Other" |
| `dateOfBirth` | Date | Date of birth | ISO date string: "1990-01-15T00:00:00.000Z" |
| `highestQualification` | string | Highest educational qualification | "Primary", "Secondary", "Diploma", "Bachelors", "Masters", "PhD", "Post-graduate" |
| `professional` | string | Professional category | "Teacher", "Engineer", "Doctor", "Lawyer", etc. |
| `employmentCategory` | string | Employment category | "Full-time", "Part-time", "Self-employed", "Unemployed" |
| `occupation` | string | Job title/occupation | "Teacher", "Engineer", "Doctor", "Lawyer", "Business Owner", "Accountant", "Nurse", "Farmer", "Pastor", "Minister" |
| `employeeId` | string | Employee ID | "EMP00001", "HL-12345" |
| `officeTitle` | string | Office title in organization | "Pastor", "HOD", "Bishop", "Deacon", "Elder", "Minister", "Reverend", "Prophet" |
| `maritalStatus` | string | Marital status | "Single", "Married", "Divorced", "Widowed" |
| `stateOfOrigin` | string | State of origin | "Lagos", "Abuja", "Kano", "Rivers", "Ogun", "Kaduna", "Enugu", "Delta" |
| `lgaOfOrigin` | string | Local Government Area of origin | "Ikeja LGA", "Maitama LGA" |
| `homeTown` | string | Home town | "Ikeja", "Victoria Island", "Maitama", "Garki", "Kano City", "Port Harcourt" |
| `residentialAddress` | string | Residential address | "123 Main Street, Lagos" |
| `stateOfResidence` | string | State of residence | "Lagos", "Abuja", "Kano", etc. |
| `lgaOfResidence` | string | Local Government Area of residence | "Ikeja LGA", "Maitama LGA" |

### Spouse Fields (Nested under `profile.spouse` object)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Spouse's name | "Jane Doe" |
| `phoneNumber` | string | Spouse's phone number | "+2348012345678" |
| `dateOfBirth` | Date | Spouse's date of birth | ISO date string |

### Next of Kin Fields (Nested under `profile.nextOfKin` object)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `name` | string | Next of kin's name | "John Doe Sr." |
| `phoneNumber` | string | Next of kin's phone number | "+2348012345678" |
| `relationship` | string | Relationship to user | "Parent", "Sibling", "Spouse", "Other" |

### Custom Fields (Nested under `customFields` object)

Custom fields are tenant-specific and can be any key-value pairs. Common examples:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `yearsOfExperience` | number | Years of work experience | 5, 10, 15 |
| `monthlyIncome` | number | Monthly income in Naira | 50000, 200000, 500000 |
| `educationLevel` | string | Education level | "Primary", "Secondary", "Tertiary", "Post-graduate" |
| `department` | string | Department name | "Department 1", "IT Department" |
| `skills` | array | Array of skills | ["Communication", "Leadership", "Technical"] |

---

## Node Fields

### Direct Node Fields (Top-level)

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `level` | string | ObjectId of Level | "507f1f77bcf86cd799439011" |
| `parent` | string \| null | ObjectId of parent node | "507f1f77bcf86cd799439011" or null |
| `structure` | string | ObjectId of Structure | "507f1f77bcf86cd799439011" |
| `isMain` | boolean | Whether this is the main node | true / false |
| `isOwner` | boolean | Whether this is an owner node | true / false |
| `name` | string | Node name | "Headquarters", "Branch 1" |
| `address` | string | Street address | "123 Main Street" |
| `city` | string | City name | "Lagos", "Abuja", "Kano" |
| `state` | string | State name | "Lagos", "Abuja", "Kano", "Rivers" |
| `country` | string | Country name | "Nigeria" |
| `postalCode` | string | Postal/ZIP code | "100001", "23401" |
| `users` | array | Array of user IDs (ObjectId strings) | ["507f1f77bcf86cd799439011"] |
| `isActive` | boolean | Whether node is active | true / false |

### Profile Fields (Nested under `profile` object)

| Field | Type | Description | Valid Values / Examples |
|-------|------|-------------|------------------------|
| `dateOfEstablishment` | Date | Date when node was established | ISO date string: "2010-01-15T00:00:00.000Z" |
| `propertyStatus` | string | Property ownership status | "Owned", "Rented", "Leased", "Other" |
| `estimatedValue` | number | Estimated property value in Naira | 1000000, 5000000, 50000000 |
| `buildingType` | string | Type of building | "Auditorium", "Hall", "Tent", "Office", "Multi-purpose", "Church", "Mosque", "School", "Community Center" |
| `facilityStatus` | string | Facility operational status | "Active", "Inactive", "Under Construction" |
| `averageAttendance` | number | Average attendance (min: 0) | 100, 500, 2000, 5000 |
| `averageIncome` | number | Average income in Naira (min: 0) | 100000, 500000, 2000000 |

### Custom Fields (Nested under `customFields` object)

Custom fields are tenant-specific and can be any key-value pairs. Common examples:

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `seatingCapacity` | number | Maximum seating capacity | 100, 500, 2000, 5000 |
| `parkingSpaces` | number | Number of parking spaces | 10, 50, 200 |
| `numberOfFloors` | number | Number of floors | 1, 2, 3, 5 |
| `wifiAvailable` | boolean | Whether WiFi is available | true / false |
| `airConditioning` | boolean | Whether air conditioning is available | true / false |
| `generatorAvailable` | boolean | Whether generator is available | true / false |

---

## Update Script Configuration

The script `update-profiles-via-api.js` uses the following configuration arrays for random data generation. You can modify these arrays to customize the data that will be generated:

### User Data Options

```javascript
const GENDER_OPTIONS = ['Male', 'Female', 'Other'];
const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Widowed'];
const TITLE_OPTIONS = ['Mr.', 'Mrs.', 'Miss', 'Dr.', 'Prof.', 'Engr.', 'Pastor', 'Rev.'];
const STATE_OPTIONS = ['Lagos', 'Abuja', 'Kano', 'Rivers', 'Ogun', 'Kaduna', 'Enugu', 'Delta', 'Port Harcourt', 'Ibadan'];
const OCCUPATION_OPTIONS = ['Teacher', 'Engineer', 'Doctor', 'Lawyer', 'Business Owner', 'Accountant', 'Nurse', 'Farmer', 'Pastor', 'Minister'];
const EMPLOYMENT_CATEGORY_OPTIONS = ['Full-time', 'Part-time', 'Self-employed', 'Unemployed'];
const QUALIFICATION_OPTIONS = ['Primary', 'Secondary', 'Diploma', 'Bachelors', 'Masters', 'PhD', 'Post-graduate'];
const OFFICE_TITLE_OPTIONS = ['Pastor', 'HOD', 'Bishop', 'Deacon', 'Elder', 'Minister', 'Reverend', 'Prophet'];
const HOMETOWN_OPTIONS = ['Ikeja', 'Victoria Island', 'Maitama', 'Garki', 'Kano City', 'Port Harcourt', 'Abeokuta', 'Kaduna City', 'Enugu City', 'Asaba'];
```

### Node Data Options

```javascript
const PROPERTY_STATUS_OPTIONS = ['Owned', 'Rented', 'Leased', 'Other'];
const BUILDING_TYPE_OPTIONS = ['Auditorium', 'Hall', 'Tent', 'Office', 'Multi-purpose', 'Church', 'Mosque', 'School', 'Community Center'];
const FACILITY_STATUS_OPTIONS = ['Active', 'Inactive', 'Under Construction'];
```

---

## API Endpoints

- **Update User**: `PATCH /v1/users/:userId`
- **Update Node**: `PATCH /v1/nodes/:nodeId`

Both endpoints require authentication via Bearer token.

---

## Notes

1. **Profile Object**: Most profile fields should be nested under the `profile` object when updating via API.

2. **Custom Fields**: Custom fields are tenant-specific and can be any key-value pairs. The script includes common examples, but you should customize these based on your tenant's custom field configuration.

3. **Date Fields**: Date fields should be provided as ISO 8601 strings (e.g., "1990-01-15T00:00:00.000Z") or Date objects.

4. **Numeric Fields**: 
   - `estimatedValue` and `averageIncome` are in Naira
   - `averageAttendance` is a count (minimum 0)

5. **Validation**: All fields are validated according to the validation schemas. Invalid values will cause the update to fail.

6. **Batch Processing**: The script processes updates in batches of 10 to avoid overwhelming the API and includes delays between batches.

---

## Usage

1. Update the configuration section in `update-profiles-via-api.js`:
   - Set `AUTH_EMAIL` and `AUTH_PASSWORD`
   - Set `API_BASE_URL` if different from default
   - Customize the data generation options arrays

2. Run the script:
   ```bash
   node scripts/update-profiles-via-api.js
   ```

3. The script will:
   - Authenticate using the provided credentials
   - Fetch all users and nodes for the tenant
   - Update each user and node with generated data
   - Display a summary of updates

