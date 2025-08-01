// Vercel serverless function for community chat
import { authenticateToken, getUserById } from './prisma-utils.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.PRISMA_DATABASE_URL || process.env.POSTGRES_URL
    }
  }
});

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'messages':
        return await handleGetMessages(req, res);
      case 'message':
        if (req.method === 'POST') return await handlePostMessage(req, res);
        if (req.method === 'DELETE') return await handleDeleteMessage(req, res);
        break;
      case 'stats':
        return await handleGetStats(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ error: 'Chat operation failed' });
  }
}

async function handleGetMessages(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 50 } = req.query;
    
    // For now, return mock data until we set up the chat table
    const mockMessages = [
      {
        id: 1,
        message: "Welcome to the IsThisTheDip community chat! 🚀",
        username: "System",
        userTier: "admin",
        timestamp: new Date().toISOString(),
        likes: 0
      },
      {
        id: 2,
        message: "Bitcoin is looking like a great dip opportunity at these levels!",
        username: "CryptoBull",
        userTier: "pro",
        timestamp: new Date(Date.now() - 300000).toISOString(),
        likes: 3
      },
      {
        id: 3,
        message: "Fear & Greed index at 65 - market showing some greed. Time to be cautious?",
        username: "MarketWatcher",
        userTier: "premium",
        timestamp: new Date(Date.now() - 600000).toISOString(),
        likes: 1
      }
    ];

    return res.status(200).json({
      success: true,
      messages: mockMessages
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

async function handlePostMessage(req, res) {
  try {
    // Authenticate user
    const decoded = authenticateToken(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (message.length > 500) {
      return res.status(400).json({ error: 'Message too long (max 500 characters)' });
    }

    // Get user details
    const user = await getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // For now, return success with mock data
    const newMessage = {
      id: Date.now(),
      message: message.trim(),
      username: user.email.split('@')[0], // Use part of email as username
      userTier: user.tier || 'free',
      timestamp: new Date().toISOString(),
      likes: 0
    };

    return res.status(200).json({
      success: true,
      message: newMessage
    });

  } catch (error) {
    console.error('Error posting message:', error);
    return res.status(500).json({ error: 'Failed to post message' });
  }
}

async function handleDeleteMessage(req, res) {
  try {
    // Authenticate user
    const decoded = authenticateToken(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { messageId } = req.query;
    if (!messageId) {
      return res.status(400).json({ error: 'Message ID required' });
    }

    // For now, just return success
    return res.status(200).json({
      success: true,
      message: 'Message deleted'
    });

  } catch (error) {
    console.error('Error deleting message:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
}

async function handleGetStats(req, res) {
  try {
    // Return mock stats for now
    const stats = {
      totalMessages: 127,
      activeUsers: 23,
      onlineNow: 8,
      topDiscussions: [
        "Bitcoin Analysis",
        "Fear & Greed Discussion", 
        "Altcoin Opportunities"
      ]
    };

    return res.status(200).json({
      success: true,
      stats: stats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}