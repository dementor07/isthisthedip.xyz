// Vercel serverless function for crypto analysis
const { authenticateToken, getUserById, saveAnalysis, updateUserSearches } = require('./prisma-utils');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { crypto } = req.body;
    
    if (!crypto) {
      return res.status(400).json({ error: 'Crypto symbol required' });
    }

    // Get user info (optional - works for both authenticated and anonymous users)
    const decoded = authenticateToken(req);
    let user = null;
    
    if (decoded) {
      user = await getUserById(decoded.id);
      
      // Check daily limits for free users
      if (user && user.tier === 'free') {
        const today = new Date().toISOString().split('T')[0];
        const isNewDay = !user.last_search_date || 
          new Date(user.last_search_date).toISOString().split('T')[0] !== today;
        
        const dailySearches = isNewDay ? 0 : (user.daily_searches || 0);
        
        if (dailySearches >= 10) {
          return res.status(429).json({ 
            error: 'Daily search limit reached. Upgrade for unlimited searches.' 
          });
        }
      }
    }

    // Get client IP for rate limiting
    const clientIP = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    req.connection?.remoteAddress || 
                    '127.0.0.1';

    // Simple mock analysis for now (can be replaced with real API calls)
    const mockScore = Math.floor(Math.random() * 100);
    const signal = mockScore >= 70 ? 'BUY' : mockScore >= 40 ? 'MAYBE' : 'WAIT';
    const confidence = mockScore >= 70 ? 'High' : mockScore >= 40 ? 'Medium' : 'Low';
    
    const analysisResult = {
      crypto: { 
        name: crypto.charAt(0).toUpperCase() + crypto.slice(1).toLowerCase(), 
        symbol: crypto.toUpperCase(),
        price: Math.random() * 50000 + 1000, // Mock price
        change_24h: (Math.random() - 0.5) * 20 // Mock 24h change
      },
      score: mockScore,
      signal: signal,
      confidence: confidence,
      timestamp: new Date().toISOString()
    };

    // Save analysis to database
    if (user) {
      await Promise.all([
        saveAnalysis({
          user_id: user.id,
          crypto_symbol: crypto.toUpperCase(),
          crypto_name: analysisResult.crypto.name,
          score: mockScore,
          signal: signal,
          confidence: confidence,
          price_data: {
            price: analysisResult.crypto.price,
            change_24h: analysisResult.crypto.change_24h
          },
          analysis_data: {
            timestamp: analysisResult.timestamp
          },
          ip_address: clientIP
        }),
        updateUserSearches(user.id)
      ]);
    }
    
    return res.status(200).json(analysisResult);

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: 'Analysis failed' });
  }
}