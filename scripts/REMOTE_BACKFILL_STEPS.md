# Remote Backfill Deployment Steps

## Step 1: SSH into the Server

```bash
ssh -i ~/.ssh/id_ed25519 haloadmin@172.191.143.248
```

## Step 2: Copy Script to Remote Server

### Option A: Using SCP (from local machine)

```bash
# From your local machine
scp -i ~/.ssh/id_ed25519 \
  scripts/backfill_levels_structures_nodes.js \
  haloadmin@172.191.143.248:/home/haloadmin/sabyBackend/scripts/
```

### Option B: Using the deployment script

```bash
# From your local machine in sabyBackend directory
./scripts/deploy_backfill_remote.sh
```

### Option C: Manual copy (if you have the code on remote)

If the code is already on the remote server (via git pull, etc.), just navigate to it:

```bash
# On remote server
cd /home/haloadmin/sabyBackend
# Script should already be there
```

## Step 3: Identify Postgres Containers

Once SSH'd into the server, run:

```bash
# List all Docker containers
docker ps

# Filter for postgres containers
docker ps | grep -i postgres

# Or see all containers with details
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

# If using docker-compose
docker-compose ps
```

**Expected output examples:**
- Container name might be: `saby-postgres`, `postgres`, `halo-postgres`, etc.
- Or a docker-compose service name

## Step 4: Run the Script

### Option A: If backend runs in Docker container

```bash
# Find the backend container name
docker ps | grep -i backend

# Exec into the backend container
docker exec -it <backend-container-name> bash

# Inside the container, navigate and run
cd /app  # or wherever the code is mounted
node scripts/backfill_levels_structures_nodes.js
```

### Option B: If using docker-compose

```bash
# Navigate to project directory
cd /home/haloadmin/sabyBackend

# Exec into the service
docker-compose exec <service-name> bash

# Run the script
node scripts/backfill_levels_structures_nodes.js
```

### Option C: If backend runs directly on server (not in Docker)

```bash
# Navigate to backend directory
cd /home/haloadmin/sabyBackend

# Make sure Node.js is available
node --version

# Run the script
node scripts/backfill_levels_structures_nodes.js
```

## Quick Reference Commands

### Check Postgres Connection from Container

```bash
# If you need to test Postgres connection
docker exec -it <postgres-container> psql -U <user> -d <database> -c "SELECT version();"
```

### Monitor Script Progress

If running in background:

```bash
# Run in background
nohup node scripts/backfill_levels_structures_nodes.js > backfill.log 2>&1 &

# Monitor progress
tail -f backfill.log

# Check if still running
ps aux | grep backfill
```

### Verify Environment Variables

Before running, verify the `.env` file has correct values:

```bash
# Inside the container or on server
cat .env | grep -E "POSTGRES|MONGODB"
```

## Troubleshooting

### Script not found
- Check the path: `ls -la scripts/backfill_levels_structures_nodes.js`
- Verify you're in the correct directory

### Connection errors
- Verify MongoDB and PostgreSQL are accessible
- Check firewall rules
- Verify credentials in `.env`

### Permission errors
- Make sure the script is executable: `chmod +x scripts/backfill_levels_structures_nodes.js`
- Check file permissions: `ls -la scripts/`

### Node not found
- Check Node.js is installed: `node --version`
- If in Docker, make sure Node.js is in the container

## Expected Output

The script will show:
- MongoDB connection status
- Data summaries (levels, structures, nodes)
- Processing progress
- Final consistency check
- Completion message


