# API Keys Test Script - Docker Instructions

## Overview

This script tests API keys database operations and staging usage limits for user `josaby@saby.ai`.

## Prerequisites

- Docker and docker-compose installed
- Backend services running via docker-compose
- MongoDB accessible (either inside Docker network or via localhost:27017)

## Running the Script

### Option 1: Run Inside Docker Container (Recommended)

```bash
# From the sabyBackend directory
./scripts/run-test-inside-docker.sh
```

Or manually:

```bash
docker exec -it halo-local-backend node scripts/test-api-keys-and-usage-limit.js
```

### Option 2: Run from Host Machine (Targeting Docker MongoDB)

```bash
# From the sabyBackend directory
node scripts/test-api-keys-and-usage-limit.js
```

The script will automatically detect if it's running from host and adjust the MongoDB connection URL.

## What the Script Does

### Task 1: List All API Keys

- Connects to MongoDB
- Finds user: `josaby@saby.ai`
- Lists ALL API keys with complete data including:
  - ✅ Tenant ID (to verify it's stored)
  - All fields (label, environment, permissions, etc.)
  - Usage statistics
  - User information
  - Metadata

### Task 2: Consume Staging Usage to 99

- Creates a test staging API key if needed
- Uses `verifyApiKey` service to increment usage
- Makes API calls until usage reaches 99
- Leaves exactly 1 remaining call

### Task 3: Test Usage Limit

- Makes the 100th call (should be blocked)
- Verifies 403 Forbidden response
- Confirms usage count stays at 99 (not incremented)

## Environment Variables

The script uses `env.docker` file which should contain:

- `MONGODB_URL` - MongoDB connection string
- `SUBMISSION_API_BASE_URL` - Backend API URL (optional, defaults to localhost:4000/v1)

## Troubleshooting

### Container Not Found

```bash
# Check if container is running
docker ps | grep halo-local-backend

# Start containers if needed
docker-compose -f docker-compose.local.yml up -d
```

### MongoDB Connection Error

- If running from host: MongoDB should be accessible on `localhost:27017`
- If running inside Docker: MongoDB should be accessible via service name `mongodb:27017`
- Check `env.docker` file has correct `MONGODB_URL`

### API Connection Error

- Make sure backend server is running on port 4000
- If inside Docker, use service name: `http://halobe:4000/v1`
- If from host, use: `http://localhost:4000/v1`

### User Not Found

- Verify user `josaby@saby.ai` exists in database
- Check password is correct: `@judah_saby1`

## Expected Output

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB

👤 Finding user: josaby@saby.ai...
✅ User found: Jo Saby
   User ID: ...
   Tenant ID: ...

🔐 Logging in as josaby@saby.ai...
✅ Login successful

╔════════════════════════════════════════════════════════════════╗
║  TASK 1: List All API Keys for User                           ║
╚════════════════════════════════════════════════════════════════╝

📊 Found X API key(s) for user

[Detailed API key information with tenantId verification]

╔════════════════════════════════════════════════════════════════╗
║  TASK 2: Consume Staging API Key Usage to 99                  ║
╚════════════════════════════════════════════════════════════════╝

[Usage consumption progress]

╔════════════════════════════════════════════════════════════════╗
║  TASK 3: Test Usage Limit (100th call should be blocked)      ║
╚════════════════════════════════════════════════════════════════╝

✅ SUCCESS: Usage limit correctly blocked the request!
```
