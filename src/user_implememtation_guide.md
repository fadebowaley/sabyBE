User Model Update (Multi-Tenant System)

We are updating the User model, controller, service, and routes to support a new global user hierarchy in the multi-tenant system.

Key Changes:

User Creation & Access

A user signing up via the public signup link automatically becomes:
isOwner = true, isSuper = true.

A SuperUser can also create other users and specify if isOwner = true or false.

Only one global SabyUser exists (isSaby = true) — this user has system-wide administrative privileges across all tenants.

User Hierarchy

The hierarchy is:
SabyUser → SuperUser → Owner → OrdinaryUser

Ordinary users (isSaby = false, isSuper = false, isOwner = false) cannot log in via the main web system.
They must use designated alternative channels (apply redirect or 403 for web login attempts).

The application should be channel-aware to enforce this restriction.

User Visibility

SabyUser can view all users (across all tenants).

SuperUsers and Owners can only view users within their own tenantId.

When listing users within a tenant, always order them as:
SabyUser → SuperUser → Owner → OrdinaryUser.


// (1) Public signup:
// - Automatically assign: isOwner = true, isSuper = true
// - This creates the initial tenant-level admin

// (2) SuperUser-created accounts:
// - SuperUser can create other users
// - Can set isOwner = true or false 
// - Can modify OrdianryUser to become Owner
// - Cannot assign isSuper or isSaby (reserved flags)

// (3) Global SabyUser:
// - Only one record in the system should have isSaby = true
// - Acts as overall system controller across all tenants


// Access hierarchy:
// SabyUser > SuperUser > Owner > OrdinaryUser

// OrdinaryUser restrictions:
// - Cannot log in via main web portal
// - Must use designated channel access (e.g., API, mobile, or external service)
// - If attempting web login → return 403

// App should be channel-aware to differentiate between web and non-web logins


// SabyUser:
// - Can view all users (across all tenantIds)

// SuperUser / Owner:
// - Can only view users within their own tenantId

// Listing order (when fetching tenant users):
// 1. SabyUser (if visible)
// 2. SuperUser
// 3. Owner
// 4. Users
