// Detailed auth API testing
async function testAuthDetailed() {
  console.log('🔍 Detailed Auth API Testing...\n');
  
  const baseUrl = 'https://isthisthedip.xyz';
  
  try {
    // Test 1: Check if auth endpoint exists
    console.log('1. Testing auth endpoint availability...');
    const authTestResponse = await fetch(`${baseUrl}/api/auth?action=me`, {
      method: 'GET',
    });
    
    console.log('Auth endpoint status:', authTestResponse.status);
    const authTestData = await authTestResponse.text();
    console.log('Auth endpoint response:', authTestData.substring(0, 200));
    
    // Test 2: Try registration with detailed logging
    console.log('\n2. Testing registration...');
    const testEmail = `test${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';
    
    console.log('Registration data:', { email: testEmail, password: testPassword });
    
    const registerResponse = await fetch(`${baseUrl}/api/auth?action=register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email: testEmail, 
        password: testPassword 
      })
    });
    
    console.log('Register status:', registerResponse.status);
    console.log('Register headers:', Object.fromEntries(registerResponse.headers));
    
    const registerText = await registerResponse.text();
    console.log('Register response text:', registerText);
    
    let registerData;
    try {
      registerData = JSON.parse(registerText);
    } catch (e) {
      console.log('Failed to parse register response as JSON:', e.message);
      return;
    }
    
    if (registerData.success) {
      console.log('✅ Registration successful!');
      console.log('User data:', registerData.user);
      
      // Test 3: Try login with the same credentials
      console.log('\n3. Testing login with registered credentials...');
      const loginResponse = await fetch(`${baseUrl}/api/auth?action=login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: testEmail, 
          password: testPassword 
        })
      });
      
      console.log('Login status:', loginResponse.status);
      const loginData = await loginResponse.json();
      console.log('Login response:', loginData);
      
      if (loginData.success) {
        console.log('✅ Login successful!');
        console.log('👤 Logged in user:', loginData.user);
      } else {
        console.log('❌ Login failed:', loginData.error);
      }
      
    } else {
      console.log('❌ Registration failed:', registerData.error || registerData);
    }
    
  } catch (error) {
    console.error('❌ Error in detailed auth test:', error.message);
    console.error('Full error:', error);
  }
}

testAuthDetailed();