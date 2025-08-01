// Vercel serverless function for leaderboard
const { getLeaderboard } = require('./prisma-utils');

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
    const { timeframe = '24h', limit = 50 } = req.query;
    
    // Get leaderboard data from database
    const leaderboard = await getLeaderboard(timeframe, parseInt(limit));
    
    const metadata = {
      totalCoins: leaderboard.length,
      topDip: leaderboard.length > 0 ? { 
        symbol: leaderboard[0].symbol, 
        score: leaderboard[0].score 
      } : null,
      lastUpdated: new Date()
    };

    return res.status(200).json({
      leaderboard: leaderboard,
      metadata: metadata
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: 'Leaderboard failed' });
  }
}