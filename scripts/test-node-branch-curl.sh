#!/bin/bash

# Test Script for GET /v1/node/:nodeId/branch Endpoint (using curl)
#
# This script tests the branch endpoint using curl
#
# Usage:
#   ./test-node-branch-curl.sh <nodeId> [token]
#
# Examples:
#   ./test-node-branch-curl.sh 507f1f77bcf86cd799439011
#   ./test-node-branch-curl.sh 507f1f77bcf86cd799439011 "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

API_BASE_URL="${API_BASE_URL:-http://localhost:4000/v1}"
NODE_ID="$1"
TOKEN="$2"

if [ -z "$NODE_ID" ]; then
  echo "❌ Error: Node ID is required"
  echo ""
  echo "Usage: ./test-node-branch-curl.sh <nodeId> [token]"
  echo ""
  echo "Examples:"
  echo "  ./test-node-branch-curl.sh 507f1f77bcf86cd799439011"
  echo "  ./test-node-branch-curl.sh 507f1f77bcf86cd799439011 \"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...\""
  exit 1
fi

echo "=================================================================================="
echo "🧪 Testing GET /v1/node/:nodeId/branch Endpoint"
echo "=================================================================================="
echo "Node ID: $NODE_ID"
echo "API Base URL: $API_BASE_URL"
echo ""

# Test 1: Without authentication
echo "=================================================================================="
echo "TEST 1: Request WITHOUT Authentication"
echo "=================================================================================="
echo "🔍 Testing: GET $API_BASE_URL/node/$NODE_ID/branch"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE_URL/node/$NODE_ID/branch")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo "Response:"
echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
echo ""

if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
  echo "✅ Expected failure: Authentication required"
else
  echo "⚠️  Unexpected response"
fi

# Test 2: With authentication (if token provided)
if [ -n "$TOKEN" ]; then
  echo ""
  echo "=================================================================================="
  echo "TEST 2: Request WITH Authentication"
  echo "=================================================================================="
  echo "🔍 Testing: GET $API_BASE_URL/node/$NODE_ID/branch"
  echo "   Auth: Bearer token"
  echo ""

  RESPONSE=$(curl -s -w "\n%{http_code}" -X GET \
    -H "Authorization: Bearer $TOKEN" \
    "$API_BASE_URL/node/$NODE_ID/branch")
  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
  BODY=$(echo "$RESPONSE" | sed '$d')

  echo "HTTP Status: $HTTP_CODE"
  echo "Response:"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  echo ""

  if [ "$HTTP_CODE" = "200" ]; then
    NODE_COUNT=$(echo "$BODY" | jq '.results | length' 2>/dev/null || echo "0")
    echo "✅ Success: $NODE_COUNT nodes returned"
    
    if [ "$NODE_COUNT" -gt 0 ]; then
      echo ""
      echo "📋 First node in results:"
      echo "$BODY" | jq '.results[0] | {id, nodeId, name, path, level: .level.name, structure: .structure.name}' 2>/dev/null || echo "Could not parse"
    fi
  else
    echo "❌ Failed: $HTTP_CODE"
  fi
else
  echo ""
  echo "⚠️  Skipping authenticated test - no token provided"
  echo "   To test with auth: ./test-node-branch-curl.sh <nodeId> <token>"
  echo ""
  echo "   To get a token, login first:"
  echo "   curl -X POST $API_BASE_URL/auth/login \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"email\":\"user@example.com\",\"password\":\"password123\"}'"
fi

echo ""
echo "=================================================================================="
echo "✅ Testing Complete"
echo "=================================================================================="
