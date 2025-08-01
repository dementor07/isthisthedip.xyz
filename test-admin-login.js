// Test admin login by calling the API directly
async function testAdminLogin() {
  console.log('🧪 Testing admin login...\n');
  
  const adminEmail = 'admin@isthisthedip.xyz';
  const adminPassword = 'AdminPro2025!';
  
  try {
    // First, try to register the admin account
    console.log('1. Attempting to register admin account...');
    const registerResponse = await fetch('https://isthisthedip.xyz/api/auth?action=register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email: adminEmail, 
        password: adminPassword 
      })
    });
    
    const registerData = await registerResponse.json();
    console.log('Register response:', registerData);
    
    // Then try to login
    console.log('\n2. Attempting to login...');
    const loginResponse = await fetch('https://isthisthedip.xyz/api/auth?action=login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email: adminEmail, 
        password: adminPassword 
      })
    });
    
    const loginData = await loginResponse.json();
    console.log('Login response:', loginData);
    
    if (loginData.success) {
      console.log('\n✅ Admin login successful!');
      console.log('👑 User details:', loginData.user);
    } else {
      console.log('\n❌ Admin login failed:', loginData.error);
    }
    
  } catch (error) {
    console.error('❌ Error testing admin login:', error.message);
  }
}

testAdminLogin();