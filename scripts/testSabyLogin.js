const axios = require('axios');

/**
 * Script to test SabyUser login via API
 */

const testLogin = async () => {
  try {
    console.log('🧪 Testing SabyUser Login...\n');

    const loginData = {
      email: 'saby@saby.ai',
      password: '@saby_Saby1',
    };

    console.log('Attempting login with:');
    console.log('Email:   ', loginData.email);
    console.log('Password:', '********');
    console.log('\nSending request to: http://localhost:4000/v1/auth/login\n');

    const response = await axios.post(
      'http://localhost:4000/v1/auth/login',
      loginData
    );

    if (response.data && response.data.user) {
      console.log('✅ LOGIN SUCCESSFUL!\n');
      console.log('User Details:');
      console.log('=============');
      console.log('Email:    ', response.data.user.email);
      console.log('Name:     ', response.data.user.name);
      console.log('User ID:  ', response.data.user.userId);
      console.log('Halo ID:  ', response.data.user.haloId);
      console.log('Tenant ID:', response.data.user.tenantId);
      console.log('\nPrivileges:');
      console.log('===========');
      console.log(
        'isSaby:   ',
        response.data.user.isSaby ? '✅ true' : '❌ false'
      );
      console.log(
        'isSuper:  ',
        response.data.user.isSuper ? '✅ true' : '❌ false'
      );
      console.log(
        'isOwner:  ',
        response.data.user.isOwner ? '✅ true' : '❌ false'
      );
      console.log('\nTokens:');
      console.log('=======');
      console.log(
        'Access Token: ',
        `${response.data.tokens.access.token.substring(0, 50)}...`
      );
      console.log(
        'Refresh Token:',
        `${response.data.tokens.refresh.token.substring(0, 50)}...`
      );
      console.log(
        '\n🎉 You can now use these credentials to login to the frontend!'
      );
      console.log('🚀 Navigate to: http://localhost:3000/auth/sign-in\n');
    } else {
      console.log('❌ Unexpected response format');
      console.log(response.data);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Cannot connect to backend server');
      console.log('\n💡 Backend server is not running. Start it with:');
      console.log('   cd /Users/fadebowaley/saby/sabyBackend');
      console.log('   npm run dev');
      console.log('\nOnce backend is running, try this test again.\n');
    } else if (error.response) {
      console.log('❌ LOGIN FAILED\n');
      console.log('Status:', error.response.status);
      console.log('Error:', error.response.data.message || error.response.data);

      if (error.response.status === 401) {
        console.log('\n💡 Invalid credentials. Check:');
        console.log('   1. Email is correct: saby@saby.ai');
        console.log('   2. Password is correct: @saby_Saby1');
        console.log(
          '   3. Account is activated (run: node scripts/activateSabyUser.js)'
        );
      }
    } else {
      console.log('❌ Error:', error.message);
    }
  }
};

// Run the test
testLogin();
