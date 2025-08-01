// Vercel serverless function for health check
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
    return res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'IsThisTheDip.xyz API',
      version: '1.0.0'
    });

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({ error: 'Health check failed' });
  }
}