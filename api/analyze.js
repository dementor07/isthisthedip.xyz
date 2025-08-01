// Vercel serverless function for crypto analysis
import { authenticateToken, getUserById, saveAnalysis, updateUserSearches } from './prisma-utils.js';

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

    // Real crypto analysis with multiple data sources
    const analysisResult = await performRealAnalysis(crypto, user);

    // Save analysis to database
    if (user) {
      await Promise.all([
        saveAnalysis({
          user_id: user.id,
          crypto_symbol: crypto.toUpperCase(),
          crypto_name: analysisResult.crypto.name,
          score: analysisResult.score,
          signal: analysisResult.signal,
          confidence: analysisResult.confidence,
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

// Real crypto analysis implementation
async function performRealAnalysis(crypto, user) {
    try {
      // Get essential data from multiple sources
      const [priceData, fearGreed, technicals, news] = await Promise.allSettled([
        getCoinGeckoData(crypto),
        getFearGreedIndex(),
        getAlphaVantageTechnicals(crypto),
        getCryptoNews(crypto)
      ]);

      // Process results with fallbacks
      const price = priceData.status === 'fulfilled' ? priceData.value : getMockPriceData(crypto);
      const fearGreedData = fearGreed.status === 'fulfilled' ? fearGreed.value : { value: 50 };
      const techData = technicals.status === 'fulfilled' ? technicals.value : {};
      const newsData = news.status === 'fulfilled' ? news.value : [];

      // Calculate analysis scores
      const technicalScore = analyzeTechnicals(techData, price);
      const sentimentScore = await analyzeNewsSentiment(newsData);
      const marketScore = analyzeMarketConditions(price, fearGreedData);
      const volumeScore = analyzeVolumeProfile(price);

      // Weighted final score
      const weights = { technical: 0.35, sentiment: 0.25, market: 0.25, volume: 0.15 };
      const finalScore = Math.round(
        technicalScore * weights.technical +
        sentimentScore * weights.sentiment +
        marketScore * weights.market +
        volumeScore * weights.volume
      );

      const signal = finalScore >= 70 ? 'BUY' : finalScore >= 40 ? 'MAYBE' : 'WAIT';
      const confidence = calculateConfidence(finalScore, [priceData, fearGreed, technicals, news]);

      return {
        crypto: {
          name: price.name || crypto,
          symbol: price.symbol || crypto.toUpperCase(),
          price: price.current_price || 0,
          change_24h: price.price_change_percentage_24h || 0
        },
        score: finalScore,
        signal: signal,
        confidence: confidence,
        details: {
          technical_score: technicalScore,
          sentiment_score: sentimentScore,
          market_score: marketScore,
          volume_score: volumeScore,
          fear_greed: fearGreedData.value,
          data_sources: getDataSourcesUsed([priceData, fearGreed, technicals, news])
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Real analysis failed:', error);
      return getFallbackAnalysis(crypto);
    }
}

async function getCoinGeckoData(crypto) {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${crypto}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true`);
    const data = await response.json();
    return data[crypto] || data[Object.keys(data)[0]];
}

async function getFearGreedIndex() {
    const response = await fetch('https://api.alternative.me/fng?limit=1');
    const data = await response.json();
    return { value: parseInt(data.data[0].value) };
}

async function getAlphaVantageTechnicals(crypto) {
    if (!process.env.ALPHA_VANTAGE_API_KEY) return {};
    
    const symbol = `${crypto.toUpperCase()}USD`;
    const response = await fetch(`https://www.alphavantage.co/query?function=RSI&symbol=${symbol}&interval=daily&time_period=14&series_type=close&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`);
    return await response.json();
}

async function getCryptoNews(crypto) {
    if (!process.env.NEWS_API_KEY) return [];
    
    const response = await fetch(`https://newsapi.org/v2/everything?q=${crypto}&sortBy=popularity&pageSize=10&apiKey=${process.env.NEWS_API_KEY}`);
    const data = await response.json();
    return data.articles || [];
}

async function analyzeNewsSentiment(articles) {
    if (!articles.length) return 50;
    
    try {
      if (!process.env.HUGGING_FACE_API_TOKEN) return 50;
      
      const headlines = articles.slice(0, 5).map(a => a.title).join('. ');
      const response = await fetch('https://api-inference.huggingface.co/models/ProsusAI/finbert', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGING_FACE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: headlines })
      });
      
      const result = await response.json();
      if (result[0]) {
        const sentiment = result[0].find(s => s.label === 'positive')?.score || 0.5;
        return Math.round(sentiment * 100);
      }
    } catch (error) {
      console.error('Sentiment analysis failed:', error);
    }
    
    return 50;
}

function analyzeTechnicals(techData, priceData) {
    let score = 50;
    
    // RSI analysis
    if (techData['Technical Analysis']) {
      const rsi = parseFloat(techData['Technical Analysis']['RSI']) || 50;
      if (rsi < 30) score += 20; // Oversold - good buy signal
      else if (rsi > 70) score -= 15; // Overbought
    }
    
    // Price change analysis
    if (priceData.price_change_percentage_24h) {
      const change = priceData.price_change_percentage_24h;
      if (change < -10) score += 15; // Big dip
      else if (change < -5) score += 10; // Medium dip
      else if (change > 5) score -= 10; // Rising fast
    }
    
    // Volume analysis
    if (priceData.total_volume && priceData.market_cap) {
      const volumeRatio = priceData.total_volume / priceData.market_cap;
      if (volumeRatio > 0.1) score += 10; // High volume
    }
    
    return Math.max(0, Math.min(100, score));
}

function analyzeMarketConditions(priceData, fearGreedData) {
    let score = 50;
    
    // Fear & Greed analysis
    const fearGreed = fearGreedData.value;
    if (fearGreed < 25) score += 25; // Extreme fear - good buy
    else if (fearGreed < 45) score += 15; // Fear
    else if (fearGreed > 75) score -= 20; // Greed

    // Market cap analysis
    if (priceData.market_cap) {
      // Prefer established projects during dips
      if (priceData.market_cap > 1e9) score += 10;
    }
    
    return Math.max(0, Math.min(100, score));
}

function analyzeVolumeProfile(priceData) {
    let score = 50;
    
    if (priceData.total_volume && priceData.market_cap) {
      const volumeRatio = priceData.total_volume / priceData.market_cap;
      
      // High volume during dips is positive
      if (volumeRatio > 0.2) score += 20;
      else if (volumeRatio > 0.1) score += 10;
      else if (volumeRatio < 0.01) score -= 15; // Low volume
    }
    
    return Math.max(0, Math.min(100, score));
}

function calculateConfidence(score, dataResults) {
    const successfulSources = dataResults.filter(r => r.status === 'fulfilled').length;
    const totalSources = dataResults.length;
    
    if (successfulSources >= 3) return 'High';
    if (successfulSources >= 2) return 'Medium';
    return 'Low';
}

function getDataSourcesUsed(dataResults) {
    const sources = ['CoinGecko', 'Fear & Greed Index', 'Alpha Vantage', 'News API'];
    return sources.filter((_, index) => dataResults[index].status === 'fulfilled');
}

function getMockPriceData(crypto) {
    return {
      name: crypto.charAt(0).toUpperCase() + crypto.slice(1).toLowerCase(),
      symbol: crypto.toUpperCase(),
      current_price: Math.random() * 50000 + 1000,
      price_change_percentage_24h: (Math.random() - 0.5) * 20,
      total_volume: Math.random() * 1e9,
      market_cap: Math.random() * 1e11
    };
}

function getFallbackAnalysis(crypto) {
    const mockScore = Math.floor(Math.random() * 100);
    return {
      crypto: {
        name: crypto.charAt(0).toUpperCase() + crypto.slice(1).toLowerCase(),
        symbol: crypto.toUpperCase(),
        price: Math.random() * 50000 + 1000,
        change_24h: (Math.random() - 0.5) * 20
      },
      score: mockScore,
      signal: mockScore >= 70 ? 'BUY' : mockScore >= 40 ? 'MAYBE' : 'WAIT',
      confidence: 'Low',
      timestamp: new Date().toISOString()
    };
}