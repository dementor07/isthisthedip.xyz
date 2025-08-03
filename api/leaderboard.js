// Vercel serverless function for comprehensive crypto leaderboard
import { getLeaderboard } from './prisma-utils.js';

// Cache for storing all coin data with 24-hour refresh
let allCoinsCache = {
  data: null,
  lastUpdated: null,
  isUpdating: false
};

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const COINGECKO_TOTAL_COINS = 10000; // Approximate total coins in CoinGecko

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
    const { 
      timeframe = '24h', 
      page = 1, 
      limit = 100, 
      source = 'live',
      search = ''
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    
    let leaderboard, totalCoins, hasMore;
    
    if (source === 'analyzed') {
      // Get analyzed coins from database (original functionality)
      leaderboard = await getLeaderboard(timeframe, limitNum);
      totalCoins = leaderboard.length;
      hasMore = false;
    } else {
      // Get comprehensive live market data with pagination
      const result = await getComprehensiveLeaderboard(pageNum, limitNum, search);
      leaderboard = result.coins;
      totalCoins = result.totalCoins;
      hasMore = result.hasMore;
    }
    
    const metadata = {
      source: source,
      page: pageNum,
      limit: limitNum,
      totalCoins: totalCoins,
      hasMore: hasMore,
      totalPages: Math.ceil(totalCoins / limitNum),
      topDip: leaderboard.length > 0 ? { 
        symbol: leaderboard[0].symbol, 
        score: leaderboard[0].score 
      } : null,
      lastUpdated: allCoinsCache.lastUpdated || new Date(),
      cacheStatus: allCoinsCache.data ? 'cached' : 'fresh'
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

async function getComprehensiveLeaderboard(page = 1, limit = 100, search = '') {
  try {
    // Check if cache needs refresh
    const needsRefresh = !allCoinsCache.data || 
                        !allCoinsCache.lastUpdated || 
                        (Date.now() - allCoinsCache.lastUpdated) > CACHE_DURATION;

    // Refresh cache if needed (non-blocking for subsequent requests)
    if (needsRefresh && !allCoinsCache.isUpdating) {
      refreshAllCoinsCache(); // Non-blocking background refresh
    }

    // If no cache exists, fall back to original method for immediate results
    if (!allCoinsCache.data) {
      console.log('No cache available, falling back to original method...');
      // Start cache refresh in background (non-blocking)
      refreshAllCoinsCache();
      // Return immediate results using original method
      return await getOriginalLeaderboardWithPagination(page, limit, search);
    }

    let allCoins = allCoinsCache.data || [];

    // Apply search filter if provided
    if (search && search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      allCoins = allCoins.filter(coin => 
        coin.symbol.toLowerCase().includes(searchTerm) ||
        coin.name.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by dip score (highest scores first)
    allCoins.sort((a, b) => b.score - a.score);

    // Calculate pagination
    const totalCoins = allCoins.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedCoins = allCoins.slice(startIndex, endIndex);
    const hasMore = endIndex < totalCoins;

    // Add dynamic ranking based on filtered/sorted results
    const rankedCoins = paginatedCoins.map((coin, index) => ({
      ...coin,
      rank: startIndex + index + 1
    }));

    return {
      coins: rankedCoins,
      totalCoins: totalCoins,
      hasMore: hasMore,
      currentPage: page,
      totalPages: Math.ceil(totalCoins / limit)
    };

  } catch (error) {
    console.error('Error in comprehensive leaderboard:', error);
    return {
      coins: [],
      totalCoins: 0,
      hasMore: false,
      currentPage: page,
      totalPages: 0
    };
  }
}

async function refreshAllCoinsCache() {
  if (allCoinsCache.isUpdating) {
    console.log('Cache refresh already in progress...');
    return;
  }

  allCoinsCache.isUpdating = true;
  
  try {
    console.log('🔄 Starting comprehensive coin data refresh...');
    const startTime = Date.now();
    const TIMEOUT_MS = 25000; // 25 seconds to stay under Vercel 30s limit
    
    const allCoins = [];
    const fearGreedData = await getFearGreedIndex();
    
    // Reduced scope for initial implementation - start with 2000 coins
    const coinsPerPage = 250;
    const maxPages = 8; // 2000 coins total for now
    const batchSize = 3; // Smaller batches to stay within timeout
    
    for (let batch = 0; batch < Math.ceil(maxPages / batchSize); batch++) {
      // Check timeout
      if (Date.now() - startTime > TIMEOUT_MS) {
        console.warn('⏰ Timeout reached, stopping cache refresh');
        break;
      }
      
      const batchPromises = [];
      
      for (let i = 0; i < batchSize && (batch * batchSize + i) < maxPages; i++) {
        const page = batch * batchSize + i + 1;
        batchPromises.push(fetchCoinPage(page, coinsPerPage, fearGreedData));
      }
      
      // Wait for current batch with timeout
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Collect successful results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          allCoins.push(...result.value);
        }
      });
      
      console.log(`📊 Processed batch ${batch + 1}/${Math.ceil(maxPages / batchSize)}, total coins: ${allCoins.length}`);
      
      // Shorter delay to save time
      if (batch < Math.ceil(maxPages / batchSize) - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Only update cache if we got reasonable results
    if (allCoins.length > 100) {
      allCoinsCache.data = allCoins;
      allCoinsCache.lastUpdated = Date.now();
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`✅ Cache refresh complete! Loaded ${allCoins.length} coins in ${duration.toFixed(2)}s`);
    } else {
      console.warn('⚠️ Cache refresh got insufficient data, keeping existing cache');
    }
    
  } catch (error) {
    console.error('❌ Cache refresh failed:', error);
  } finally {
    allCoinsCache.isUpdating = false;
  }
}

async function fetchCoinPage(page, perPage, fearGreedData) {
  try {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?` +
      `vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&` +
      `sparkline=false&price_change_percentage=1h,24h,7d,30d`
    );
    
    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited - wait and retry once
        console.warn(`Rate limited on page ${page}, waiting...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        return fetchCoinPage(page, perPage, fearGreedData);
      }
      throw new Error(`API error: ${response.status} on page ${page}`);
    }
    
    const coins = await response.json();
    
    // Process and analyze each coin
    return coins.map(coin => {
      const dipScore = calculateDipScore(coin, fearGreedData);
      
      return {
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        score: dipScore.score,
        signal: dipScore.signal,
        confidence: dipScore.confidence,
        price: coin.current_price,
        priceChange24h: coin.price_change_percentage_24h || 0,
        priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
        priceChange30d: coin.price_change_percentage_30d_in_currency || 0,
        marketCap: coin.market_cap,
        volume24h: coin.total_volume,
        marketCapRank: coin.market_cap_rank,
        ath: coin.ath,
        athChangePercentage: coin.ath_change_percentage,
        atl: coin.atl,
        atlChangePercentage: coin.atl_change_percentage,
        circulatingSupply: coin.circulating_supply,
        maxSupply: coin.max_supply,
        lastAnalyzed: new Date()
      };
    });
    
  } catch (error) {
    console.error(`Error fetching page ${page}:`, error);
    return null;
  }
}

async function getOriginalLeaderboardWithPagination(page = 1, limit = 100, search = '') {
  try {
    console.log(`🔄 Using fallback method for page ${page}, limit ${limit}`);
    
    // Calculate how many coins we need to fetch to support pagination
    const totalNeeded = page * limit;
    const fetchLimit = Math.min(totalNeeded, 500); // Cap at 500 for performance
    
    // Fetch coins using original method
    const allCoins = await getLiveMarketLeaderboard(fetchLimit);
    
    // Apply search filter if provided
    let filteredCoins = allCoins;
    if (search && search.trim()) {
      const searchTerm = search.toLowerCase().trim();
      filteredCoins = allCoins.filter(coin => 
        coin.symbol.toLowerCase().includes(searchTerm) ||
        coin.name.toLowerCase().includes(searchTerm)
      );
    }
    
    // Calculate pagination
    const totalCoins = filteredCoins.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedCoins = filteredCoins.slice(startIndex, endIndex);
    const hasMore = endIndex < totalCoins || (totalCoins === fetchLimit && !search);
    
    // Add proper ranking
    const rankedCoins = paginatedCoins.map((coin, index) => ({
      ...coin,
      rank: startIndex + index + 1
    }));
    
    return {
      coins: rankedCoins,
      totalCoins: search ? totalCoins : fetchLimit, // Show fetch limit if no search
      hasMore: hasMore,
      currentPage: page,
      totalPages: Math.ceil((search ? totalCoins : fetchLimit) / limit)
    };
    
  } catch (error) {
    console.error('Error in fallback leaderboard:', error);
    return {
      coins: [],
      totalCoins: 0,
      hasMore: false,
      currentPage: page,
      totalPages: 0
    };
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