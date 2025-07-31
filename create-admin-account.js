const Database = require('./api/database');
const bcrypt = require('bcrypt');

async function createAdminAccount() {
  console.log('👑 Creating Admin Pro Account...\n');
  
  try {
    const db = new Database();
    await db.connect();
    
    // Add is_admin column if it doesn't exist
    try {
      await db.run('ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0');
      console.log('📝 Added is_admin column to users table');
    } catch (error) {
      if (!error.message.includes('duplicate column')) {
        console.log('ℹ️  is_admin column already exists or other error:', error.message);
      }
    }
    
    // Admin account details
    const adminEmail = 'admin@isthisthedip.xyz';
    const adminPassword = 'AdminPro2025!'; // You can change this
    
    // Delete any existing admin account
    await db.run('DELETE FROM users WHERE email = ?', [adminEmail]);
    console.log('🗑️  Removed any existing admin account');
    
    // Hash password
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    // Create admin account
    const result = await db.run(`
      INSERT INTO users (email, password_hash, subscription_tier, subscription_expires, is_admin, daily_searches)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      adminEmail,
      hashedPassword, 
      'pro',
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
      1, // is_admin = true
      999999 // unlimited searches
    ]);
    
    console.log('✅ Admin Pro account created successfully!');
    console.log('\n👑 Admin Account Details:');
    console.log('📧 Email:', adminEmail);
    console.log('🔐 Password:', adminPassword);
    console.log('🎯 Tier: Pro (lifetime)');
    console.log('🛡️  Admin: Yes');
    console.log('🔍 Searches: Unlimited');
    console.log('⏰ Expires: 1 year from now');
    
    // Remove test dummy accounts
    const deleted = await db.run('DELETE FROM users WHERE email LIKE "%test%" OR email LIKE "%dummy%"');
    console.log(`\n🗑️  Removed ${deleted.changes || 0} test/dummy accounts`);
    
    // Show total users
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    console.log(`👥 Total users in system: ${userCount.count}`);
    
    await db.close();
    
    console.log('\n🎉 Admin account setup complete!');
    console.log('💡 You can now login at /login with admin credentials');
    console.log('👑 You have full Pro features + admin controls');
    
  } catch (error) {
    console.error('❌ Failed to create admin account:', error.message);
  }
}

createAdminAccount();