// Vercel serverless function for leaderboard
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
    // Mock leaderboard data
    const mockData = {
      leaderboard: [
        { rank: 1, symbol: 'BTC', name: 'Bitcoin', score: 85, signal: 'BUY', confidence: 'High', searchCount: 150, lastAnalyzed: new Date() },
        { rank: 2, symbol: 'ETH', name: 'Ethereum', score: 72, signal: 'BUY', confidence: 'High', searchCount: 120, lastAnalyzed: new Date() },
        { rank: 3, symbol: 'SOL', name: 'Solana', score: 68, signal: 'MAYBE', confidence: 'Medium', searchCount: 90, lastAnalyzed: new Date() },
        { rank: 4, symbol: 'ADA', name: 'Cardano', score: 55, signal: 'MAYBE', confidence: 'Medium', searchCount: 75, lastAnalyzed: new Date() },
        { rank: 5, symbol: 'DOGE', name: 'Dogecoin', score: 42, signal: 'WAIT', confidence: 'Low', searchCount: 60, lastAnalyzed: new Date() }
      ],
      metadata: {
        totalCoins: 5,
        topDip: { symbol: 'BTC', score: 85 },
        lastUpdated: new Date()
      }
    };
    
    return res.status(200).json(mockData);
  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: 'Leaderboard failed' });
  }
}