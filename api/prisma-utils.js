// Prisma database utilities for serverless functions
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Global Prisma client for serverless optimization
let prisma;

function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL
        }
      }
    });
  }
  return prisma;
}

// User operations
async function createUser(email, password) {
  const client = getPrismaClient();
  const passwordHash = await bcrypt.hash(password, 12);
  
  try {
    const user = await client.user.create({
      data: {
        email,
        passwordHash
      },
      select: {
        id: true,
        email: true,
        tier: true,
        dailySearches: true,
        subscriptionExpires: true,
        createdAt: true
      }
    });
    return user;
  } catch (error) {
    if (error.code === 'P2002') {
      throw new Error('Email already exists');
    }
    throw error;
  }
}

async function getUserByEmail(email) {
  const client = getPrismaClient();
  return await client.user.findUnique({
    where: { email }
  });
}

async function getUserById(id) {
  const client = getPrismaClient();
  return await client.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      tier: true,
      dailySearches: true,
      totalSearches: true,
      lastSearchDate: true,
      subscriptionExpires: true
    }
  });
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
  const client = getPrismaClient();
  
  const analysis = await client.analysis.create({
    data: {
      userId: data.user_id,
      cryptoSymbol: data.crypto_symbol,
      cryptoName: data.crypto_name,
      score: data.score,
      signal: data.signal,
      confidence: data.confidence,
      priceData: data.price_data || {},
      analysisData: data.analysis_data || {},
      ipAddress: data.ip_address
    }
  });
  
  return analysis;
}

async function getRecentAnalyses(userId, limit = 10) {
  const client = getPrismaClient();
  
  return await client.analysis.findMany({
    where: { userId },
    orderBy: { timestamp: 'desc' },
    take: limit,
    select: {
      id: true,
      cryptoSymbol: true,
      cryptoName: true,
      score: true,
      signal: true,
      confidence: true,
      timestamp: true
    }
  });
}

async function updateUserSearches(userId) {
  const client = getPrismaClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Get current user
  const user = await client.user.findUnique({
    where: { id: userId }
  });
  
  if (!user) return;

  const isNewDay = !user.lastSearchDate || 
    user.lastSearchDate.getTime() !== today.getTime();
  
  const dailySearches = isNewDay ? 1 : (user.dailySearches || 0) + 1;

  await client.user.update({
    where: { id: userId },
    data: {
      dailySearches,
      totalSearches: { increment: 1 },
      lastSearchDate: today
    }
  });
}

async function getDashboardStats(userId) {
  const client = getPrismaClient();
  
  const [totalAnalyses, todayAnalyses, successfulPredictions] = await Promise.all([
    client.analysis.count({
      where: { userId }
    }),
    client.analysis.count({
      where: {
        userId,
        timestamp: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    }),
    client.analysis.count({
      where: {
        userId,
        score: { gte: 70 }
      }
    })
  ]);

  return {
    totalAnalyses,
    dailySearches: todayAnalyses,
    successfulPredictions,
    moneySaved: successfulPredictions * 150
  };
}

async function getLeaderboard(timeframe = '24h', limit = 50) {
  const client = getPrismaClient();
  
  let timeCondition = {};
  const now = new Date();
  
  switch (timeframe) {
    case '7d':
      timeCondition = {
        timestamp: {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        }
      };
      break;
    case '30d':
      timeCondition = {
        timestamp: {
          gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        }
      };
      break;
    default: // 24h
      timeCondition = {
        timestamp: {
          gte: new Date(now.getTime() - 24 * 60 * 60 * 1000)
        }
      };
  }

  const analyses = await client.analysis.groupBy({
    by: ['cryptoSymbol', 'cryptoName'],
    where: timeCondition,
    _avg: {
      score: true
    },
    _count: {
      id: true
    },
    _max: {
      timestamp: true
    },
    orderBy: [
      { _avg: { score: 'desc' } },
      { _count: { id: 'desc' } }
    ],
    take: limit
  });

  return analyses.map((item, index) => ({
    rank: index + 1,
    symbol: item.cryptoSymbol,
    name: item.cryptoName,
    score: Math.round(item._avg.score || 0),
    signal: (item._avg.score || 0) >= 70 ? 'BUY' : 
            (item._avg.score || 0) >= 40 ? 'MAYBE' : 'WAIT',
    confidence: (item._count.id || 0) >= 10 ? 'High' : 
                (item._count.id || 0) >= 5 ? 'Medium' : 'Low',
    searchCount: item._count.id,
    lastAnalyzed: item._max.timestamp
  }));
}

// Authentication middleware for serverless functions
function authenticateToken(req) {
  const token = req.cookies?.auth;
  if (!token) return null;
  
  return verifyJWT(token);
}

export {
  getPrismaClient,
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