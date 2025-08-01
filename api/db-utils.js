// Database utilities for serverless functions
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 1, // Important: Limit connections for serverless
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pool;
}

// Initialize database tables
async function initDatabase() {
  const client = getPool();
  
  const queries = [
    // Users table
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      tier VARCHAR(20) DEFAULT 'free',
      daily_searches INTEGER DEFAULT 0,
      total_searches INTEGER DEFAULT 0,
      last_search_date DATE,
      subscription_expires TIMESTAMP,
      stripe_customer_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Analyses table
    `CREATE TABLE IF NOT EXISTS analyses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      crypto_symbol VARCHAR(10) NOT NULL,
      crypto_name VARCHAR(100),
      score INTEGER NOT NULL,
      signal VARCHAR(20) NOT NULL,
      confidence VARCHAR(20),
      price_data JSONB,
      analysis_data JSONB,
      ip_address INET,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    // Indexes
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
    `CREATE INDEX IF NOT EXISTS idx_analyses_symbol ON analyses(crypto_symbol)`,
    `CREATE INDEX IF NOT EXISTS idx_analyses_timestamp ON analyses(timestamp DESC)`,
  ];

  try {
    for (const query of queries) {
      await client.query(query);
    }
    console.log('✅ Database initialized');
  } catch (error) {
    console.error('❌ Database init failed:', error);
    throw error;
  }
}

// User operations
async function createUser(email, password) {
  const client = getPool();
  const passwordHash = await bcrypt.hash(password, 12);
  
  try {
    const result = await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, tier, daily_searches, subscription_expires',
      [email, passwordHash]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw new Error('Email already exists');
    }
    throw error;
  }
}

async function getUserByEmail(email) {
  const client = getPool();
  const result = await client.query(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

async function getUserById(id) {
  const client = getPool();
  const result = await client.query(
    'SELECT id, email, tier, daily_searches, total_searches, last_search_date, subscription_expires FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// JWT operations
function generateJWT(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      tier: user.tier 
    },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '7d' }
  );
}

function verifyJWT(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
  } catch (error) {
    return null;
  }
}

// Analysis operations
async function saveAnalysis(data) {
  const client = getPool();
  const result = await client.query(
    `INSERT INTO analyses 
     (user_id, crypto_symbol, crypto_name, score, signal, confidence, price_data, analysis_data, ip_address) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
     RETURNING *`,
    [
      data.user_id,
      data.crypto_symbol,
      data.crypto_name,
      data.score,
      data.signal,
      data.confidence,
      JSON.stringify(data.price_data || {}),
      JSON.stringify(data.analysis_data || {}),
      data.ip_address
    ]
  );
  return result.rows[0];
}

async function getRecentAnalyses(userId, limit = 10) {
  const client = getPool();
  const result = await client.query(
    'SELECT * FROM analyses WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
    [userId, limit]
  );
  return result.rows;
}

async function updateUserSearches(userId) {
  const client = getPool();
  const today = new Date().toISOString().split('T')[0];
  
  // Get current user
  const user = await getUserById(userId);
  if (!user) return;

  const isNewDay = !user.last_search_date || 
    new Date(user.last_search_date).toISOString().split('T')[0] !== today;
  
  const dailySearches = isNewDay ? 1 : (user.daily_searches || 0) + 1;

  await client.query(
    `UPDATE users 
     SET daily_searches = $1, 
         total_searches = COALESCE(total_searches, 0) + 1,
         last_search_date = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [dailySearches, today, userId]
  );
}

async function getDashboardStats(userId) {
  const client = getPool();
  const results = await Promise.all([
    client.query('SELECT COUNT(*) as total FROM analyses WHERE user_id = $1', [userId]),
    client.query('SELECT COUNT(*) as today FROM analyses WHERE user_id = $1 AND DATE(timestamp) = CURRENT_DATE', [userId]),
    client.query('SELECT COUNT(*) as successful FROM analyses WHERE user_id = $1 AND score >= 70', [userId])
  ]);

  return {
    totalAnalyses: parseInt(results[0].rows[0].total),
    dailySearches: parseInt(results[1].rows[0].today),
    successfulPredictions: parseInt(results[2].rows[0].successful),
    moneySaved: parseInt(results[2].rows[0].successful) * 150
  };
}

async function getLeaderboard(timeframe = '24h', limit = 50) {
  const client = getPool();
  let timeCondition = '';
  
  switch (timeframe) {
    case '7d':
      timeCondition = "AND timestamp >= NOW() - INTERVAL '7 days'";
      break;
    case '30d':
      timeCondition = "AND timestamp >= NOW() - INTERVAL '30 days'";
      break;
    default:
      timeCondition = "AND timestamp >= NOW() - INTERVAL '24 hours'";
  }

  const result = await client.query(
    `SELECT 
       crypto_symbol,
       crypto_name,
       AVG(score) as score,
       COUNT(*) as search_count,
       MAX(timestamp) as last_analyzed,
       CASE 
         WHEN AVG(score) >= 70 THEN 'BUY'
         WHEN AVG(score) >= 40 THEN 'MAYBE' 
         ELSE 'WAIT'
       END as signal,
       CASE 
         WHEN COUNT(*) >= 10 THEN 'High'
         WHEN COUNT(*) >= 5 THEN 'Medium'
         ELSE 'Low'
       END as confidence
     FROM analyses 
     WHERE 1=1 ${timeCondition}
     GROUP BY crypto_symbol, crypto_name
     ORDER BY AVG(score) DESC, COUNT(*) DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row, index) => ({
    rank: index + 1,
    symbol: row.crypto_symbol,
    name: row.crypto_name,
    score: Math.round(row.score),
    signal: row.signal,
    confidence: row.confidence,
    searchCount: row.search_count,
    lastAnalyzed: row.last_analyzed
  }));
}

// Authentication middleware for serverless functions
function authenticateToken(req) {
  const token = req.cookies?.auth;
  if (!token) return null;
  
  return verifyJWT(token);
}

module.exports = {
  initDatabase,
  createUser,
  getUserByEmail,
  getUserById,
  verifyPassword,
  generateJWT,
  verifyJWT,
  authenticateToken,
  saveAnalysis,
  getRecentAnalyses,
  updateUserSearches,
  getDashboardStats,
  getLeaderboard
};