// Vercel serverless function for dashboard
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
    const mockData = {
      user: { 
        tier: 'free', 
        dailySearches: 3,
        email: 'demo@example.com',
        subscriptionExpires: null
      },
      stats: { 
        totalAnalyses: 15, 
        dailySearches: 3, 
        successfulPredictions: 8, 
        moneySaved: 1200 
      },
      recentSearches: [
        {
          crypto_symbol: 'BTC',
          score: 85,
          signal: 'BUY',
          confidence: 'High',
          timestamp: new Date()
        },
        {
          crypto_symbol: 'ETH', 
          score: 72,
          signal: 'BUY',
          confidence: 'Medium',
          timestamp: new Date(Date.now() - 3600000)
        }
      ]
    };
    
    return res.status(200).json(mockData);
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ error: 'Dashboard failed' });
  }
}