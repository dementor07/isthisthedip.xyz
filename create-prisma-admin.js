// Create admin account using Prisma
import { createUser, getUserByEmail } from './api/prisma-utils.js';

async function createAdminAccount() {
  console.log('👑 Creating Admin Pro Account with Prisma...\n');
  
  try {
    // Admin account details
    const adminEmail = 'admin@isthisthedip.xyz';
    const adminPassword = 'AdminPro2025!';
    
    console.log('📧 Email:', adminEmail);
    console.log('🔐 Password:', adminPassword);
    
    // Check if admin already exists
    const existingAdmin = await getUserByEmail(adminEmail);
    if (existingAdmin) {
      console.log('ℹ️  Admin account already exists!');
      console.log('👑 Admin Account Details:');
      console.log('📧 Email:', adminEmail);
      console.log('🔐 Password:', adminPassword);
      console.log('🎯 Tier:', existingAdmin.tier);
      console.log('🛡️  Admin: Yes');
      return;
    }
    
    // Create admin account
    console.log('🔨 Creating new admin account...');
    const adminUser = await createUser(adminEmail, adminPassword);
    
    console.log('✅ Admin Pro account created successfully!');
    console.log('\n👑 Admin Account Details:');
    console.log('📧 Email:', adminEmail);
    console.log('🔐 Password:', adminPassword);
    console.log('🎯 Tier:', adminUser.tier);
    console.log('🛡️  Admin: Yes');
    console.log('🔍 Searches: Unlimited');
    console.log('⏰ Created:', adminUser.createdAt);
    
    console.log('\n🎉 Admin account setup complete!');
    console.log('💡 You can now login at /login with admin credentials');
    console.log('👑 You have full Pro features + admin controls');
    
  } catch (error) {
    console.error('❌ Failed to create admin account:', error.message);
    console.error('Full error:', error);
  }
}

createAdminAccount();