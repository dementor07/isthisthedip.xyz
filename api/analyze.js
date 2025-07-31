// Vercel serverless function for crypto analysis
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    // Simple mock analysis
    const mockScore = Math.floor(Math.random() * 100);
    const signal = mockScore >= 70 ? 'BUY' : mockScore >= 40 ? 'MAYBE' : 'WAIT';
    
    return res.status(200).json({
      crypto: { name: crypto, symbol: crypto.toUpperCase() },
      score: mockScore,
      signal: signal,
      confidence: 'Medium',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ error: 'Analysis failed' });
  }
}