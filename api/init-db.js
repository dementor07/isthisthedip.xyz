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

    // Push the schema to create tables
    console.log('Creating database tables...');
    
    // Since we can't run prisma db push directly in serverless,
    // we'll execute the raw SQL to create the tables
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" SERIAL NOT NULL,
        "email" TEXT NOT NULL,
        "password_hash" TEXT NOT NULL,
        "tier" TEXT NOT NULL DEFAULT 'free',
        "daily_searches" INTEGER NOT NULL DEFAULT 0,
        "total_searches" INTEGER NOT NULL DEFAULT 0,
        "last_search_date" DATE,
        "subscription_expires" TIMESTAMP(3),
        "stripe_customer_id" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "users_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "analyses" (
        "id" SERIAL NOT NULL,
        "user_id" INTEGER,
        "crypto_symbol" VARCHAR(10) NOT NULL,
        "crypto_name" VARCHAR(100),
        "score" INTEGER NOT NULL,
        "signal" VARCHAR(20) NOT NULL,
        "confidence" VARCHAR(20),
        "price_data" JSONB,
        "analysis_data" JSONB,
        "ip_address" TEXT,
        "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "analyses_crypto_symbol_idx" ON "analyses"("crypto_symbol");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "analyses_timestamp_idx" ON "analyses"("timestamp" DESC);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "analyses_score_idx" ON "analyses"("score" DESC);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "sessions" (
        "id" SERIAL NOT NULL,
        "user_id" INTEGER NOT NULL,
        "token_hash" TEXT NOT NULL,
        "expires_at" TIMESTAMP(3) NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "sessions_token_hash_idx" ON "sessions"("token_hash");
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions"("expires_at");
    `);

    // Add foreign key constraints
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "analyses" 
      ADD CONSTRAINT IF NOT EXISTS "analyses_user_id_fkey" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    `);

    await prisma.$executeRawUnsafe(`
      ALTER TABLE "sessions" 
      ADD CONSTRAINT IF NOT EXISTS "sessions_user_id_fkey" 
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    `);

    console.log('Database schema created successfully!');

    // Test that we can now query the tables
    const userCount = await prisma.user.count();
    console.log('User count after initialization:', userCount);

    await prisma.$disconnect();

    return res.status(200).json({
      success: true,
      message: 'Database schema initialized successfully',
      tables_created: ['users', 'analyses', 'sessions'],
      user_count: userCount,
      next_steps: [
        'Database is now ready for user registration',
        'You can now create accounts via /signup',
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