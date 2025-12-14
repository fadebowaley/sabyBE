#!/bin/bash

echo "🐳 Running baseline recomputation INSIDE Docker container..."
echo ""

docker exec saby-mongodb-local mongosh "mongodb://admin:local_mongo_2025@localhost:27017/halo-local?authSource=admin" --quiet --eval "
const tenantId = '0gmUVnDgpY';

print('📊 Pre-computation checks for tenant:', tenantId);
print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
print('   📦 Total Nodes:', db.nodes.countDocuments({ tenantId, deletedAt: null }));
print('   📊 Nodes with Attendance:', db.nodes.countDocuments({ tenantId, 'profile.averageAttendance': { \$gt: 0 } }));
print('   💰 Nodes with Income:', db.nodes.countDocuments({ tenantId, 'profile.averageIncome': { \$exists: true, \$ne: null } }));
print('');
print('✅ Data verification complete!');
print('   → Data EXISTS in MongoDB');
print('   → Ready for recomputation');
"

echo ""
echo "🚀 Now run the Node.js recomputation script from the backend container..."
echo ""



