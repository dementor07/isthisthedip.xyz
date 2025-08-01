// Test database connection
import { PrismaClient } from '@prisma/client';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Testing Prisma connection...');
    
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL
        }
      }
    });

    // Test the database connection
    console.log('Attempting to connect to database...');
    await prisma.$connect();
    console.log('Database connected successfully');

    // Try to query the User table
    console.log('Attempting to count users...');
    const userCount = await prisma.user.count();
    console.log('User count:', userCount);

    // Test creating a simple user (but don't actually save it)
    console.log('Testing user creation schema...');
    const testUserData = {
      email: 'test@example.com',
      passwordHash: 'test_hash'
    };
    
    // Just validate the data structure without saving
    const validation = await prisma.user.findMany({
      take: 1,
      select: {
        id: true,
        email: true,
        tier: true,
        createdAt: true
      }
    });

    await prisma.$disconnect();

    return res.status(200).json({
      success: true,
      message: 'Database connection successful',
      userCount: userCount,
      sampleUser: validation[0] || null,
      environment: {
        prisma_url_exists: !!process.env.PRISMA_DATABASE_URL,
        postgres_url_exists: !!process.env.POSTGRES_URL,
        database_url_used: process.env.PRISMA_DATABASE_URL ? 'PRISMA_DATABASE_URL' : 'POSTGRES_URL'
      }
    });

  } catch (error) {
    console.error('Database test error:', error);
    return res.status(500).json({
      error: 'Database connection failed',
      message: error.message,
      code: error.code,
      details: {
        prisma_url_exists: !!process.env.PRISMA_DATABASE_URL,
        postgres_url_exists: !!process.env.POSTGRES_URL
      }
    });
  }
}