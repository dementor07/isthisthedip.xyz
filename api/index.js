// Serverless entry point for Vercel
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();

// Basic middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://isthisthedip.xyz', 'https://www.isthisthedip.xyz']
    : true,
  credentials: true
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests' }
});

app.use('/api', limiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Simple analyze endpoint (without heavy dependencies)
app.post('/api/analyze', async (req, res) => {
  try {
    const { crypto } = req.body;
    
    if (!crypto) {
      return res.status(400).json({ error: 'Crypto symbol required' });
    }

    // Simple mock analysis for now (replace with actual logic later)
    const mockScore = Math.floor(Math.random() * 100);
    const signal = mockScore >= 70 ? 'BUY' : mockScore >= 40 ? 'MAYBE' : 'WAIT';
    
    res.json({
      crypto: { name: crypto, symbol: crypto.toUpperCase() },
      score: mockScore,
      signal: signal,
      confidence: 'Medium',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Simple leaderboard endpoint
app.get('/api/leaderboard', async (req, res) => {
  try {
    // Mock leaderboard data
    const mockData = {
      leaderboard: [
        { rank: 1, symbol: 'BTC', name: 'Bitcoin', score: 85, signal: 'BUY', confidence: 'High', searchCount: 150, lastAnalyzed: new Date() },
        { rank: 2, symbol: 'ETH', name: 'Ethereum', score: 72, signal: 'BUY', confidence: 'High', searchCount: 120, lastAnalyzed: new Date() },
        { rank: 3, symbol: 'SOL', name: 'Solana', score: 68, signal: 'MAYBE', confidence: 'Medium', searchCount: 90, lastAnalyzed: new Date() }
      ],
      metadata: {
        totalCoins: 3,
        topDip: { symbol: 'BTC', score: 85 },
        lastUpdated: new Date()
      }
    };
    
    res.json(mockData);
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Leaderboard failed' });
  }
});

// Dashboard endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const mockData = {
      user: { tier: 'free', dailySearches: 3 },
      stats: { totalAnalyses: 0, dailySearches: 0, successfulPredictions: 0, moneySaved: 0 },
      recentSearches: []
    };
    
    res.json(mockData);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Dashboard failed' });
  }
});

// Auth endpoints (mock)
app.post('/api/auth/register', (req, res) => {
  res.json({ message: 'Registration temporarily disabled' });
});

app.post('/api/auth/login', (req, res) => {
  res.json({ message: 'Login temporarily disabled' });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: null });
});

// Handle specific routes
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('/leaderboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'leaderboard.html'));
});

// Serve static files for non-API routes
app.get('*', (req, res) => {
  let filePath;
  if (req.path === '/') {
    filePath = path.join(__dirname, '..', 'public', 'index.html');
  } else if (req.path.startsWith('/js/')) {
    filePath = path.join(__dirname, '..', 'public', req.path);
  } else {
    filePath = path.join(__dirname, '..', 'public', req.path);
  }
  
  res.sendFile(filePath, (err) => {
    if (err) {
      // Fallback to index.html for SPA routing
      res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    }
  });
});

module.exports = app;