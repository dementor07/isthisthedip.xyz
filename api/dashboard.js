// Vercel serverless function for dashboard
const { authenticateToken, getUserById, getDashboardStats, getRecentAnalyses } = require('./prisma-utils');

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
    // Verify authentication
    const decoded = authenticateToken(req);
    if (!decoded) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get user data
    const user = await getUserById(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get dashboard stats and recent searches
    const [stats, recentSearches] = await Promise.all([
      getDashboardStats(user.id),
      getRecentAnalyses(user.id, 10)
    ]);

    return res.status(200).json({
      user: user,
      stats: stats,
      recentSearches: recentSearches
    });

  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Dashboard failed' });
  }
}