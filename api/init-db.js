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
      
      // If we can count users, the schema is already initialized
      console.log('Database schema is already initialized!');
      
    } catch (error) {
      console.log('Schema may not exist, error:', error.message);
      
      // Try to create an admin user, which will fail if schema doesn't exist
      // This is a way to test schema existence without raw DDL
      throw new Error('Database schema not initialized. Please run "npx prisma db push" locally or contact support.');
    }

    await prisma.$disconnect();

    return res.status(200).json({
      success: true,
      message: 'Database schema is ready',
      schema_status: 'already_initialized',
      user_count: userCount,
      next_steps: [
        'Database is ready for user registration',
        'You can create accounts via /signup',
        'Admin account can be created through registration'
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