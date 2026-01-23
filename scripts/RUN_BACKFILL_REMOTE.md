# Running Backfill on Remote Server

## Prerequisites

1. SSH access to the remote server
2. Node.js installed on remote server
3. Access to both MongoDB and PostgreSQL on remote server
4. Environment variables configured on remote server

## Steps to Run Backfill on Remote Server

### Option 1: SSH and Run Directly

```bash
# SSH into the remote server
ssh user@your-remote-server.com

# Navigate to the backend directory
cd /path/to/sabyBackend

# Run the backfill script
node scripts/backfill_levels_structures_nodes.js
```

### Option 2: Run via PM2 or Process Manager

If your backend is running via PM2:

```bash
# SSH into server
ssh user@your-remote-server.com

# Stop the backend temporarily (optional, but recommended for large backfills)
pm2 stop saby-backend

# Run the backfill
cd /path/to/sabyBackend
node scripts/backfill_levels_structures_nodes.js

# Restart the backend
pm2 start saby-backend
```

### Option 3: Run in Background (nohup)

```bash
# SSH into server
ssh user@your-remote-server.com

# Navigate to backend directory
cd /path/to/sabyBackend

# Run in background and save output to log file
nohup node scripts/backfill_levels_structures_nodes.js > backfill_$(date +%Y%m%d_%H%M%S).log 2>&1 &

# Check the process
ps aux | grep backfill

# Monitor the log file
tail -f backfill_*.log
```

### Option 4: Run via Docker (if using Docker)

```bash
# SSH into server
ssh user@your-remote-server.com

# If backend is in Docker, exec into the container
docker exec -it saby-backend-container bash

# Run the script
cd /app
node scripts/backfill_levels_structures_nodes.js
```

## Environment Variables Required

Make sure these are set in your `.env` file on the remote server:

```env
# MongoDB
MONGODB_URL=mongodb://your-remote-mongo-url

# PostgreSQL
POSTGRES_HOST=your-postgres-host
POSTGRES_PORT=5432
POSTGRES_USER=your-postgres-user
POSTGRES_PASSWORD=your-postgres-password
POSTGRES_DB=your-database-name

# Node Sync (optional)
NODE_SYNC_BATCH_SIZE=250
```

## Monitoring Progress

The script will output progress information:

- MongoDB data summary
- Postgres data summary
- Processing progress (nodes processed/total)
- Final consistency check

## Expected Output

```
🚀 Starting comprehensive backfill for levels, structures, and nodes...

✅ Connected to MongoDB

📊 MongoDB Data Summary:
──────────────────────────────────────────────────
  Levels: X
  Structures: Y
  Nodes: Z
  Unique Tenants: N
──────────────────────────────────────────────────

📊 Postgres node_dimension Summary:
──────────────────────────────────────────────────
  Total Nodes: X
  Unique Tenants: N
  Unique Levels (referenced): X
  Unique Structures (referenced): Y
──────────────────────────────────────────────────

🔁 Starting node_dimension backfill...
   📦 Nodes to process: Z
   ✅ Processed X/Z nodes (XX.X%)
   ✅ Node backfill complete!

🔍 Verifying data consistency...
   ✅ Node counts match: Z (MongoDB) = Z (Postgres)

📊 Final Summary:
──────────────────────────────────────────────────
🎉 Backfill complete! Processed Z nodes.
```

## Troubleshooting

### Connection Issues

- Verify MongoDB and PostgreSQL are accessible from the server
- Check firewall rules
- Verify credentials in `.env` file

### Timeout Issues

- Increase `NODE_SYNC_BATCH_SIZE` if processing is slow
- Check network connectivity
- Monitor server resources (CPU, memory)

### Partial Backfill

- The script uses upsert, so it's safe to run multiple times
- If interrupted, simply run it again - it will continue from where it left off

## Post-Backfill Verification

After running the backfill, verify the data:

```bash
# Connect to PostgreSQL
psql -h your-postgres-host -U your-user -d your-database

# Check node count
SELECT COUNT(*) FROM node_dimension;

# Check by tenant
SELECT tenant_id, COUNT(*) as node_count
FROM node_dimension
GROUP BY tenant_id;

# Check levels referenced
SELECT DISTINCT level_name, COUNT(*) as node_count
FROM node_dimension
WHERE level_name IS NOT NULL
GROUP BY level_name
ORDER BY level_name;
```
