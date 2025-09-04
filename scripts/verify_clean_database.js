const mongoose = require('mongoose');
const config = require('../src/config/config');
const User = require('../src/models/user.model');
const Role = require('../src/models/role.model');
const Level = require('../src/models/level.model');
const Structures = require('../src/models/structure.model');
const Nodes = require('../src/models/node.model');

async function verifyCleanDatabase() {
  try {
    console.log('🔍 Verifying Clean Database State...\n');

    // Connect to MongoDB
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    console.log('✅ Connected to MongoDB');

    // Get tenant context
    const fadebowale = await User.findOne({ email: 'fadebowaley@gmail.com' });
    if (!fadebowale) {
      throw new Error('fadebowaley@gmail.com not found in database');
    }

    const tenantId = fadebowale.tenantId;
    console.log(`   ✅ Tenant ID: ${tenantId}\n`);

    // Check each entity type
    const users = await User.find({ tenantId, deletedAt: null });
    const roles = await Role.find({ tenantId });
    const levels = await Level.find({ tenantId });
    const structures = await Structures.find({ tenantId });
    const nodes = await Nodes.find({ tenantId, deletedAt: null });

    console.log('📊 DATABASE STATE VERIFICATION:');
    console.log('=' .repeat(40));
    console.log(`👤 Users: ${users.length} (should be 1 - fadebowaley@gmail.com)`);
    console.log(`🔐 Roles: ${roles.length} (should be 1 - Support Agent)`);
    console.log(`📊 Levels: ${levels.length} (should be 0)`);
    console.log(`🏗️  Structures: ${structures.length} (should be 0)`);
    console.log(`📍 Nodes: ${nodes.length} (should be 0)`);
    console.log('=' .repeat(40));

    // Verify expected state
    const isClean = users.length === 1 && 
                   roles.length === 1 && 
                   levels.length === 0 && 
                   structures.length === 0 && 
                   nodes.length === 0;

    if (isClean) {
      console.log('✅ DATABASE IS CLEAN AND READY FOR REAL DATA!');
      console.log('');
      console.log('🎯 Ready for:');
      console.log('   - Real user data migration');
      console.log('   - Real organizational structure setup');
      console.log('   - Production data import');
    } else {
      console.log('⚠️  Database may not be completely clean');
      console.log('   Please check the counts above');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Database disconnected');
  }
}

verifyCleanDatabase();
