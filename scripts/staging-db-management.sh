#!/bin/bash
# Database Management Script for Staging Server
# Server: 172.191.143.248
# Provides utilities for PostgreSQL and MongoDB operations

SERVER_IP="172.191.143.248"
SERVER_USER="haloadmin"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
echo_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# PostgreSQL Operations
postgres_query() {
    local query=$1
    echo_info "Executing PostgreSQL query..."
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        docker exec saby-postgres-staging psql -U \$(docker exec saby-postgres-staging printenv POSTGRES_USER) -d \$(docker exec saby-postgres-staging printenv POSTGRES_DB) -c "${query}"
ENDSSH
}

postgres_backup() {
    local backup_file="/tmp/postgres_backup_$(date +%Y%m%d_%H%M%S).sql"
    echo_info "Creating PostgreSQL backup..."
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        docker exec saby-postgres-staging pg_dump -U \$(docker exec saby-postgres-staging printenv POSTGRES_USER) \$(docker exec saby-postgres-staging printenv POSTGRES_DB) > ${backup_file}
        echo "Backup created: ${backup_file}"
ENDSSH
}

postgres_restore() {
    local backup_file=$1
    if [ -z "$backup_file" ]; then
        echo_error "Please provide backup file path"
        return 1
    fi
    echo_warn "This will restore database from backup. Continue? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
            docker exec -i saby-postgres-staging psql -U \$(docker exec saby-postgres-staging printenv POSTGRES_USER) \$(docker exec saby-postgres-staging printenv POSTGRES_DB) < ${backup_file}
ENDSSH
        echo_info "Database restored from ${backup_file}"
    fi
}

# MongoDB Operations
mongo_query() {
    local query=$1
    echo_info "Executing MongoDB query..."
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        docker exec saby-mongodb-staging mongosh --quiet --eval "${query}"
ENDSSH
}

mongo_backup() {
    local backup_dir="/tmp/mongodb_backup_$(date +%Y%m%d_%H%M%S)"
    echo_info "Creating MongoDB backup..."
    ssh ${SERVER_USER}@${SERVER_IP} << ENDSSH
        docker exec saby-mongodb-staging mongodump --out ${backup_dir}
        echo "Backup created: ${backup_dir}"
ENDSSH
}

# Table Management
list_tables() {
    echo_info "Listing PostgreSQL tables..."
    postgres_query "\dt"
}

describe_table() {
    local table=$1
    if [ -z "$table" ]; then
        echo_error "Please provide table name"
        return 1
    fi
    echo_info "Describing table: ${table}"
    postgres_query "\d ${table}"
}

# Activity Log Management
check_activity_log() {
    echo_info "Checking submission_activity_log table..."
    postgres_query "SELECT COUNT(*) as total, status, action, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h FROM submission_activity_log GROUP BY status, action ORDER BY total DESC;"
}

clean_rejected_entries() {
    echo_warn "This will delete all rejected entries from activity log. Continue? (y/n)"
    read -r response
    if [[ "$response" =~ ^[Yy]$ ]]; then
        postgres_query "DELETE FROM submission_activity_log WHERE status = 'rejected' AND action = 'rejected';"
        echo_info "Rejected entries cleaned"
    fi
}

# Node Dimension Management
check_node_dimension() {
    echo_info "Checking node_dimension table..."
    postgres_query "SELECT COUNT(*) as total_nodes, COUNT(DISTINCT tenant_id) as tenants, MAX(updated_at) as last_update FROM node_dimension;"
}

sync_node_dimension() {
    echo_info "Triggering NodeSync backfill..."
    ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
        docker exec saby-backend-staging node scripts/backfill_node_dimension.js
ENDSSH
}

# Main menu
show_menu() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║   Database Management - Staging Server               ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    echo "PostgreSQL:"
    echo "  1. Execute SQL Query"
    echo "  2. List Tables"
    echo "  3. Describe Table"
    echo "  4. Create Backup"
    echo "  5. Restore from Backup"
    echo ""
    echo "MongoDB:"
    echo "  6. Execute MongoDB Query"
    echo "  7. Create MongoDB Backup"
    echo ""
    echo "Activity Log:"
    echo "  8. Check Activity Log Stats"
    echo "  9. Clean Rejected Entries"
    echo ""
    echo "Node Dimension:"
    echo "  10. Check Node Dimension Stats"
    echo "  11. Sync Node Dimension (Backfill)"
    echo ""
    echo "  0. Exit"
    echo ""
    read -p "Select option: " choice
    
    case $choice in
        1) 
            read -p "Enter SQL query: " query
            postgres_query "$query"
            ;;
        2) list_tables ;;
        3) 
            read -p "Enter table name: " table
            describe_table "$table"
            ;;
        4) postgres_backup ;;
        5) 
            read -p "Enter backup file path: " backup
            postgres_restore "$backup"
            ;;
        6)
            read -p "Enter MongoDB query: " query
            mongo_query "$query"
            ;;
        7) mongo_backup ;;
        8) check_activity_log ;;
        9) clean_rejected_entries ;;
        10) check_node_dimension ;;
        11) sync_node_dimension ;;
        0) exit 0 ;;
        *) echo_error "Invalid option" ;;
    esac
}

# Direct command execution
if [ $# -gt 0 ]; then
    case $1 in
        psql) postgres_query "$2" ;;
        mongo) mongo_query "$2" ;;
        backup-pg) postgres_backup ;;
        backup-mongo) mongo_backup ;;
        tables) list_tables ;;
        describe) describe_table "$2" ;;
        activity) check_activity_log ;;
        clean-rejected) clean_rejected_entries ;;
        nodes) check_node_dimension ;;
        sync-nodes) sync_node_dimension ;;
        *) 
            echo "Usage: $0 [command] [args]"
            echo "Commands: psql [query], mongo [query], backup-pg, backup-mongo, tables, describe [table], activity, clean-rejected, nodes, sync-nodes"
            ;;
    esac
else
    while true; do
        show_menu
    done
fi

