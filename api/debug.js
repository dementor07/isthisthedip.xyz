// Debug endpoint to check API status
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
    const debugInfo = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database_url_configured: !!process.env.POSTGRES_URL,
      prisma_url_configured: !!process.env.PRISMA_DATABASE_URL,
      jwt_secret_configured: !!process.env.JWT_SECRET,
      api_status: 'online',
      vercel_deployment: !!process.env.VERCEL,
      request_info: {
        method: req.method,
        url: req.url,
        headers: Object.keys(req.headers)
      }
    };

    return res.status(200).json(debugInfo);
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return res.status(500).json({ 
      error: 'Debug failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}