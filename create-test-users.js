const Database = require('./api/database');
const bcrypt = require('bcrypt');

async function createTestUsers() {
  const db = new Database();
  await db.connect();

  try {
    // Create test premium user
    const premiumPasswordHash = await bcrypt.hash('test123', 12);
    await db.run(`
      INSERT OR REPLACE INTO users (id, email, password_hash, subscription_tier, subscription_expires) 
      VALUES (1, 'premium@test.com', ?, 'premium', ?)
    `, [premiumPasswordHash, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()]);

    // Create test pro user  
    const proPasswordHash = await bcrypt.hash('test123', 12);
    await db.run(`
      INSERT OR REPLACE INTO users (id, email, password_hash, subscription_tier, subscription_expires)
      VALUES (2, 'pro@test.com', ?, 'pro', ?)
    `, [proPasswordHash, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()]);

    // Create test free user
    const freePasswordHash = await bcrypt.hash('test123', 12);
    await db.run(`
      INSERT OR REPLACE INTO users (id, email, password_hash, subscription_tier)
      VALUES (3, 'free@test.com', ?, 'free')
    `, [freePasswordHash]);

    console.log('✅ Test users created successfully!');
    console.log('');
    console.log('Premium User: premium@test.com / test123');
    console.log('Pro User: pro@test.com / test123');
    console.log('Free User: free@test.com / test123');
    console.log('');
    console.log('All passwords: test123');

  } catch (error) {
    console.error('Error creating test users:', error);
  } finally {
    db.close();
  }
}

createTestUsers();