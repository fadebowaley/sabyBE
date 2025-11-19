#!/bin/bash
# Staging Server Monitoring and Management Script
# Server: 172.191.143.248
# User: haloadmin

SERVER_IP="172.191.143.248"
SERVER_USER="haloadmin"
SERVER_PATH="/opt/saby"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

echo_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check server connection
check_connection() {
    echo_info "Checking SSH connection to ${SERVER_IP}..."
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP} "echo 'Connected'" > /dev/null 2>&1; then
        echo_info "✅ SSH connection successful"
        return 0
    else
        echo_error "❌ SSH connection failed"
        return 1
    fi
}

# Function to check Docker containers
check_containers() {
    echo_info "Checking Docker containers..."
    ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
        echo "=== Running Containers ==="
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""
        echo "=== All Containers ==="
        docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
ENDSSH
}

# Function to check Docker Compose services
check_services() {
    echo_info "Checking Docker Compose services..."
    ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
        cd /opt/saby
        if [ -f docker-compose.staging.yml ]; then
            echo "=== Staging Services ==="
            docker-compose -f docker-compose.staging.yml ps
        else
            echo "⚠️  docker-compose.staging.yml not found"
        fi
ENDSSH
}

# Function to view logs
view_logs() {
    local service=${1:-backend}
    local lines=${2:-50}
    echo_info "Viewing logs for ${service} (last ${lines} lines)..."
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        cd /opt/saby
        if [ -f docker-compose.staging.yml ]; then
            docker-compose -f docker-compose.staging.yml logs --tail=${lines} ${service}
        else
            docker logs saby-${service}-staging --tail=${lines} 2>/dev/null || echo "Container not found"
        fi
ENDSSH
}

# Function to check database connection
check_database() {
    echo_info "Checking database connections..."
    ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
        cd /opt/saby
        echo "=== MongoDB ==="
        docker exec saby-mongodb-staging mongosh --quiet --eval "db.adminCommand('ping')" 2>/dev/null && echo "✅ MongoDB connected" || echo "❌ MongoDB not accessible"
        
        echo ""
        echo "=== PostgreSQL ==="
        docker exec saby-postgres-staging psql -U postgres -c "SELECT version();" 2>/dev/null | head -1 && echo "✅ PostgreSQL connected" || echo "❌ PostgreSQL not accessible"
ENDSSH
}

# Function to check backend health
check_backend_health() {
    echo_info "Checking backend health..."
    ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
        echo "=== Backend Health Check ==="
        curl -s http://localhost:4000/health || curl -s http://localhost:4000/ || echo "❌ Backend not responding"
        echo ""
        echo "=== Backend Container Status ==="
        docker ps | grep backend || echo "Backend container not running"
ENDSSH
}

# Function to check disk space
check_disk_space() {
    echo_info "Checking disk space..."
    ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
        echo "=== Disk Usage ==="
        df -h | grep -E "Filesystem|/dev/"
        echo ""
        echo "=== Docker Disk Usage ==="
        docker system df
ENDSSH
}

# Function to run database migration/script
run_db_script() {
    local script_file=$1
    if [ -z "$script_file" ]; then
        echo_error "Please provide a script file path"
        return 1
    fi
    
    echo_info "Running database script: ${script_file}"
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        cd /opt/saby
        if [ -f "${script_file}" ]; then
            docker exec saby-backend-staging node "${script_file}"
        else
            echo "❌ Script file not found: ${script_file}"
        fi
ENDSSH
}

# Function to execute SQL on PostgreSQL
run_sql() {
    local sql_query=$1
    if [ -z "$sql_query" ]; then
        echo_error "Please provide a SQL query"
        return 1
    fi
    
    echo_info "Executing SQL query..."
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        docker exec saby-postgres-staging psql -U postgres -d \$(docker exec saby-postgres-staging printenv POSTGRES_DB) -c "${sql_query}"
ENDSSH
}

# Function to restart service
restart_service() {
    local service=${1:-backend}
    echo_info "Restarting ${service} service..."
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        cd /opt/saby
        if [ -f docker-compose.staging.yml ]; then
            docker-compose -f docker-compose.staging.yml restart ${service}
            echo "✅ ${service} restarted"
        else
            docker restart saby-${service}-staging
            echo "✅ ${service} restarted"
        fi
ENDSSH
}

# Main menu
show_menu() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║   Staging Server Management (172.191.143.248)        ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    echo "1. Check Connection"
    echo "2. Check Containers"
    echo "3. Check Services"
    echo "4. View Logs (backend)"
    echo "5. View Logs (frontend)"
    echo "6. Check Database Connections"
    echo "7. Check Backend Health"
    echo "8. Check Disk Space"
    echo "9. Restart Backend"
    echo "10. Restart Frontend"
    echo "11. Run Database Script"
    echo "12. Execute SQL Query"
    echo "0. Exit"
    echo ""
    read -p "Select option: " choice
    
    case $choice in
        1) check_connection ;;
        2) check_containers ;;
        3) check_services ;;
        4) view_logs "backend" 50 ;;
        5) view_logs "frontend" 50 ;;
        6) check_database ;;
        7) check_backend_health ;;
        8) check_disk_space ;;
        9) restart_service "backend" ;;
        10) restart_service "frontend" ;;
        11) 
            read -p "Enter script path: " script_path
            run_db_script "$script_path"
            ;;
        12)
            read -p "Enter SQL query: " sql_query
            run_sql "$sql_query"
            ;;
        0) exit 0 ;;
        *) echo_error "Invalid option" ;;
    esac
}

# If script is run with arguments, execute directly
if [ $# -gt 0 ]; then
    case $1 in
        connect) check_connection ;;
        containers) check_containers ;;
        services) check_services ;;
        logs) view_logs ${2:-backend} ${3:-50} ;;
        db) check_database ;;
        health) check_backend_health ;;
        disk) check_disk_space ;;
        restart) restart_service ${2:-backend} ;;
        sql) run_sql "$2" ;;
        script) run_db_script "$2" ;;
        *) 
            echo "Usage: $0 [command] [args]"
            echo "Commands: connect, containers, services, logs [service] [lines], db, health, disk, restart [service], sql [query], script [path]"
            ;;
    esac
else
    # Interactive mode
    while true; do
        show_menu
    done
fi

