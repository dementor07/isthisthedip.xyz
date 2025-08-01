// Consolidated authentication API endpoint
import { PrismaClient } from '@prisma/client';
import { getUserByEmail, verifyPassword, generateJWT, createUser, authenticateToken, getUserById } from './prisma-utils.js';

// Global PrismaClient instance for serverless functions
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = globalThis.prisma || new PrismaClient();
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

  const { action } = req.query;

  try {
    // Ensure database connection for chat functions
    if ((action === 'chat-messages' || action === 'chat-message' || action === 'chat-stats' || action === 'chat-delete') && !prisma) {
      console.error('Prisma client not initialized for chat function');
      return res.status(500).json({ error: 'Database connection failed' });
    }
    switch (action) {
      case 'login':
        return await handleLogin(req, res);
      case 'register':
        return await handleRegister(req, res);
      case 'me':
        return await handleMe(req, res);
      case 'logout':
        return await handleLogout(req, res);
      case 'chat-message':
        return await handleChatMessage(req, res);
      case 'chat-messages':
        return await handleChatMessages(req, res);
      case 'chat-stats':
        return await handleChatStats(req, res);
      case 'chat-delete':
        return await handleChatDelete(req, res);
      case 'health':
        return res.status(200).json({ 
          status: 'OK', 
          timestamp: new Date().toISOString(),
          prisma: !!prisma,
          env: process.env.NODE_ENV,
          hasPostgresUrl: !!process.env.POSTGRES_URL
        });
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    return res.status(500).json({ 
      error: 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Get user from database
  const user = await getUserByEmail(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Verify password
  const isValidPassword = await verifyPassword(password, user.passwordHash);
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Generate JWT token
  const token = generateJWT(user);

  // Set JWT cookie
  res.setHeader('Set-Cookie', `auth=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  
  // Return user data (without password hash)
  const { passwordHash, ...userResponse } = user;
  
  return res.status(200).json({
    success: true,
    user: userResponse
  });
}

async function handleRegister(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    // Create user in database
    const user = await createUser(email, password);

    // Generate JWT token
    const token = generateJWT(user);

    // Set JWT cookie
    res.setHeader('Set-Cookie', `auth=${token}; HttpOnly; Path=/; Max-Age=604800; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    
    return res.status(200).json({
      success: true,
      user: user
    });
  } catch (error) {
    if (error.message === 'Email already exists') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    throw error;
  }
}

async function handleMe(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify JWT token
  const decoded = authenticateToken(req);
  
  if (!decoded) {        
    return res.status(200).json({ authenticated: false });
  }

  // Get fresh user data from database
  const user = await getUserById(decoded.id);
  
  if (!user) {
    return res.status(200).json({ authenticated: false });
  }

  return res.status(200).json({
    authenticated: true,
    user: user
  });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear auth cookie
  res.setHeader('Set-Cookie', 'auth=; HttpOnly; Path=/; Max-Age=0');
  
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
}

async function handleChatMessages(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 50 } = req.query;
    const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 messages
    
    console.log('Fetching chat messages with limit:', limitNum);
    
    // Test database connection first
    await prisma.$connect();
    
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
        createdAt: true
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
      timestamp: msg.createdAt.toISOString()
    }));

    return res.status(200).json({
      success: true,
      messages: formattedMessages
    });

  } catch (error) {
    console.error('Error fetching chat messages:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    
    // Return fallback data if database fails
    return res.status(200).json({
      success: true,
      messages: [
        {
          id: 1,
          message: "Chat system is initializing... Please refresh in a moment.",
          username: "System",
          userTier: "admin",
          likes: 0,
          timestamp: new Date().toISOString()
        }
      ]
    });
  }
}

async function handleChatMessage(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }

    // Get user details
    const user = await getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
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
        createdAt: true
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
        timestamp: newMessage.createdAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Error posting chat message:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack?.substring(0, 500)
    });
    return res.status(500).json({ 
      error: 'Failed to post message',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

async function handleChatStats(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get total message count
    const totalMessages = await prisma.chatMessage.count({
      where: {
        isDeleted: false
      }
    });

    // Get unique users who have posted messages
    const activeUsers = await prisma.chatMessage.findMany({
      where: {
        isDeleted: false
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    // Get messages from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messagesLast24h = await prisma.chatMessage.count({
      where: {
        isDeleted: false,
        createdAt: {
          gte: yesterday
        }
      }
    });

    const stats = {
      totalMessages,
      activeUsers: activeUsers.length,
      onlineNow: Math.max(1, Math.floor(activeUsers.length * 0.3)), // Estimate
      messagesLast24h
    };

    return res.status(200).json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('Error fetching chat stats:', error);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}

async function handleChatDelete(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // Get user details
    const user = await getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if message exists and get its details
    const existingMessage = await prisma.chatMessage.findUnique({
      where: {
        id: parseInt(messageId)
      },
      select: {
        id: true,
        userId: true,
        isDeleted: true
      }
    });

    if (!existingMessage || existingMessage.isDeleted) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Check if user owns the message or is admin
    const isAdmin = user.email && user.email.includes('admin');
    const isOwner = existingMessage.userId === user.id;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Soft delete the message
    await prisma.chatMessage.update({
      where: {
        id: parseInt(messageId)
      },
      data: {
        isDeleted: true
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting chat message:', error);
    return res.status(500).json({ error: 'Failed to delete message' });
  }
}