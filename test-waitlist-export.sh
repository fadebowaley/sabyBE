#!/bin/bash

echo "Testing Waitlist Export Functionality"
echo "======================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Note: You need to replace {admin_token} with actual admin token
echo -e "${BLUE}Instructions:${NC}"
echo "1. Get admin token by logging in as admin user"
echo "2. Replace {admin_token} in the commands below with actual token"
echo ""

echo -e "${GREEN}Export as JSON:${NC}"
echo 'curl -H "Authorization: Bearer {admin_token}" "http://localhost:4000/v1/waitlist/admin/export?format=json"'
echo ""

echo -e "${GREEN}Export as CSV:${NC}"
echo 'curl -H "Authorization: Bearer {admin_token}" "http://localhost:4000/v1/waitlist/admin/export?format=csv"'
echo ""

echo -e "${GREEN}Export filtered by industry (Fintech only):${NC}"
echo 'curl -H "Authorization: Bearer {admin_token}" "http://localhost:4000/v1/waitlist/admin/export?format=csv&filter={\"industry\":\"Fintech\"}"'
echo ""

echo -e "${GREEN}Export only users requesting demo:${NC}"
echo 'curl -H "Authorization: Bearer {admin_token}" "http://localhost:4000/v1/waitlist/admin/export?format=json&filter={\"needsDemo\":true}"'
echo ""

echo "Export files will be automatically downloaded with timestamp in filename"
