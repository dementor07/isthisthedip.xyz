// Vercel serverless function for getting current user
const { authenticateToken, getUserById } = require('../prisma-utils');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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

  } catch (error) {
    console.error('Auth check error:', error);
    return res.status(200).json({ authenticated: false });
  }
}