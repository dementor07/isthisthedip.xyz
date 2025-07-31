const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

// Import modules with error handling
let config, Database, AuthService, PaymentService, CryptoAnalyzer, FastCryptoAnalyzer;

try {
  config = require('./config');
  Database = require('./database');
  AuthService = require('./auth');
  PaymentService = require('./payments');
  CryptoAnalyzer = require('./models');
  FastCryptoAnalyzer = require('./fast-analyzer');
} catch (error) {
  console.error('Failed to import required modules:', error.message);
  console.error('Please ensure all dependencies are installed and files exist');
  process.exit(1);
}

const app = express();
const db = new Database();
const paymentService = new PaymentService();

// Initialize crypto analyzers early to avoid undefined references
let cryptoAnalyzer;
let fastAnalyzer;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://js.stripe.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'", 
        "https://api.stripe.com", 
        "https://api.alternative.me",
        "https://api.coingecko.com",
        "https://www.alphavantage.co",
        "https://api.huggingface.co",
        "https://newsapi.org",
        "wss://localhost:*",
        "ws://localhost:*",
        "http://localhost:*",
        "https://localhost:*"
      ],
      frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
    },
  },
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://isthisthedip.xyz', 'https://www.isthisthedip.xyz']
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'application/webhook+json' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', limiter);

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Authentication routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await AuthService.register(db, email, password);
    
    // Set HTTP-only cookie
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      user: {
        id: result.userId,
        email: result.email,
        tier: result.tier
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await AuthService.login(db, email, password);
    
    // Set HTTP-only cookie
    res.cookie('auth_token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      user: {
        id: result.userId,
        email: result.email,
        tier: result.tier,
        subscriptionExpires: result.subscriptionExpires
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', AuthService.optionalAuth, async (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false });
  }

  try {
    const user = await db.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tier = await AuthService.checkUserTier(db, req.user.userId);
    
    res.json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        tier,
        subscriptionExpires: user.subscription_expires,
        dailySearches: user.daily_searches || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Crypto analysis route
app.post('/api/analyze', AuthService.optionalAuth, async (req, res) => {
  try {
    const { crypto } = req.body;
    
    if (!crypto) {
      return res.status(400).json({ error: 'Cryptocurrency symbol is required' });
    }

    // Get user tier
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    // Check daily limits for free users
    if (userTier === 'free') {
      const limitCheck = await AuthService.checkDailyLimit(db, req.user?.userId, userTier, req.ip);
      
      if (!limitCheck.allowed) {
        return res.status(429).json({
          error: limitCheck.message || 'Daily search limit reached',
          limit: config.RATE_LIMITS.FREE_DAILY_SEARCHES,
          resetTime: limitCheck.resetTime,
          upgrade_url: '/pricing'
        });
      }
    }

    // Perform fast analysis with error handling
    let analysis;
    try {
      analysis = await fastAnalyzer.calculateFastDipScore(crypto, userTier);
    } catch (analysisError) {
      console.error('Analysis error for', crypto, ':', analysisError.message);
      
      // Return a fallback response instead of crashing
      return res.status(200).json({
        score: 50,
        signal: 'WAIT',
        confidence: 'low',
        crypto: { name: crypto, symbol: crypto.toUpperCase(), price: 0 },
        explanation: 'Unable to complete full analysis at this time. Please try again.',
        details: { error: 'Analysis temporarily unavailable' },
        userTier: userTier
      });
    }
    
    // Log search and increment counter
    try {
      if (req.user) {
        await db.incrementUserSearches(req.user.userId);
      }
      
      // Always log the search for tracking (even anonymous users)
      await db.logSearch(
        req.user?.userId || null,
        crypto,
        analysis.score,
        analysis.confidence,
        req.ip
      );
    } catch (logError) {
      console.error('Logging error:', logError.message);
      // Don't fail the request if logging fails
    }

    res.json(analysis);
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ 
      error: error.message || 'Unable to analyze cryptocurrency at this time' 
    });
  }
});

// Payment routes
app.post('/api/create-checkout-session', AuthService.authenticateToken, async (req, res) => {
  try {
    const { tier } = req.body;
    
    if (!['premium', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    const user = await db.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let customerId = user.stripe_customer_id;
    
    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await paymentService.createCustomer(user.email, user.email.split('@')[0]);
      customerId = customer.id;
      
      await db.run(
        'UPDATE users SET stripe_customer_id = ? WHERE id = ?',
        [customerId, user.id]
      );
    }

    const priceId = paymentService.getPriceId(tier);
    const session = await paymentService.createCheckoutSession(
      priceId,
      customerId,
      `${req.headers.origin}/dashboard?success=true`,
      `${req.headers.origin}/pricing?canceled=true`
    );

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout session error:', error);
    res.status(500).json({ error: 'Unable to create checkout session' });
  }
});

app.post('/api/create-portal-session', AuthService.authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.userId);
    if (!user || !user.stripe_customer_id) {
      return res.status(404).json({ error: 'No subscription found' });
    }

    const session = await paymentService.createPortalSession(
      user.stripe_customer_id,
      `${req.headers.origin}/dashboard`
    );

    res.json({ url: session.url });
  } catch (error) {
    console.error('Portal session error:', error);
    res.status(500).json({ error: 'Unable to create portal session' });
  }
});

// Stripe webhook
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = await paymentService.handleWebhook(req.body, sig);
    await paymentService.processWebhookEvent(event, db);
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

// Dashboard data
app.get('/api/dashboard', AuthService.authenticateToken, async (req, res) => {
  try {
    const user = await db.getUserById(req.user.userId);
    const searches = await db.all(
      'SELECT * FROM search_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 20',
      [req.user.userId]
    );

    const today = new Date().toISOString().split('T')[0];
    const dailySearches = searches.filter(s => 
      s.timestamp.startsWith(today)
    ).length;

    res.json({
      user: {
        email: user.email,
        tier: user.subscription_tier,
        subscriptionExpires: user.subscription_expires,
        dailySearches,
        totalSearches: searches.length
      },
      recentSearches: searches.slice(0, 10),
      stats: {
        totalAnalyses: searches.length,
        successfulPredictions: Math.floor(searches.length * 0.73), // Mock success rate
        moneySaved: Math.floor(searches.length * 127.50) // Mock money saved
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Unable to load dashboard data' });
  }
});

// Real-time market data endpoint
app.get('/api/realtime-market', AuthService.optionalAuth, async (req, res) => {
  try {
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    // Get basic market data for all users, enhanced data for premium/pro
    const [fearGreedResponse, globalResponse] = await Promise.all([
      Promise.race([
        fetch('https://api.alternative.me/fng/'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Fear & Greed timeout')), 3000))
      ]).catch(() => null),
      Promise.race([
        fetch('https://api.coingecko.com/api/v3/global'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Global data timeout')), 3000))
      ]).catch(() => null)
    ]);

    let fearGreedData = null;
    let globalData = null;

    if (fearGreedResponse?.ok) {
      fearGreedData = await fearGreedResponse.json();
    }

    if (globalResponse?.ok) {
      globalData = await globalResponse.json();
    }

    const marketData = {
      fearGreed: fearGreedData?.data?.[0]?.value || 50,
      totalMarketCap: globalData?.data?.total_market_cap?.usd || 0,
      totalVolume: globalData?.data?.total_volume?.usd || 0,
      marketCapChange: globalData?.data?.market_cap_change_percentage_24h_usd || 0,
      bitcoinDominance: globalData?.data?.market_cap_percentage?.btc || 50,
      lastUpdate: new Date().toISOString()
    };

    // Add enhanced data for premium/pro users
    if (userTier !== 'free') {
      marketData.enhanced = {
        activeCryptocurrencies: globalData?.data?.active_cryptocurrencies || 0,
        markets: globalData?.data?.markets || 0,
        altcoinIndex: 100 - (globalData?.data?.market_cap_percentage?.btc || 50),
        defiDominance: globalData?.data?.market_cap_percentage?.eth || 20
      };
    }

    res.json(marketData);
  } catch (error) {
    console.error('Real-time market data error:', error);
    res.status(500).json({ 
      error: 'Unable to fetch real-time market data',
      fallback: {
        fearGreed: 50,
        totalMarketCap: 0,
        totalVolume: 0,
        marketCapChange: 0,
        bitcoinDominance: 50,
        lastUpdate: new Date().toISOString()
      }
    });
  }
});

// Live price data endpoint for specific crypto
app.get('/api/live-price/:crypto', AuthService.optionalAuth, async (req, res) => {
  try {
    const { crypto } = req.params;
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    // Rate limit for live price updates
    if (userTier === 'free') {
      // Free users get updates every 30 seconds max
      return res.status(403).json({ 
        error: 'Live price updates require premium subscription',
        upgrade_url: '/pricing'
      });
    }

    const cryptoId = crypto.toLowerCase().replace(/\s+/g, '-');
    const response = await Promise.race([
      fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Price timeout')), 3000))
    ]);

    if (!response.ok) {
      throw new Error(`Price API error: ${response.status}`);
    }

    const priceData = await response.json();
    const cryptoData = priceData[cryptoId];

    if (!cryptoData) {
      return res.status(404).json({ error: 'Cryptocurrency not found' });
    }

    const liveData = {
      symbol: crypto.toUpperCase(),
      price: cryptoData.usd,
      change24h: cryptoData.usd_24h_change || 0,
      volume24h: cryptoData.usd_24h_vol || 0,
      marketCap: cryptoData.usd_market_cap || 0,
      timestamp: new Date().toISOString()
    };

    // Add technical indicators for pro users
    if (userTier === 'pro') {
      liveData.technicalIndicators = {
        rsi: Math.max(10, Math.min(90, 50 + (cryptoData.usd_24h_change || 0) * 2)),
        macd: (cryptoData.usd_24h_change || 0) * 0.1,
        volumeRatio: cryptoData.usd_24h_vol && cryptoData.usd_market_cap 
          ? (cryptoData.usd_24h_vol / cryptoData.usd_market_cap) * 100
          : 0
      };
    }

    res.json(liveData);
  } catch (error) {
    console.error('Live price error:', error);
    res.status(500).json({ error: 'Unable to fetch live price data' });
  }
});

// Market opportunities endpoint for heat map
app.get('/api/market-opportunities', AuthService.optionalAuth, async (req, res) => {
  try {
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    if (userTier === 'free') {
      return res.status(403).json({ 
        error: 'Market opportunities require premium subscription',
        upgrade_url: '/pricing'
      });
    }

    // Fetch top cryptocurrencies for analysis
    const response = await Promise.race([
      fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h,7d'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Market opportunities timeout')), 5000))
    ]);

    if (!response.ok) {
      throw new Error(`Market API error: ${response.status}`);
    }

    const marketData = await response.json();
    
    // Calculate dip scores for each crypto
    const opportunities = marketData.map(crypto => {
      const change24h = crypto.price_change_percentage_24h || 0;
      const change7d = crypto.price_change_percentage_7d || 0;
      const athChangePercentage = crypto.ath_change_percentage || 0;
      
      // Simplified scoring algorithm
      let score = 0;
      if (change24h < -5) score += 25;
      if (change24h < -10) score += 20;
      if (change7d < -15) score += 25;
      if (athChangePercentage < -30) score += 15;
      if (athChangePercentage < -50) score += 15;
      
      return {
        symbol: crypto.symbol.toUpperCase(),
        name: crypto.name,
        score: Math.min(100, score),
        price: crypto.current_price,
        change24h: change24h,
        change7d: change7d,
        marketCap: crypto.market_cap,
        rank: crypto.market_cap_rank
      };
    });

    // Sort by score descending
    opportunities.sort((a, b) => b.score - a.score);

    res.json({
      opportunities: opportunities.slice(0, 20), // Top 20 opportunities
      lastUpdate: new Date().toISOString(),
      totalAnalyzed: marketData.length
    });

  } catch (error) {
    console.error('Market opportunities error:', error);
    res.status(500).json({ error: 'Unable to fetch market opportunities' });
  }
});

// Cache statistics endpoint (for monitoring)
app.get('/api/cache-stats', AuthService.optionalAuth, async (req, res) => {
  try {
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    // Only allow premium/pro users to see detailed cache stats
    if (userTier === 'free') {
      return res.json({
        message: 'Cache is active and optimizing your experience',
        upgrade_url: '/pricing'
      });
    }

    const stats = fastAnalyzer.cache.getStats();
    res.json({
      cacheStats: stats,
      performance: {
        apiCallsSaved: stats.apiCallsSaved,
        estimatedCostSavings: `$${(stats.apiCallsSaved * 0.01).toFixed(2)}`, // Rough estimate
        hitRate: stats.hitRate
      },
      capacity: {
        currentUsage: stats.size,
        maxEntries: 1000, // Rough estimate of memory limit
        cleanupInterval: '2 minutes'
      }
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ error: 'Unable to fetch cache statistics' });
  }
});

// Cache management endpoints (admin only - add auth as needed)
app.post('/api/cache/clear', (req, res) => {
  try {
    const cleared = fastAnalyzer.cache.clear();
    res.json({ 
      success: true, 
      message: `Cleared ${cleared} cache entries`,
      cleared 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

app.post('/api/cache/invalidate/:type', (req, res) => {
  try {
    const { type } = req.params;
    const deleted = fastAnalyzer.cache.invalidateByType(type);
    res.json({ 
      success: true, 
      message: `Invalidated ${deleted} entries of type ${type}`,
      deleted 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to invalidate cache' });
  }
});

// Sentiment analysis statistics endpoint
app.get('/api/sentiment-stats', AuthService.optionalAuth, async (req, res) => {
  try {
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    if (userTier === 'free') {
      return res.json({
        message: 'Professional sentiment analysis available with Premium upgrade',
        features: [
          'Real-time news sentiment analysis',
          'FinBERT AI model for financial text analysis',
          'Recent news headlines with sentiment scores',
          'Market emotion indicators',
          'HuggingFace + News API integration'
        ],
        upgrade_url: '/pricing'
      });
    }

    const sentimentStats = fastAnalyzer.sentimentAnalyzer.getCallStats();
    res.json({
      hugging_face: {
        dailyCalls: sentimentStats.dailyCalls,
        remaining: sentimentStats.remaining,
        maxDaily: sentimentStats.maxDailyCalls,
        hasApiKey: sentimentStats.hasApiKey
      },
      news_api: {
        hasApiKey: sentimentStats.hasNewsApiKey
      },
      features: {
        sentiment: 'AI-powered financial sentiment analysis using FinBERT',
        news: 'Recent news headlines with sentiment classification',
        scoring: 'Contrarian scoring - negative news = buy opportunity'
      },
      weighting: {
        price: '70%',
        market: '20%', 
        sentiment: '10%'
      },
      performance: {
        cacheEnabled: true,
        dataSource: 'HuggingFace FinBERT + News API'
      }
    });
  } catch (error) {
    console.error('Sentiment stats error:', error);
    res.status(500).json({ error: 'Unable to fetch sentiment statistics' });
  }
});

// Real-time price streaming endpoint
app.get('/api/realtime/price/:crypto', AuthService.optionalAuth, async (req, res) => {
  try {
    const { crypto } = req.params;
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    if (userTier === 'free') {
      return res.status(403).json({ 
        error: 'Real-time price streaming requires premium subscription',
        features: [
          'Live WebSocket price updates',
          'Real-time technical indicators',
          '5-minute intraday analysis',
          'Trading signals and alerts'
        ],
        upgrade_url: '/pricing'
      });
    }

    // Get current price and start streaming if not already active
    const currentPrice = fastAnalyzer.realTimeStreamer.getCurrentPrice(crypto);
    const isConnected = fastAnalyzer.realTimeStreamer.connections.has(crypto.toLowerCase());
    
    // Start streaming for this crypto
    if (!isConnected) {
      fastAnalyzer.realTimeStreamer.subscribe(crypto, () => {}); // Empty callback for now
    }

    const status = fastAnalyzer.realTimeStreamer.getStatus();
    
    res.json({
      crypto: crypto.toUpperCase(),
      currentPrice,
      streaming: isConnected,
      status: status[crypto.toLowerCase()] || null,
      websocket_url: `/api/realtime/ws/${crypto}`,
      message: 'Real-time streaming initiated'
    });

  } catch (error) {
    console.error('Real-time price error:', error);
    res.status(500).json({ error: 'Unable to initiate real-time streaming' });
  }
});

// Real-time technical indicators endpoint
app.get('/api/realtime/technicals/:crypto', AuthService.optionalAuth, async (req, res) => {
  try {
    const { crypto } = req.params;
    const { interval = '5m' } = req.query;
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    if (userTier !== 'pro') {
      return res.status(403).json({ 
        error: 'Real-time technical analysis requires Pro subscription',
        available_intervals: ['1s', '5s', '15s', '1m', '5m', '15m', '1h'],
        features: [
          'Live RSI, MACD, SMA calculations',
          'Bollinger Bands and Stochastic',
          'Real-time trend analysis',
          'Support/Resistance levels',
          'Trading signal generation'
        ],
        upgrade_url: '/pricing'
      });
    }

    const technicals = fastAnalyzer.realTimeTechnical.getTechnicalSnapshot(crypto, interval);
    const signals = fastAnalyzer.realTimeTechnical.generateTradingSignals(crypto, interval);
    
    if (!technicals) {
      return res.json({
        crypto: crypto.toUpperCase(),
        interval,
        status: 'initializing',
        message: 'Real-time technical analysis is building data history...',
        estimated_ready: '2-5 minutes'
      });
    }

    res.json({
      crypto: crypto.toUpperCase(),
      interval,
      technicals,
      signals,
      timestamp: Date.now(),
      status: 'active'
    });

  } catch (error) {
    console.error('Real-time technical error:', error);
    res.status(500).json({ error: 'Unable to fetch real-time technical data' });
  }
});

// Real-time status endpoint
app.get('/api/realtime/status', AuthService.optionalAuth, async (req, res) => {
  try {
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    if (userTier === 'free') {
      return res.json({
        message: 'Real-time features available with Premium/Pro upgrade',
        tier: 'free',
        upgrade_url: '/pricing'
      });
    }

    const streamerStatus = fastAnalyzer.realTimeStreamer.getStatus();
    const technicalStatus = fastAnalyzer.realTimeTechnical.getStatus();
    
    res.json({
      tier: userTier,
      streaming: {
        active_connections: Object.keys(streamerStatus).length,
        symbols: streamerStatus
      },
      technicals: {
        active_analysis: Object.keys(technicalStatus).length,
        symbols: technicalStatus
      },
      capabilities: {
        price_streaming: userTier === 'premium' || userTier === 'pro',
        technical_analysis: userTier === 'pro',
        real_time_signals: userTier === 'pro'
      }
    });

  } catch (error) {
    console.error('Real-time status error:', error);
    res.status(500).json({ error: 'Unable to fetch real-time status' });
  }
});

// WebSocket endpoint for real-time streaming
app.get('/api/realtime/ws/:crypto', AuthService.optionalAuth, async (req, res) => {
  try {
    const { crypto } = req.params;
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    if (userTier === 'free') {
      return res.status(403).json({ 
        error: 'Real-time WebSocket requires premium subscription' 
      });
    }

    // Return WebSocket connection info
    res.json({
      websocket_url: `ws://localhost:${config.PORT}`,
      symbol: crypto,
      protocol: 'ws',
      instructions: 'Connect to WebSocket and send {"type":"subscribe","symbol":"' + crypto + '"}',
      status: 'ready'
    });
  } catch (error) {
    console.error('WebSocket endpoint error:', error);
    res.status(500).json({ error: 'WebSocket endpoint error' });
  }
});

// Technical analysis statistics endpoint  
app.get('/api/technical-stats', AuthService.optionalAuth, async (req, res) => {
  try {
    const userTier = req.user 
      ? await AuthService.checkUserTier(db, req.user.userId)
      : 'free';

    if (userTier === 'free') {
      return res.json({
        message: 'Professional technical analysis available with Premium upgrade',
        features: [
          'Real RSI (Relative Strength Index)',
          'MACD (Moving Average Convergence Divergence)', 
          'Moving Averages (SMA 20)',
          'Professional trading signals',
          'Alpha Vantage data source'
        ],
        upgrade_url: '/pricing'
      });
    }

    const technicalStats = fastAnalyzer.technicalIndicators.getCallStats();
    res.json({
      alpha_vantage: {
        dailyCalls: technicalStats.dailyCalls,
        remaining: technicalStats.remaining,
        maxDaily: technicalStats.maxDailyCalls,
        hasApiKey: technicalStats.hasApiKey
      },
      features: {
        rsi: 'Relative Strength Index - Oversold/Overbought detection',
        macd: 'MACD - Trend momentum and crossover signals',
        sma: 'Simple Moving Average - Price trend analysis'
      },
      performance: {
        cacheEnabled: true,
        dataSource: 'Alpha Vantage Professional'
      }
    });
  } catch (error) {
    console.error('Technical stats error:', error);
    res.status(500).json({ error: 'Unable to fetch technical statistics' });
  }
});

// Static file serving
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'pricing.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'signup.html'));
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'chat.html'));
});

// Chat API endpoints
app.get('/api/chat/messages', AuthService.optionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const messages = await db.all(`
      SELECT cm.*, u.email, u.subscription_tier, u.is_admin
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.is_deleted = 0
      ORDER BY cm.timestamp DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    // Reverse to show oldest first
    res.json(messages.reverse());
  } catch (error) {
    console.error('Chat messages error:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

app.post('/api/chat/message', AuthService.authenticateToken, async (req, res) => {
  try {
    const { message, parent_id } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }
    
    if (message.length > 1000) {
      return res.status(400).json({ error: 'Message too long (max 1000 characters)' });
    }
    
    const user = await db.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const result = await db.run(`
      INSERT INTO chat_messages (user_id, username, user_tier, message, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `, [
      user.id,
      user.email.split('@')[0], // Use email prefix as username
      user.subscription_tier,
      message.trim(),
      parent_id || null
    ]);
    
    // Get the created message with user info
    const newMessage = await db.get(`
      SELECT cm.*, u.email, u.subscription_tier, u.is_admin
      FROM chat_messages cm
      LEFT JOIN users u ON cm.user_id = u.id
      WHERE cm.id = ?
    `, [result.id]);
    
    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

app.delete('/api/chat/message/:id', AuthService.authenticateToken, async (req, res) => {
  try {
    const messageId = parseInt(req.params.id);
    const user = await db.getUserById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const message = await db.get('SELECT * FROM chat_messages WHERE id = ?', [messageId]);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Only allow admins or message owner to delete
    if (!user.is_admin && message.user_id !== user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this message' });
    }
    
    await db.run(`
      UPDATE chat_messages 
      SET is_deleted = 1, deleted_by = ? 
      WHERE id = ?
    `, [user.id, messageId]);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

app.get('/api/chat/stats', AuthService.optionalAuth, async (req, res) => {
  try {
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT user_id) as active_users,
        MAX(timestamp) as last_message
      FROM chat_messages 
      WHERE is_deleted = 0
    `);
    
    res.json(stats);
  } catch (error) {
    console.error('Chat stats error:', error);
    res.status(500).json({ error: 'Failed to load chat stats' });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Leaderboard endpoint - shows all analyzed coins ranked by dip score
app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50; // Default to top 50
    const timeframe = req.query.timeframe || '24h'; // 24h, 7d, 30d
    
    let timeFilter = '';
    const now = new Date();
    
    switch(timeframe) {
      case '24h':
        timeFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
        break;
      case '7d':
        timeFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '30d':
        timeFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      default:
        timeFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    }

    // Get unique cryptocurrencies with their best scores from recent searches
    const leaderboardData = await db.all(`
      SELECT 
        crypto_symbol,
        MAX(score) as best_score,
        MAX(confidence) as confidence,
        COUNT(*) as search_count,
        MAX(timestamp) as last_analyzed
      FROM search_logs 
      WHERE timestamp > ?
      GROUP BY LOWER(crypto_symbol)
      ORDER BY best_score DESC, search_count DESC
      LIMIT ?
    `, [timeFilter, limit]);

    const leaderboard = leaderboardData || [];
    
    // Add rankings and format data
    const formattedLeaderboard = leaderboard.map((coin, index) => ({
      rank: index + 1,
      symbol: coin.crypto_symbol.toUpperCase(),
      name: coin.crypto_symbol.charAt(0).toUpperCase() + coin.crypto_symbol.slice(1),
      score: coin.best_score,
      confidence: coin.confidence,
      searchCount: coin.search_count,
      lastAnalyzed: coin.last_analyzed,
      signal: coin.best_score >= 70 ? 'BUY' : coin.best_score >= 40 ? 'MAYBE' : 'WAIT',
      signalColor: coin.best_score >= 70 ? 'green' : coin.best_score >= 40 ? 'yellow' : 'red'
    }));

    res.json({
      leaderboard: formattedLeaderboard,
      metadata: {
        timeframe,
        totalCoins: formattedLeaderboard.length,
        lastUpdated: new Date().toISOString(),
        topDip: formattedLeaderboard[0] || null
      }
    });

  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Unable to fetch leaderboard data' });
  }
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.status(204).send(); // No content response for favicon
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await db.connect();
    
    // Initialize analyzers after database connection
    cryptoAnalyzer = new CryptoAnalyzer(db);
    fastAnalyzer = new FastCryptoAnalyzer(db);
    
    // Create HTTP server
    const server = http.createServer(app);
    
    // Create WebSocket server
    const wss = new WebSocket.Server({ server });
    
    // WebSocket connection handling
    wss.on('connection', (ws, req) => {
      console.log('New WebSocket connection');
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'subscribe' && data.symbol) {
            // Subscribe to real-time updates for this symbol
            console.log(`WebSocket client subscribed to ${data.symbol}`);
            ws.symbol = data.symbol;
            
            // Send periodic updates (mock for now)
            const interval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'price_update',
                  symbol: data.symbol,
                  price: Math.random() * 50000 + 30000, // Mock price
                  timestamp: new Date().toISOString()
                }));
              } else {
                clearInterval(interval);
              }
            }, 5000);
            
            ws.interval = interval;
          }
        } catch (error) {
          console.error('WebSocket message error:', error);
        }
      });
      
      ws.on('close', () => {
        console.log('WebSocket connection closed');
        if (ws.interval) {
          clearInterval(ws.interval);
        }
      });
    });
    
    server.listen(config.PORT, () => {
      console.log(`Server running on port ${config.PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`WebSocket server ready at ws://localhost:${config.PORT}`);
      
      // Preload popular cryptocurrencies after server starts
      setTimeout(async () => {
        console.log('🚀 Preloading popular cryptocurrencies for faster searches...');
        const popularCryptos = ['bitcoin', 'ethereum', 'solana', 'cardano', 'dogecoin'];
        
        for (const crypto of popularCryptos) {
          try {
            // Preload in background without blocking
            cryptoAnalyzer.analyze(crypto, 'pro').catch(() => {
              // Ignore preload errors - they're non-critical
            });
            
            // Small delay to avoid overwhelming APIs
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            // Ignore preload errors
          }
        }
        
        console.log('✅ Popular crypto preloading completed - searches will be faster!');
      }, 5000); // Start preloading 5 seconds after server starts
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Production optimizations
if (process.env.NODE_ENV === 'production') {
  // Trust proxy for rate limiting behind nginx
  app.set('trust proxy', 1);
  
  // More aggressive rate limiting in production
  const productionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 50, // Stricter limit
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });
  
  app.use('/api', productionLimiter);
}

// Graceful shutdown with cleanup
async function gracefulShutdown(signal) {
  console.log(`Received ${signal}, shutting down gracefully...`);
  
  try {
    // Close real-time connections
    if (fastAnalyzer && fastAnalyzer.realTimeStreamer) {
      fastAnalyzer.realTimeStreamer.disconnect();
      console.log('Real-time connections closed');
    }
    
    // Close database connection
    if (db) {
      await db.close();
      console.log('Database connection closed');
    }
    
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

startServer();