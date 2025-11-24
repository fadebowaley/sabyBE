# Bulk User Import Guide

## Overview

This guide explains how to bulk import users via CSV/Excel files through the web interface.

## Required Fields

The following fields are **REQUIRED** for each user:

| Field       | Type   | Description                                                                    | Example                |
| ----------- | ------ | ------------------------------------------------------------------------------ | ---------------------- |
| `firstname` | String | User's first name                                                              | "John"                 |
| `lastname`  | String | User's last name                                                               | "Doe"                  |
| `email`     | String | User's email (must be unique, valid email format)                              | "john.doe@example.com" |
| `password`  | String | User's password (min 8 chars, must contain at least one letter and one number) | "Password123!"         |

## Optional Fields

The following fields are **OPTIONAL**:

| Field             | Type           | Description                             | Example                                   | Default |
| ----------------- | -------------- | --------------------------------------- | ----------------------------------------- | ------- |
| `phoneNumber`     | String         | User's phone number (with country code) | "+1234567890"                             | `null`  |
| `roles`           | String/Array   | Comma-separated role names or ObjectIds | "Admin,Manager"                           | `[]`    |
| `status`          | Boolean/String | User status                             | `true`, `false`, `"Active"`, `"Inactive"` | `false` |
| `isEmailVerified` | Boolean        | Email verification status               | `true`, `false`                           | `false` |
| `isPhoneVerified` | Boolean        | Phone verification status               | `true`, `false`                           | `false` |

## System Flags (Cannot be Set)

For security reasons, the following system flags **CANNOT** be set via bulk import:

- `isOwner` - Always defaults to `false`
- `isSuper` - Always defaults to `false`
- `isSaby` - Always defaults to `false`

These flags can only be set by authorized users through the regular user creation/update interface.

## CSV Format

### Basic Format

```csv
firstname,lastname,email,password,phoneNumber,roles,status,isEmailVerified,isPhoneVerified
John,Doe,john.doe@example.com,Password123!,+1234567890,Admin Manager,Active,true,true
Jane,Smith,jane.smith@example.com,Password123!,+1234567891,Manager,true,false,false
```

### Field Details

#### Phone Number

- Format: Include country code (e.g., `+1234567890` or `1234567890`)
- Can be left empty if not provided
- The system accepts both `phone` and `phoneNumber` column names

#### Roles

- **Format 1**: Comma-separated role names: `"Admin,Manager,Analyst"`
- **Format 2**: Single role name: `"Admin"`
- **Format 3**: ObjectIds (if you know them): `"507f1f77bcf86cd799439011,507f191e810c19729de860ea"`
- **Note**: Role names must exist in your tenant's role list. If a role name doesn't exist, it will be skipped with a warning.

#### Status

- Accepts: `true`, `false`, `"true"`, `"false"`, `"Active"`, `"Inactive"`
- Case-insensitive
- Defaults to `false` if not provided

## Example CSV Files

### Minimal Example (Required Fields Only)

```csv
firstname,lastname,email,password
John,Doe,john.doe@example.com,Password123!
Jane,Smith,jane.smith@example.com,Password123!
```

### Complete Example (All Fields)

```csv
firstname,lastname,email,password,phoneNumber,roles,status,isEmailVerified,isPhoneVerified
John,Doe,john.doe@example.com,Password123!,+1234567890,Admin Manager,Active,true,true
Jane,Smith,jane.smith@example.com,Password123!,+1234567891,Manager Analyst,true,true,false
Mike,Johnson,mike.johnson@example.com,Password123!,+1234567892,Supervisor,false,false,false
```

## Import Process

1. **Prepare your CSV file** using the template (`users_bulk_import_template.csv`)
2. **Navigate to** Users List page (`/users/list`)
3. **Click** the bulk import button
4. **Upload** your CSV file
5. **Review** the import results:
   - Successfully created users
   - Failed users with error messages
   - Summary statistics

## Validation Rules

### Email

- Must be a valid email format
- Must be unique (duplicate emails will be skipped)
- Automatically converted to lowercase

### Password

- Minimum 8 characters
- Must contain at least one letter (a-z, A-Z)
- Must contain at least one number (0-9)

### Phone Number

- Optional field
- Format: `+1234567890` or `1234567890`
- Spaces, dashes, and parentheses are automatically removed

### Roles

- Role names are **case-insensitive** (e.g., "admin", "Admin", "ADMIN" all work)
- If a role doesn't exist, it will be skipped with a warning
- Users will be created even if some roles are invalid (only valid roles will be assigned)
- Roles can be specified as:
  - Comma-separated names: `"Admin,Manager,Analyst"`
  - Single role name: `"Admin"`
  - ObjectIds: `"507f1f77bcf86cd799439011"`

## Error Handling

The bulk import process handles errors gracefully:

- **Duplicate Emails**: Users with duplicate emails are skipped and reported in the errors array
- **Invalid Roles**: Invalid role names/ObjectIds are skipped with warnings, but the user is still created
- **Validation Errors**: Users failing validation (e.g., invalid email, weak password) are skipped and reported
- **System Flags**: Attempts to set `isOwner`, `isSuper`, or `isSaby` are automatically removed

## Response Format

After import, you'll receive a response with:

```json
{
  "message": "Bulk user creation completed",
  "createdUsers": [
    {
      "userId": "abc123xyz",
      "email": "john.doe@example.com",
      "message": "User created successfully"
    }
  ],
  "errors": [
    {
      "email": "duplicate@example.com",
      "error": "Email is already registered"
    }
  ],
  "summary": {
    "total": 10,
    "created": 8,
    "failed": 2
  }
}
```

## Best Practices

1. **Test First**: Use the test CSV file (`users_bulk_import_test.csv`) to verify your setup
2. **Validate Data**: Ensure all emails are unique and valid before importing
3. **Check Roles**: Verify that all role names exist in your tenant before importing
4. **Phone Format**: Use consistent phone number format (with or without country code)
5. **Backup**: Consider backing up your database before large imports
6. **Batch Size**: For large imports (1000+ users), consider splitting into smaller batches

## Troubleshooting

### "Email is already registered"

- The email already exists in the system
- Solution: Remove duplicate emails from your CSV or update existing users instead

### "Role not found"

- A role name in your CSV doesn't exist in your tenant
- Solution: Check role names in your tenant settings or create missing roles first

### "Password validation failed"

- Password doesn't meet requirements (min 8 chars, contains letter and number)
- Solution: Update passwords to meet requirements

### "Invalid email format"

- Email address is not in valid format
- Solution: Verify email format (e.g., `user@domain.com`)

## Files

- **Template**: `users_bulk_import_template.csv` - Template with headers and documentation
- **Test File**: `users_bulk_import_test.csv` - Sample data for testing
- **Documentation**: This file (`BULK_USER_IMPORT_GUIDE.md`)

## Support

For issues or questions:

1. Check the error messages in the import response
2. Verify your CSV format matches the template
3. Review validation rules above
4. Contact your system administrator
