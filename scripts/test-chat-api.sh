#!/bin/bash

# Chat API Testing Script
# 
# This script provides example API calls for testing the chat endpoints
# 
# Usage:
#   ./scripts/test-chat-api.sh
# 
# Before running, set these environment variables:
#   BASE_URL=http://localhost:4000
#   TOKEN=your_jwt_token
#   USER_ID=user_id

BASE_URL=${BASE_URL:-http://localhost:4000}
TOKEN=${TOKEN:-}
USER_ID=${USER_ID:-}

if [ -z "$TOKEN" ]; then
    echo "❌ Error: TOKEN environment variable not set"
    echo "   export TOKEN=your_jwt_token"
    exit 1
fi

echo "🧪 Chat API Testing Script"
echo "   Base URL: $BASE_URL"
echo "   Token: ${TOKEN:0:20}..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper function to make API calls
api_call() {
    local method=$1
    local endpoint=$2
    local data=$3
    
    if [ -z "$data" ]; then
        curl -s -X "$method" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            "$BASE_URL/api/v1/chat$endpoint" | jq .
    else
        echo "$data" | curl -s -X "$method" \
            -H "Authorization: Bearer $TOKEN" \
            -H "Content-Type: application/json" \
            -d @- \
            "$BASE_URL/api/v1/chat$endpoint" | jq .
    fi
}

# Test functions
test_health() {
    echo -e "${BLUE}📡 Testing Health Endpoint...${NC}"
    curl -s "$BASE_URL/api/health" | jq .
    echo ""
}

test_get_conversations() {
    echo -e "${BLUE}📋 Getting Conversations...${NC}"
    api_call GET "/conversations"
    echo ""
}

test_create_direct_conversation() {
    echo -e "${BLUE}💬 Creating Direct Conversation...${NC}"
    echo "Enter participant user ID:"
    read participant_id
    
    api_call POST "/conversations" "{
        \"type\": \"direct\",
        \"participants\": [\"$USER_ID\", \"$participant_id\"]
    }"
    echo ""
}

test_create_group_conversation() {
    echo -e "${BLUE}👥 Creating Group Conversation...${NC}"
    echo "Enter group name:"
    read group_name
    echo "Enter participant user IDs (comma-separated):"
    read participants
    
    local participants_array=$(echo "$participants" | tr ',' '\n' | sed 's/^/"/;s/$/"/' | tr '\n' ',' | sed 's/,$//')
    local participants_json="[$participants_array]"
    
    api_call POST "/conversations" "{
        \"type\": \"group\",
        \"name\": \"$group_name\",
        \"participants\": $participants_json
    }"
    echo ""
}

test_create_channel() {
    echo -e "${BLUE}📢 Creating Channel...${NC}"
    echo "Enter channel name:"
    read channel_name
    echo "Is public? (true/false):"
    read is_public
    
    api_call POST "/conversations" "{
        \"type\": \"channel\",
        \"name\": \"$channel_name\",
        \"isPublic\": $is_public
    }"
    echo ""
}

test_get_conversation() {
    echo -e "${BLUE}📄 Getting Conversation...${NC}"
    echo "Enter conversation ID:"
    read conversation_id
    
    api_call GET "/conversations/$conversation_id"
    echo ""
}

test_get_messages() {
    echo -e "${BLUE}💭 Getting Messages...${NC}"
    echo "Enter conversation ID:"
    read conversation_id
    
    api_call GET "/conversations/$conversation_id/messages"
    echo ""
}

test_send_message() {
    echo -e "${BLUE}✉️  Sending Message...${NC}"
    echo "Enter conversation ID:"
    read conversation_id
    echo "Enter message content:"
    read content
    
    api_call POST "/conversations/$conversation_id/messages" "{
        \"content\": \"$content\",
        \"messageType\": \"text\"
    }"
    echo ""
}

test_mark_read() {
    echo -e "${BLUE}✓ Marking Message as Read...${NC}"
    echo "Enter message ID:"
    read message_id
    
    api_call POST "/messages/$message_id/read"
    echo ""
}

test_presence() {
    echo -e "${BLUE}👤 Getting User Presence...${NC}"
    echo "Enter user ID:"
    read user_id
    
    api_call GET "/presence/$user_id"
    echo ""
}

test_discover_channels() {
    echo -e "${BLUE}🔍 Discovering Channels...${NC}"
    api_call GET "/conversations/discover"
    echo ""
}

# Main menu
show_menu() {
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  Chat API Testing Menu${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    echo "1.  Test Health Endpoint"
    echo "2.  Get All Conversations"
    echo "3.  Create Direct Conversation"
    echo "4.  Create Group Conversation"
    echo "5.  Create Channel"
    echo "6.  Get Conversation by ID"
    echo "7.  Get Messages in Conversation"
    echo "8.  Send Message"
    echo "9.  Mark Message as Read"
    echo "10. Get User Presence"
    echo "11. Discover Channels"
    echo "0.  Exit"
    echo ""
    echo -n "Select option: "
}

# Main loop
while true; do
    show_menu
    read choice
    echo ""
    
    case $choice in
        1) test_health ;;
        2) test_get_conversations ;;
        3) test_create_direct_conversation ;;
        4) test_create_group_conversation ;;
        5) test_create_channel ;;
        6) test_get_conversation ;;
        7) test_get_messages ;;
        8) test_send_message ;;
        9) test_mark_read ;;
        10) test_presence ;;
        11) test_discover_channels ;;
        0) 
            echo "👋 Goodbye!"
            exit 0
            ;;
        *)
            echo -e "${YELLOW}❌ Invalid option${NC}"
            ;;
    esac
    
    echo ""
    echo "Press Enter to continue..."
    read
done





