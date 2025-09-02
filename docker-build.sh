#!/bin/bash

# 🚀 Halo Service Docker Management Script (Standardized)
# Usage: ./docker-build.sh [build|start|stop|restart|logs|status|clean|health] [local|prod|dev]
#
# This script provides standardized Docker management across all Halo services
# with consistent naming conventions and functionality.

set -e

# =============================================================================
# CONFIGURATION - SERVICE SPECIFIC
# =============================================================================

# Service Configuration (MUST BE SET PER SERVICE)
SERVICE_NAME="halobe"           # e.g., "halofe", "halobe", "haloag"
SERVICE_DISPLAY_NAME="Halo Backend"   # e.g., "Halo Frontend", "Halo Backend", "Halo Agents"
SERVICE_PORT="4000"           # e.g., "3000", "4000", "5000"

# Docker Configuration
IMAGE_NAME="halo-${SERVICE_NAME}"
CONTAINER_NAME="halo-${SERVICE_NAME}"
COMPOSE_PROJECT="halo-${SERVICE_NAME}"

# File Paths
LOCAL_COMPOSE_FILE="docker-compose.local.yml"
PROD_COMPOSE_FILE="docker-compose.prod.yml"
DEV_COMPOSE_FILE="docker-compose.dev.yml"

# =============================================================================
# COLOR DEFINITIONS
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${PURPLE}================================${NC}"
    echo -e "${PURPLE}  ${SERVICE_DISPLAY_NAME} Docker Manager${NC}"
    echo -e "${PURPLE}================================${NC}"
}

print_usage() {
    echo "Usage: $0 [COMMAND] [ENVIRONMENT]"
    echo ""
    echo "Commands:"
    echo "  build     Build Docker image"
    echo "  start     Start containers"
    echo "  stop      Stop containers"
    echo "  restart   Restart containers"
    echo "  logs      Show container logs"
    echo "  status    Show container status"
    echo "  clean     Clean up containers and images"
    echo "  health    Check service health"
    echo ""
    echo "Environments:"
    echo "  local     Local development (default)"
    echo "  prod      Production"
    echo "  dev       Development with hot reload"
    echo ""
    echo "Examples:"
    echo "  $0 build local"
    echo "  $0 start prod"
    echo "  $0 logs dev"
}

# =============================================================================
# VALIDATION FUNCTIONS
# =============================================================================

validate_service_config() {
    if [ -z "$SERVICE_NAME" ] || [ -z "$SERVICE_DISPLAY_NAME" ] || [ -z "$SERVICE_PORT" ]; then
        print_error "Service configuration incomplete. Please set SERVICE_NAME, SERVICE_DISPLAY_NAME, and SERVICE_PORT."
        exit 1
    fi
}

check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
}

check_docker_compose() {
    if ! docker compose version > /dev/null 2>&1; then
        print_error "Docker Compose is not available. Please install Docker Compose and try again."
        exit 1
    fi
}

# =============================================================================
# DOCKER OPERATIONS
# =============================================================================

build_image() {
    local env=${1:-local}
    local dockerfile="Dockerfile"

    if [ "$env" = "prod" ]; then
        dockerfile="Dockerfile.prod"
        print_status "Building production Docker image: $IMAGE_NAME"
    else
        print_status "Building development Docker image: $IMAGE_NAME"
    fi

    if [ -f "$dockerfile" ]; then
        docker build -t $IMAGE_NAME -f $dockerfile .
        print_success "Image built successfully using $dockerfile!"
    else
        print_error "Dockerfile not found: $dockerfile"
        exit 1
    fi
}

get_compose_file() {
    local env=${1:-local}

    case $env in
        local)
            if [ -f "$LOCAL_COMPOSE_FILE" ]; then
                echo "$LOCAL_COMPOSE_FILE"
            else
                print_error "Local compose file not found: $LOCAL_COMPOSE_FILE"
                exit 1
            fi
            ;;
        prod)
            if [ -f "$PROD_COMPOSE_FILE" ]; then
                echo "$PROD_COMPOSE_FILE"
            else
                print_error "Production compose file not found: $PROD_COMPOSE_FILE"
                exit 1
            fi
            ;;
        dev)
            if [ -f "$DEV_COMPOSE_FILE" ]; then
                echo "$DEV_COMPOSE_FILE"
            else
                print_error "Development compose file not found: $DEV_COMPOSE_FILE"
                exit 1
            fi
            ;;
        *)
            print_error "Invalid environment: $env. Use 'local', 'prod', or 'dev'"
            exit 1
            ;;
    esac
}

start_containers() {
    local env=${1:-local}
    local compose_file=$(get_compose_file $env)

    print_status "Starting ${env} environment..."

    # Set project name to avoid conflicts
    export COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT

    docker compose -f "$compose_file" up -d
    print_success "Containers started successfully!"

    # Wait for containers to be ready
    sleep 5

    # Show status
    docker compose -f "$compose_file" ps

    # Show health status
    print_status "Checking service health..."
    sleep 2
    check_service_health $env
}

stop_containers() {
    local env=${1:-local}
    local compose_file=$(get_compose_file $env)

    print_status "Stopping ${env} environment..."

    export COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT
    docker compose -f "$compose_file" down

    print_success "Containers stopped successfully!"
}

restart_containers() {
    local env=${1:-local}

    print_status "Restarting ${env} environment..."
    stop_containers $env
    start_containers $env
}

show_logs() {
    local env=${1:-local}
    local compose_file=$(get_compose_file $env)

    print_status "Showing logs for ${env} environment..."

    export COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT
    docker compose -f "$compose_file" logs -f
}

show_status() {
    local env=${1:-local}
    local compose_file=$(get_compose_file $env)

    print_status "Status for ${env} environment:"

    export COMPOSE_PROJECT_NAME=$COMPOSE_PROJECT
    docker compose -f "$compose_file" ps

    echo ""
    print_status "Resource usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"
}

clean_environment() {
    local env=${1:-local}

    print_warning "Cleaning up ${env} environment..."

    # Stop and remove containers
    stop_containers $env

    # Remove images
    if docker images | grep -q "$IMAGE_NAME"; then
        print_status "Removing Docker images..."
        docker rmi $IMAGE_NAME || true
    fi

    # Clean up volumes (optional)
    read -p "Remove volumes? This will delete all data. (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing volumes..."
        docker volume prune -f
    fi

    print_success "Cleanup completed!"
}

check_service_health() {
    local env=${1:-local}

    print_status "Checking service health..."

    # Wait for service to be ready
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -s "http://localhost:$SERVICE_PORT/health" > /dev/null 2>&1 || \
           curl -s "http://localhost:$SERVICE_PORT/api/health" > /dev/null 2>&1 || \
           curl -s "http://localhost:$SERVICE_PORT/" > /dev/null 2>&1; then
            print_success "Service is healthy and responding on port $SERVICE_PORT"
            return 0
        fi

        print_status "Attempt $attempt/$max_attempts: Service not ready yet..."
        sleep 2
        attempt=$((attempt + 1))
    done

    print_error "Service health check failed after $max_attempts attempts"
    return 1
}

# =============================================================================
# MAIN EXECUTION
# =============================================================================

main() {
    # Validate service configuration
    validate_service_config

    # Check prerequisites
    check_docker
    check_docker_compose

    # Show header
    print_header

    # Parse command line arguments
    local command=${1:-help}
    local environment=${2:-local}

    case $command in
        build)
            build_image $environment
            ;;
        start)
            start_containers $environment
            ;;
        stop)
            stop_containers $environment
            ;;
        restart)
            restart_containers $environment
            ;;
        logs)
            show_logs $environment
            ;;
        status)
            show_status $environment
            ;;
        clean)
            clean_environment $environment
            ;;
        health)
            check_service_health $environment
            ;;
        help|--help|-h)
            print_usage
            ;;
        *)
            print_error "Unknown command: $command"
            print_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
