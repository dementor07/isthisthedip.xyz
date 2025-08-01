// Vercel serverless function for comprehensive crypto leaderboard
import { getLeaderboard } from './prisma-utils.js';

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
    const { timeframe = '24h', limit = 100, source = 'live' } = req.query;
    
    let leaderboard;
    
    if (source === 'analyzed') {
      // Get analyzed coins from database (original functionality)
      leaderboard = await getLeaderboard(timeframe, parseInt(limit));
    } else {
      // Get live market data for top cryptocurrencies
      leaderboard = await getLiveMarketLeaderboard(parseInt(limit));
    }
    
    const metadata = {
      source: source,
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

async function getLiveMarketLeaderboard(limit = 100) {
  try {
    // Fetch top cryptocurrencies by market cap
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false&price_change_percentage=1h,24h,7d`);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    
    const coins = await response.json();
    
    // Get Fear & Greed Index for analysis
    const fearGreedData = await getFearGreedIndex();
    
    // Analyze each coin and generate dip scores
    const analyzedCoins = coins.map((coin, index) => {
      const dipScore = calculateDipScore(coin, fearGreedData);
      
      return {
        rank: index + 1,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        score: dipScore.score,
        signal: dipScore.signal,
        confidence: dipScore.confidence,
        price: coin.current_price,
        priceChange24h: coin.price_change_percentage_24h || 0,
        priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
        marketCap: coin.market_cap,
        volume24h: coin.total_volume,
        lastAnalyzed: new Date(),
        marketCapRank: coin.market_cap_rank,
        // Additional metrics for better analysis
        ath: coin.ath,
        athChangePercentage: coin.ath_change_percentage,
        atl: coin.atl,
        atlChangePercentage: coin.atl_change_percentage,
        circulating_supply: coin.circulating_supply,
        max_supply: coin.max_supply
      };
    });
    
    // Sort by dip score (highest scores are best buying opportunities)
    return analyzedCoins.sort((a, b) => b.score - a.score);
    
  } catch (error) {
    console.error('Error fetching live market data:', error);
    return [];
  }
}

async function getFearGreedIndex() {
  try {
    const response = await fetch('https://api.alternative.me/fng/');
    if (!response.ok) return { value: 50 };
    const data = await response.json();
    return { value: parseInt(data.data[0].value) };
  } catch (error) {
    console.error('Error fetching Fear & Greed:', error);
    return { value: 50 };
  }
}

function calculateDipScore(coin, fearGreedData) {
  let score = 0;
  
  // Price decline analysis (higher weight for bigger dips)
  const change24h = coin.price_change_percentage_24h || 0;
  const change7d = coin.price_change_percentage_7d_in_currency || 0;
  
  // 24h price change scoring (0-40 points)
  if (change24h < -10) score += 40;
  else if (change24h < -7) score += 35;
  else if (change24h < -5) score += 30;
  else if (change24h < -3) score += 25;
  else if (change24h < -1) score += 20;
  else if (change24h < 0) score += 15;
  else if (change24h > 10) score -= 20; // Penalize pumps
  else if (change24h > 5) score -= 10;
  
  // 7d trend analysis (0-25 points)
  if (change7d < -20) score += 25;
  else if (change7d < -15) score += 20;
  else if (change7d < -10) score += 15;
  else if (change7d < -5) score += 10;
  else if (change7d < 0) score += 5;
  else if (change7d > 20) score -= 15;
  else if (change7d > 10) score -= 10;
  
  // Distance from ATH (0-20 points) - bigger discounts score higher
  const athDistance = coin.ath_change_percentage || 0;
  if (athDistance < -80) score += 20;
  else if (athDistance < -60) score += 18;
  else if (athDistance < -40) score += 15;
  else if (athDistance < -20) score += 10;
  else if (athDistance < -10) score += 5;
  else if (athDistance > -5) score -= 5; // Near ATH is risky
  
  // Fear & Greed analysis (0-15 points)
  const fearGreed = fearGreedData.value;
  if (fearGreed < 25) score += 15; // Extreme fear
  else if (fearGreed < 45) score += 10; // Fear
  else if (fearGreed > 75) score -= 10; // Greed
  else if (fearGreed > 60) score -= 5; // Mild greed
  
  // Market cap tier bonus (quality factor)
  const marketCap = coin.market_cap || 0;
  if (marketCap > 100000000000) score += 5; // Top tier (100B+)
  else if (marketCap > 10000000000) score += 3; // Large cap (10B+)
  else if (marketCap > 1000000000) score += 1; // Mid cap (1B+)
  // Small caps get no bonus but no penalty
  
  // Ensure score is within 0-100 range
  score = Math.max(0, Math.min(100, score));
  
  // Determine signal based on score
  let signal, confidence;
  if (score >= 70) {
    signal = 'STRONG BUY';
    confidence = 'High';
  } else if (score >= 55) {
    signal = 'BUY';
    confidence = 'Medium';
  } else if (score >= 40) {
    signal = 'MAYBE';
    confidence = 'Medium';
  } else {
    signal = 'WAIT';
    confidence = 'Low';
  }
  
  return { score: Math.round(score), signal, confidence };
}