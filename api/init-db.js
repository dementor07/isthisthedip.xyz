// Initialize database schema
import { PrismaClient } from '@prisma/client';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST to initialize database.' });
  }

  try {
    console.log('Initializing database schema...');
    
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL
        }
      }
    });

    console.log('Connecting to database...');
    await prisma.$connect();

    // For Vercel Postgres, we need to create a simple admin user directly 
    // since raw DDL operations are restricted. The schema should already exist 
    // from Vercel's Prisma integration.
    console.log('Testing database schema and creating admin user...');
    
    // Check if tables exist by trying to query them
    try {
      const userCount = await prisma.user.count();
      console.log('✅ Users table exists, count:', userCount);
      
      // Create hardcoded admin user if it doesn't exist
      const adminEmail = 'admin@isthisthedip.xyz';
      const adminPassword = 'CryptoDipAdmin2025!';
      
      const existingAdmin = await prisma.user.findUnique({
        where: { email: adminEmail }
      });
      
      if (!existingAdmin) {
        console.log('Creating hardcoded admin user...');
        const bcrypt = await import('bcrypt');
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        
        const adminUser = await prisma.user.create({
          data: {
            email: adminEmail,
            passwordHash: passwordHash,
            tier: 'pro' // Give admin pro tier
          }
        });
        
        console.log('✅ Admin user created:', adminUser.email);
      } else {
        console.log('✅ Admin user already exists');
      }
      
    } catch (error) {
      console.log('Schema may not exist, error:', error.message);
      throw new Error('Database schema not initialized. Please run "npx prisma db push" locally or contact support.');
    }

    await prisma.$disconnect();

    const finalUserCount = await prisma.user.count();
    
    return res.status(200).json({
      success: true,
      message: 'Database schema is ready with admin user',
      schema_status: 'initialized_with_admin',
      user_count: finalUserCount,
      admin_credentials: {
        email: 'admin@isthisthedip.xyz',
        password: 'CryptoDipAdmin2025!',
        tier: 'pro'
      },
      next_steps: [
        'Use admin credentials to login',
        'Admin has pro tier access to all features',
        'Additional users can register via /signup'
      ]
    });

  } catch (error) {
    console.error('Database initialization error:', error);
    return res.status(500).json({
      error: 'Database initialization failed',
      message: error.message,
      code: error.code
    });
  }
}