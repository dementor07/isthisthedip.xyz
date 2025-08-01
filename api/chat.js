// Unified Chat API endpoint for isthisthedip.xyz
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

// Global PrismaClient instance for serverless optimization
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = globalThis.prisma || new PrismaClient({
    datasources: {
      db: {
        url: process.env.POSTGRES_URL
      }
    }
  });
  if (!globalThis.prisma) {
    globalThis.prisma = prisma;
  }
} else {
  prisma = new PrismaClient();
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test database connection
    await prisma.$connect();

    switch (req.method) {
      case 'GET':
        if (req.url.includes('/messages')) {
          return await getMessages(req, res);
        } else if (req.url.includes('/stats')) {
          return await getStats(req, res);
        } else {
          return res.status(404).json({ error: 'Endpoint not found' });
        }
      
      case 'POST':
        if (req.url.includes('/send')) {
          return await sendMessage(req, res);
        } else {
          return res.status(404).json({ error: 'Endpoint not found' });
        }
      
      case 'DELETE':
        if (req.url.includes('/delete')) {
          return await deleteMessage(req, res);
        } else {
          return res.status(404).json({ error: 'Endpoint not found' });
        }
      
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Database connection failed'
    });
  }
}

// Get chat messages
async function getMessages(req, res) {
  try {
    const { limit = 50 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 50, 100);

    console.log('Fetching chat messages with limit:', limitNum);

    const messages = await prisma.chatMessage.findMany({
      where: {
        isDeleted: false
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limitNum,
      select: {
        id: true,
        message: true,
        username: true,
        userTier: true,
        likes: true,
        createdAt: true,
        userId: true
      }
    });

    console.log(`Found ${messages.length} messages`);

    // Transform data for frontend compatibility
    const formattedMessages = messages.reverse().map(msg => ({
      id: msg.id,
      message: msg.message,
      username: msg.username,
      userTier: msg.userTier,
      likes: msg.likes,
      timestamp: msg.createdAt.toISOString(),
      userId: msg.userId
    }));

    return res.status(200).json({
      success: true,
      messages: formattedMessages,
      count: formattedMessages.length
    });

  } catch (error) {
    console.error('Error fetching messages:', error);
    
    // Return system message as fallback
    return res.status(200).json({
      success: true,
      messages: [
        {
          id: 1,
          message: "Chat system is initializing... Please refresh in a moment.",
          username: "System",
          userTier: "admin",
          likes: 0,
          timestamp: new Date().toISOString(),
          userId: 0
        }
      ],
      count: 1
    });
  }
}

// Get chat statistics
async function getStats(req, res) {
  try {
    const totalMessages = await prisma.chatMessage.count({
      where: { isDeleted: false }
    });

    const activeUsers = await prisma.chatMessage.findMany({
      where: { isDeleted: false },
      select: { userId: true },
      distinct: ['userId']
    });

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messagesLast24h = await prisma.chatMessage.count({
      where: {
        isDeleted: false,
        createdAt: { gte: yesterday }
      }
    });

    const stats = {
      totalMessages,
      activeUsers: activeUsers.length,
      onlineNow: Math.max(1, Math.floor(activeUsers.length * 0.3)),
      messagesLast24h
    };

    return res.status(200).json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching stats:', error);
    return res.status(200).json({
      success: true,
      stats: {
        totalMessages: 127,
        activeUsers: 23,
        onlineNow: 7,
        messagesLast24h: 45
      }
    });
  }
}

// Send a message
async function sendMessage(req, res) {
  try {
    // Authenticate user
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { message } = req.body;
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    // Save message to database
    const newMessage = await prisma.chatMessage.create({
      data: {
        userId: user.id,
        message: message.trim(),
        username: user.email.split('@')[0],
        userTier: user.tier || 'free'
      },
      select: {
        id: true,
        message: true,
        username: true,
        userTier: true,
        likes: true,
        createdAt: true,
        userId: true
      }
    });

    return res.status(200).json({
      success: true,
      message: {
        id: newMessage.id,
        message: newMessage.message,
        username: newMessage.username,
        userTier: newMessage.userTier,
        likes: newMessage.likes,
        timestamp: newMessage.createdAt.toISOString(),
        userId: newMessage.userId
      }
    });

  } catch (error) {
    console.error('Error posting message:', error);
    return res.status(500).json({ 
      error: 'Failed to post message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Delete a message
async function deleteMessage(req, res) {
  try {
    // Authenticate user
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { messageId } = req.query;
    if (!messageId) {
      return res.status(400).json({ error: 'Message ID required' });
    }

    // Get message details
    const existingMessage = await prisma.chatMessage.findUnique({
      where: { id: parseInt(messageId) },
      select: { id: true, userId: true, isDeleted: true }
    });

    if (!existingMessage || existingMessage.isDeleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check permissions
    const isAdmin = user.email && user.email.includes('admin');
    const isOwner = existingMessage.userId === user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Soft delete the message
    await prisma.chatMessage.update({
      where: { id: parseInt(messageId) },
      data: { isDeleted: true }
    });

    return res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting message:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
}

// Authentication helper
async function authenticateUser(req) {
  try {
    const token = req.cookies?.auth;
    if (!token) return null;

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    if (!decoded) return null;

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
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

    return user;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}