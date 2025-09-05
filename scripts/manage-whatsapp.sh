#!/bin/bash

# WhatsApp PM2 Management Script
# Usage: ./scripts/manage-whatsapp.sh [command]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="haloBE-app"
WHATSAPP_ROUTES="/v1/whatsapp"
PORT=4000

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
    echo -e "${BLUE}WhatsApp PM2 Management${NC}"
    echo -e "${BLUE}================================${NC}"
}

# Function to check if PM2 is installed
check_pm2() {
    if ! command -v pm2 &> /dev/null; then
        print_error "PM2 is not installed. Please install it first:"
        echo "npm install -g pm2"
        exit 1
    fi
}

# Function to check if app is running
check_app_running() {
    if pm2 list | grep -q "$APP_NAME"; then
        return 0
    else
        return 1
    fi
}

# Function to start WhatsApp (via main app)
start_whatsapp() {
    print_header
    print_status "Starting WhatsApp integration..."

    if check_app_running; then
        print_warning "App is already running. Restarting..."
        pm2 restart $APP_NAME
    else
        print_status "Starting main application with WhatsApp..."
        pm2 start ecosystem.config.js --env development
    fi

    print_status "Waiting for app to start..."
    sleep 3

    # Check if WhatsApp routes are accessible
    if curl -s "http://localhost:$PORT$WHATSAPP_ROUTES/status" > /dev/null 2>&1; then
        print_status "✅ WhatsApp integration is running!"
    else
        print_warning "⚠️ App started but WhatsApp routes may not be ready yet"
    fi
}

# Function to stop WhatsApp
stop_whatsapp() {
    print_header
    print_status "Stopping WhatsApp integration..."

    if check_app_running; then
        pm2 stop $APP_NAME
        print_status "✅ WhatsApp integration stopped"
    else
        print_warning "App is not running"
    fi
}

# Function to restart WhatsApp
restart_whatsapp() {
    print_header
    print_status "Restarting WhatsApp integration..."

    if check_app_running; then
        pm2 restart $APP_NAME
        print_status "✅ WhatsApp integration restarted"
    else
        print_warning "App is not running. Starting it..."
        start_whatsapp
    fi
}

# Function to show status
show_status() {
    print_header
    print_status "WhatsApp Integration Status:"
    echo ""

    # PM2 status
    print_status "PM2 Status:"
    pm2 list | grep -E "(haloBE-app|haloBE-whatsapp)" || print_warning "No WhatsApp-related apps found"
    echo ""

    # Check if app is running
    if check_app_running; then
        print_status "✅ Main app is running"

        # Check WhatsApp routes
        print_status "Checking WhatsApp routes..."
        if curl -s "http://localhost:$PORT$WHATSAPP_ROUTES/status" > /dev/null 2>&1; then
            print_status "✅ WhatsApp routes are accessible"
        else
            print_warning "⚠️ WhatsApp routes are not accessible"
        fi

        # Check webhook endpoint
        if curl -s "http://localhost:$PORT$WHATSAPP_ROUTES/webhook" > /dev/null 2>&1; then
            print_status "✅ Webhook endpoint is accessible"
        else
            print_warning "⚠️ Webhook endpoint is not accessible"
        fi
    else
        print_error "❌ Main app is not running"
    fi
}

# Function to show logs
show_logs() {
    print_header
    print_status "Showing WhatsApp-related logs..."
    echo ""

    if check_app_running; then
        pm2 logs $APP_NAME --lines 50 | grep -i whatsapp || print_warning "No WhatsApp logs found"
    else
        print_error "App is not running"
    fi
}

# Function to monitor in real-time
monitor() {
    print_header
    print_status "Starting real-time monitoring..."
    echo "Press Ctrl+C to stop monitoring"
    echo ""

    if check_app_running; then
        pm2 monit
    else
        print_error "App is not running"
    fi
}

# Function to test WhatsApp endpoints
test_endpoints() {
    print_header
    print_status "Testing WhatsApp endpoints..."
    echo ""

    if ! check_app_running; then
        print_error "App is not running. Please start it first."
        return 1
    fi

    # Test status endpoint
    print_status "Testing status endpoint..."
    if curl -s "http://localhost:$PORT$WHATSAPP_ROUTES/status" > /dev/null 2>&1; then
        print_status "✅ Status endpoint: OK"
    else
        print_error "❌ Status endpoint: FAILED"
    fi

    # Test webhook endpoint
    print_status "Testing webhook endpoint..."
    if curl -s "http://localhost:$PORT$WHATSAPP_ROUTES/webhook" > /dev/null 2>&1; then
        print_status "✅ Webhook endpoint: OK"
    else
        print_error "❌ Webhook endpoint: FAILED"
    fi

    # Test sessions endpoint
    print_status "Testing sessions endpoint..."
    if curl -s "http://localhost:$PORT$WHATSAPP_ROUTES/sessions" > /dev/null 2>&1; then
        print_status "✅ Sessions endpoint: OK"
    else
        print_error "❌ Sessions endpoint: FAILED"
    fi
}

# Function to show help
show_help() {
    print_header
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  start     - Start WhatsApp integration"
    echo "  stop      - Stop WhatsApp integration"
    echo "  restart   - Restart WhatsApp integration"
    echo "  status    - Show WhatsApp status"
    echo "  logs      - Show WhatsApp logs"
    echo "  monitor   - Monitor in real-time"
    echo "  test      - Test WhatsApp endpoints"
    echo "  help      - Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start"
    echo "  $0 status"
    echo "  $0 logs"
}

# Main script logic
main() {
    check_pm2

    case "${1:-help}" in
        start)
            start_whatsapp
            ;;
        stop)
            stop_whatsapp
            ;;
        restart)
            restart_whatsapp
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        monitor)
            monitor
            ;;
        test)
            test_endpoints
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            print_error "Unknown command: $1"
            show_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
