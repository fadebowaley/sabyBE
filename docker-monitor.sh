#!/bin/bash

# 🚀 Halo Backend Docker Monitoring & Administration Script
# This script provides comprehensive monitoring and administration for haloBE containers

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.local.yml"
PROJECT_NAME="halo-local"

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker first."
        exit 1
    fi
}

# Function to check if containers are running
check_containers() {
    print_header "Container Status Check"

    local containers=("halo-local-backend" "halo-local-postgres" "halo-local-mongodb" "halo-local-redis")
    local all_running=true

    for container in "${containers[@]}"; do
        if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -q "$container"; then
            local status=$(docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep "$container")
            print_status "$status"
        else
            print_error "Container $container is not running"
            all_running=false
        fi
    done

    if [ "$all_running" = true ]; then
        print_status "All containers are running! ✅"
    else
        print_warning "Some containers are not running. Use 'start' command to start them."
    fi
}

# Function to show container logs
show_logs() {
    local container=${1:-"halo-local-backend"}
    local lines=${2:-50}

    print_header "Container Logs: $container (last $lines lines)"

    if docker ps | grep -q "$container"; then
        docker logs --tail "$lines" "$container"
    else
        print_error "Container $container is not running"
    fi
}

# Function to show real-time logs
follow_logs() {
    local container=${1:-"halo-local-backend"}

    print_header "Following logs for: $container (Ctrl+C to stop)"

    if docker ps | grep -q "$container"; then
        docker logs -f "$container"
    else
        print_error "Container $container is not running"
    fi
}

# Function to show container resource usage
show_resources() {
    print_header "Container Resource Usage"

    if command -v docker stats > /dev/null 2>&1; then
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
    else
        print_warning "docker stats command not available"
    fi
}

# Function to show container details
show_details() {
    local container=${1:-"halo-local-backend"}

    print_header "Container Details: $container"

    if docker ps | grep -q "$container"; then
        echo "Container Info:"
        docker inspect "$container" --format "table {{.Name}}\t{{.State.Status}}\t{{.State.StartedAt}}"

        echo -e "\nPort Mappings:"
        docker port "$container"

        echo -e "\nEnvironment Variables:"
        docker exec "$container" env | sort
    else
        print_error "Container $container is not running"
    fi
}

# Function to restart containers
restart_containers() {
    print_header "Restarting Containers"

    print_status "Stopping containers..."
    docker-compose -f "$COMPOSE_FILE" down

    print_status "Starting containers..."
    docker-compose -f "$COMPOSE_FILE" up -d

    print_status "Waiting for containers to start..."
    sleep 10

    check_containers
}

# Function to rebuild and restart
rebuild_containers() {
    print_header "Rebuilding and Restarting Containers"

    print_status "Stopping containers..."
    docker-compose -f "$COMPOSE_FILE" down

    print_status "Building and starting containers..."
    docker-compose -f "$COMPOSE_FILE" up --build -d

    print_status "Waiting for containers to start..."
    sleep 15

    check_containers
}

# Function to show database connections
check_databases() {
    print_header "Database Connection Check"

    # Check PostgreSQL
    if docker ps | grep -q "halo-local-postgres"; then
        print_status "Testing PostgreSQL connection..."
        if docker exec halo-local-postgres pg_isready -U postgres > /dev/null 2>&1; then
            print_status "PostgreSQL: ✅ Connected"
        else
            print_error "PostgreSQL: ❌ Connection failed"
        fi
    fi

    # Check MongoDB
    if docker ps | grep -q "halo-local-mongodb"; then
        print_status "Testing MongoDB connection..."
        if docker exec halo-local-postgres pg_isready -U postgres > /dev/null 2>&1; then
            print_status "MongoDB: ✅ Connected"
        else
            print_error "MongoDB: ❌ Connection failed"
        fi
    fi

    # Check Redis
    if docker ps | grep -q "halo-local-redis"; then
        print_status "Testing Redis connection..."
        if docker exec halo-local-redis redis-cli ping > /dev/null 2>&1; then
            print_status "Redis: ✅ Connected"
        else
            print_error "Redis: ❌ Connection failed"
        fi
    fi
}

# Function to show API health
check_api_health() {
    print_header "API Health Check"

    if docker ps | grep -q "halo-local-backend"; then
        print_status "Testing API endpoint..."
        if curl -s http://localhost:4000/ > /dev/null 2>&1; then
            print_status "API: ✅ Responding at http://localhost:4000/"

            # Show API response
            echo -e "\nAPI Response:"
            curl -s http://localhost:4000/ | jq . 2>/dev/null || curl -s http://localhost:4000/
        else
            print_error "API: ❌ Not responding at http://localhost:4000/"
        fi
    else
        print_error "Backend container is not running"
    fi
}

# Function to show PM2 status
show_pm2_status() {
    local container=${1:-"halo-local-backend"}

    print_header "PM2 Process Status: $container"

    if docker ps | grep -q "$container"; then
        docker exec "$container" sh -c "cd /app && npm run pm2 list" 2>/dev/null || print_warning "PM2 not available or no processes running"
    else
        print_error "Container $container is not running"
    fi
}

# Function to show container logs summary
show_logs_summary() {
    print_header "Recent Logs Summary"

    local containers=("halo-local-backend" "halo-local-postgres" "halo-local-mongodb" "halo-local-redis")

    for container in "${containers[@]}"; do
        if docker ps | grep -q "$container"; then
            echo -e "\n${CYAN}=== $container ===${NC}"
            docker logs --tail 5 "$container" 2>/dev/null | grep -E "(ERROR|WARN|INFO|✅|❌|⚠️)" || echo "No recent logs"
        fi
    done
}

# Function to clean up containers
cleanup() {
    print_header "Container Cleanup"

    print_warning "This will stop and remove all containers, networks, and volumes!"
    read -p "Are you sure? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Stopping and removing containers..."
        docker-compose -f "$COMPOSE_FILE" down -v

        print_status "Removing unused Docker resources..."
        docker system prune -f

        print_status "Cleanup completed!"
    else
        print_status "Cleanup cancelled."
    fi
}

# Function to show help
show_help() {
    print_header "Halo Backend Docker Monitor - Usage Guide"

    echo -e "${GREEN}Available Commands:${NC}"
    echo -e "  ${CYAN}status${NC}     - Show container status"
    echo -e "  ${CYAN}logs${NC}       - Show container logs (default: backend, last 50 lines)"
    echo -e "  ${CYAN}follow${NC}     - Follow container logs in real-time"
    echo -e "  ${CYAN}resources${NC}  - Show container resource usage"
    echo -e "  ${CYAN}details${NC}    - Show detailed container information"
    echo -e "  ${CYAN}restart${NC}    - Restart all containers"
    echo -e "  ${CYAN}rebuild${NC}    - Rebuild and restart containers"
    echo -e "  ${CYAN}databases${NC}  - Check database connections"
    echo -e "  ${CYAN}health${NC}     - Check API health"
    echo -e "  ${CYAN}pm2${NC}        - Show PM2 process status"
    echo -e "  ${CYAN}summary${NC}    - Show logs summary for all containers"
    echo -e "  ${CYAN}cleanup${NC}    - Clean up containers and resources"
    echo -e "  ${CYAN}help${NC}       - Show this help message"

    echo -e "\n${GREEN}Usage Examples:${NC}"
    echo -e "  ${CYAN}./docker-monitor.sh status${NC}"
    echo -e "  ${CYAN}./docker-monitor.sh logs halo-local-postgres 100${NC}"
    echo -e "  ${CYAN}./docker-monitor.sh follow halo-local-backend${NC}"
    echo -e "  ${CYAN}./docker-monitor.sh details halo-local-redis${NC}"

    echo -e "\n${GREEN}Container Names:${NC}"
    echo -e "  - ${CYAN}halo-local-backend${NC}    (Main API server)"
    echo -e "  - ${CYAN}halo-local-postgres${NC}   (PostgreSQL database)"
    echo -e "  - ${CYAN}halo-local-mongodb${NC}    (MongoDB database)"
    echo -e "  - ${CYAN}halo-local-redis${NC}      (Redis cache)"
}

# Main script logic
main() {
    check_docker

    case "${1:-status}" in
        "status")
            check_containers
            ;;
        "logs")
            show_logs "$2" "$3"
            ;;
        "follow")
            follow_logs "$2"
            ;;
        "resources")
            show_resources
            ;;
        "details")
            show_details "$2"
            ;;
        "restart")
            restart_containers
            ;;
        "rebuild")
            rebuild_containers
            ;;
        "databases")
            check_databases
            ;;
        "health")
            check_api_health
            ;;
        "pm2")
            show_pm2_status "$2"
            ;;
        "summary")
            show_logs_summary
            ;;
        "cleanup")
            cleanup
            ;;
        "help"|"-h"|"--help")
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            echo
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
