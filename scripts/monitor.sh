#!/bin/bash

# Halo Backend Monitoring Script
# Provides real-time monitoring similar to nodemon's hot reload

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    local status=$1
    local message=$2
    case $status in
        "success") echo -e "${GREEN}✅ $message${NC}" ;;
        "error") echo -e "${RED}❌ $message${NC}" ;;
        "warning") echo -e "${YELLOW}⚠️  $message${NC}" ;;
        "info") echo -e "${BLUE}ℹ️  $message${NC}" ;;
    esac
}

# Function to check if a process is healthy
check_process_health() {
    local process_name=$1
    local status=$(pm2 jlist | jq -r ".[] | select(.name == \"$process_name\") | .pm2_env.status")
    local restart_count=$(pm2 jlist | jq -r ".[] | select(.name == \"$process_name\") | .pm2_env.restart_time")

    if [ "$status" = "online" ]; then
        print_status "success" "$process_name is online (restarts: $restart_count)"
        return 0
    else
        print_status "error" "$process_name is $status (restarts: $restart_count)"
        return 1
    fi
}

# Function to check for recent errors
check_recent_errors() {
    local process_name=$1
    local error_log="/Users/fadebowaley/.pm2/logs/${process_name}-error-0.log"

    if [ -f "$error_log" ]; then
        # Filter out expected errors (404s, SMTP warnings, PM2 metrics, timer errors, etc.)
        local recent_errors=$(tail -10 "$error_log" | grep -v "^$" | grep -v "404" | grep -v "SMTP" | grep -v "Unable to connect to email server" | grep -v "@pm2/io" | grep -v "IPCTransport" | grep -v "Timeout._onTimeout" | grep -v "listOnTimeout" | grep -v "process.processTimers" | wc -l)
        if [ "$recent_errors" -gt 0 ]; then
            print_status "warning" "$process_name has $recent_errors recent error(s)"
            echo -e "${YELLOW}Recent errors (filtered):${NC}"
            tail -5 "$error_log" | grep -v "^$" | grep -v "404" | grep -v "SMTP" | grep -v "Unable to connect to email server" | grep -v "@pm2/io" | grep -v "IPCTransport" | grep -v "Timeout._onTimeout" | grep -v "listOnTimeout" | grep -v "process.processTimers" | sed 's/^/  /' | head -3
            return 1
        else
            print_status "success" "$process_name has no critical errors"
        fi
    fi
    return 0
}

# Function to check server health
check_server_health() {
    local response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health || echo "000")
    if [ "$response" = "200" ]; then
        print_status "success" "Server responding on port 4000 (HTTP $response)"
        return 0
    else
        print_status "error" "Server not responding on port 4000 (HTTP $response)"
        return 1
    fi
}

# Function to display real-time monitoring
monitor_realtime() {
    echo -e "${BLUE}🔄 Starting real-time monitoring...${NC}"
    echo -e "${BLUE}Press Ctrl+C to stop${NC}"
    echo ""

    while true; do
        clear
        echo -e "${BLUE}=== Halo Backend Monitoring ===${NC}"
        echo "Timestamp: $(date)"
        echo ""

        # Check all processes
        local all_healthy=true

        check_process_health "app" || all_healthy=false
        check_process_health "email-ingestor" || all_healthy=false
        check_process_health "submission-worker" || all_healthy=false

        echo ""
        check_server_health || all_healthy=false

        echo ""
        echo -e "${BLUE}=== Recent Error Check ===${NC}"
        check_recent_errors "app" || all_healthy=false
        check_recent_errors "email-ingestor" || all_healthy=false
        check_recent_errors "submission-worker" || all_healthy=false

        echo ""
        if [ "$all_healthy" = true ]; then
            print_status "success" "All systems operational"
        else
            print_status "error" "Issues detected - check above"
        fi

        echo ""
        echo -e "${BLUE}Refreshing in 5 seconds...${NC}"
        sleep 5
    done
}

# Function to show quick status
show_status() {
    echo -e "${BLUE}=== Halo Backend Status ===${NC}"
    echo "Timestamp: $(date)"
    echo ""

    pm2 list
    echo ""

    # Check for errors
    echo -e "${BLUE}=== Error Summary ===${NC}"
    for process in app email-ingestor submission-worker; do
        check_recent_errors "$process"
    done
}

# Function to restart all processes
restart_all() {
    print_status "info" "Restarting all processes..."
    pm2 restart all
    print_status "success" "All processes restarted"
}

# Function to show logs
show_logs() {
    local process_name=${1:-"all"}
    if [ "$process_name" = "all" ]; then
        pm2 logs --lines 20
    else
        pm2 logs "$process_name" --lines 20
    fi
}

# Main script logic
case "${1:-status}" in
    "monitor"|"watch")
        monitor_realtime
        ;;
    "status")
        show_status
        ;;
    "restart")
        restart_all
        ;;
    "logs")
        show_logs "$2"
        ;;
    "health")
        check_process_health "app"
        check_process_health "email-ingestor"
        check_process_health "submission-worker"
        check_server_health
        ;;
    *)
        echo "Usage: $0 {monitor|status|restart|logs|health}"
        echo ""
        echo "Commands:"
        echo "  monitor, watch  - Real-time monitoring (like nodemon)"
        echo "  status          - Show current status"
        echo "  restart         - Restart all processes"
        echo "  logs [process]  - Show recent logs (default: all)"
        echo "  health          - Quick health check"
        echo ""
        echo "Examples:"
        echo "  $0 monitor      # Start real-time monitoring"
        echo "  $0 logs app     # Show app logs"
        echo "  $0 health       # Quick health check"
        ;;
esac
