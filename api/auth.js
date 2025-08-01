// Consolidated authentication API endpoint
import { getUserByEmail, verifyPassword, generateJWT, createUser, authenticateToken, getUserById } from './prisma-utils.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { action } = req.query;

  try {
    switch (action) {
      case 'login':
        return await handleLogin(req, res);
      case 'register':
        return await handleRegister(req, res);
      case 'me':
        return await handleMe(req, res);
      case 'logout':
        return await handleLogout(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
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