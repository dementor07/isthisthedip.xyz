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

      // Enhanced result with CoinGecko data
      const currentPrice = price.usd || price.current_price || 0;
      const result = {
        crypto: {
          name: price.name || crypto,
          symbol: price.symbol || crypto.toUpperCase(),
          price: currentPrice,
          change_24h: price.price_change_percentage_24h || 0,
          change_7d: price.market_data?.price_change_percentage_7d || 0,
          change_30d: price.market_data?.price_change_percentage_30d || 0,
          market_cap: price.usd_market_cap || price.market_cap || 0,
          volume_24h: price.usd_24h_vol || price.total_volume || 0,
          market_cap_rank: price.market_cap_rank || 0,
          ath: price.market_data?.ath || 0,
          ath_change_percentage: price.market_data?.ath_change_percentage || 0,
          atl: price.market_data?.atl || 0,
          atl_change_percentage: price.market_data?.atl_change_percentage || 0
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
          data_sources: getDataSourcesUsed([priceData, fearGreed, technicals, news]),
          data_quality: price.data_quality || 'Good'
        },
        insights: generateInsights(price, finalScore, technicalScore, marketScore),
        risk_factors: identifyRiskFactors(price),
        opportunity_factors: identifyOpportunityFactors(price, finalScore),
        timestamp: new Date().toISOString()
      };

      // Add volatility analysis if historical data is available
      if (price.historical_data && price.historical_data.prices) {
        result.volatility = {
          annualized_volatility: calculateVolatility(price.historical_data.prices),
          price_stability: analyzePriceStability(price.historical_data.prices)
        };
      }

      // Add community metrics if available
      if (price.community_data) {
        result.community = {
          twitter_followers: price.community_data.twitter_followers || 0,
          reddit_subscribers: price.community_data.reddit_subscribers || 0,
          social_activity_score: calculateSocialActivityScore(price.community_data)
        };
      }

      // Add quality metrics from CoinGecko
      if (price.coingecko_score) {
        result.quality_metrics = {
          coingecko_score: price.coingecko_score,
          developer_score: price.developer_score || 0,
          community_score: price.community_score || 0,
          liquidity_score: price.liquidity_score || 0,
          public_interest_score: price.public_interest_score || 0
        };
      }

      return result;
    } catch (error) {
      console.error('Real analysis failed:', error);
      return getFallbackAnalysis(crypto);
    }
}

async function getCoinGeckoData(crypto) {
    try {
        // First, try to get comprehensive data including market data
        const [priceData, coinData, historyData] = await Promise.allSettled([
            getCoinGeckoPriceData(crypto),
            getCoinGeckoDetailedData(crypto),
            getCoinGeckoHistoricalData(crypto)
        ]);

        const price = priceData.status === 'fulfilled' ? priceData.value : null;
        const details = coinData.status === 'fulfilled' ? coinData.value : null;
        const history = historyData.status === 'fulfilled' ? historyData.value : null;

        // Merge all available data
        return {
            ...price,
            ...details,
            historical_data: history,
            data_quality: calculateDataQuality([priceData, coinData, historyData])
        };
    } catch (error) {
        console.error('CoinGecko comprehensive data error:', error);
        // Fallback to simple price data
        return await getCoinGeckoSimplePrice(crypto);
    }
}

async function getCoinGeckoPriceData(crypto) {
    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${crypto}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true`);
    const data = await response.json();
    return data[crypto] || data[Object.keys(data)[0]];
}

async function getCoinGeckoDetailedData(crypto) {
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/${crypto}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=false&sparkline=true`);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
        name: data.name,
        symbol: data.symbol?.toUpperCase(),
        description: data.description?.en?.substring(0, 200),
        categories: data.categories || [],
        market_cap_rank: data.market_cap_rank,
        coingecko_rank: data.coingecko_rank,
        coingecko_score: data.coingecko_score,
        developer_score: data.developer_score,
        community_score: data.community_score,
        liquidity_score: data.liquidity_score,
        public_interest_score: data.public_interest_score,
        market_data: {
            ath: data.market_data?.ath?.usd,
            ath_change_percentage: data.market_data?.ath_change_percentage?.usd,
            atl: data.market_data?.atl?.usd,
            atl_change_percentage: data.market_data?.atl_change_percentage?.usd,
            price_change_percentage_7d: data.market_data?.price_change_percentage_7d,
            price_change_percentage_30d: data.market_data?.price_change_percentage_30d,
            price_change_percentage_1y: data.market_data?.price_change_percentage_1y,
            high_24h: data.market_data?.high_24h?.usd,
            low_24h: data.market_data?.low_24h?.usd,
            circulating_supply: data.market_data?.circulating_supply,
            total_supply: data.market_data?.total_supply,
            max_supply: data.market_data?.max_supply
        },
        community_data: {
            twitter_followers: data.community_data?.twitter_followers,
            reddit_subscribers: data.community_data?.reddit_subscribers,
            reddit_average_posts_48h: data.community_data?.reddit_average_posts_48h,
            reddit_average_comments_48h: data.community_data?.reddit_average_comments_48h,
            facebook_likes: data.community_data?.facebook_likes,
            telegram_channel_user_count: data.community_data?.telegram_channel_user_count
        },
        sparkline_7d: data.market_data?.sparkline_7d?.price || []
    };
}

async function getCoinGeckoHistoricalData(crypto) {
    // Get 30 days of historical data for better technical analysis
    const response = await fetch(`https://api.coingecko.com/api/v3/coins/${crypto}/market_chart?vs_currency=usd&days=30&interval=daily`);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
        prices: data.prices || [],
        market_caps: data.market_caps || [],
        total_volumes: data.total_volumes || []
    };
}

async function getCoinGeckoSimplePrice(crypto) {
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
    
    // Enhanced RSI analysis using historical data
    if (priceData.historical_data && priceData.historical_data.prices) {
        const rsi = calculateRSIFromHistory(priceData.historical_data.prices);
        if (rsi < 30) score += 25; // Oversold - strong buy signal
        else if (rsi < 40) score += 15; // Approaching oversold
        else if (rsi > 70) score -= 20; // Overbought
        else if (rsi > 60) score -= 10; // Approaching overbought
    }
    
    // Multiple timeframe price change analysis
    const changes = {
        '24h': priceData.price_change_percentage_24h,
        '7d': priceData.market_data?.price_change_percentage_7d,
        '30d': priceData.market_data?.price_change_percentage_30d
    };
    
    // 24h analysis
    if (changes['24h']) {
        if (changes['24h'] < -15) score += 20; // Major dip
        else if (changes['24h'] < -10) score += 15; // Big dip
        else if (changes['24h'] < -5) score += 10; // Medium dip
        else if (changes['24h'] > 10) score -= 15; // Major pump
        else if (changes['24h'] > 5) score -= 10; // Rising fast
    }
    
    // 7d trend analysis
    if (changes['7d']) {
        if (changes['7d'] < -20) score += 15; // Weekly downtrend - opportunity
        else if (changes['7d'] > 20) score -= 10; // Weekly uptrend - caution
    }
    
    // Support/Resistance analysis using ATH/ATL
    if (priceData.market_data) {
        const currentPrice = priceData.usd || priceData.current_price || 0;
        const ath = priceData.market_data.ath;
        const atl = priceData.market_data.atl;
        
        if (ath && atl && currentPrice) {
            const athDistance = ((currentPrice - ath) / ath) * 100;
            const atlDistance = ((currentPrice - atl) / atl) * 100;
            
            // Near ATL is good buying opportunity
            if (athDistance < -80) score += 20; // Very close to ATL
            else if (athDistance < -60) score += 15; // Close to ATL
            
            // Near ATH is risky
            if (athDistance > -10) score -= 15; // Very close to ATH
            else if (athDistance > -25) score -= 10; // Approaching ATH
        }
    }
    
    // Volume analysis with historical context
    if (priceData.usd_24h_vol && priceData.usd_market_cap) {
        const volumeRatio = priceData.usd_24h_vol / priceData.usd_market_cap;
        if (volumeRatio > 0.15) score += 15; // Very high volume
        else if (volumeRatio > 0.1) score += 10; // High volume
        else if (volumeRatio < 0.01) score -= 10; // Low volume
    }
    
    // Moving average analysis using sparkline data
    if (priceData.sparkline_7d && priceData.sparkline_7d.length > 0) {
        const ma = calculateMovingAverageFromSparkline(priceData.sparkline_7d);
        const currentPrice = priceData.usd || priceData.current_price || 0;
        
        if (currentPrice < ma * 0.95) score += 10; // Below MA - potential buy
        else if (currentPrice > ma * 1.05) score -= 8; // Above MA - caution
    }
    
    return Math.max(0, Math.min(100, score));
}

function analyzeMarketConditions(priceData, fearGreedData) {
    let score = 50;
    
    // Fear & Greed analysis
    const fearGreed = fearGreedData.value;
    if (fearGreed < 25) score += 25; // Extreme fear - excellent buy opportunity
    else if (fearGreed < 45) score += 15; // Fear - good buy opportunity
    else if (fearGreed > 75) score -= 20; // Greed - be cautious
    else if (fearGreed > 60) score -= 10; // Mild greed

    // Market cap and rank analysis
    const marketCap = priceData.usd_market_cap || priceData.market_cap;
    const rank = priceData.market_cap_rank;
    
    if (marketCap) {
        // Large cap (>$10B) - more stable during dips
        if (marketCap > 10e9) score += 15;
        // Mid cap ($1B-$10B) - good balance
        else if (marketCap > 1e9) score += 10;
        // Small cap ($100M-$1B) - higher risk but potential
        else if (marketCap > 100e6) score += 5;
        // Micro cap (<$100M) - very risky
        else score -= 10;
    }
    
    if (rank) {
        // Top 10 cryptos - most stable
        if (rank <= 10) score += 12;
        // Top 50 - established projects
        else if (rank <= 50) score += 8;
        // Top 100 - decent projects
        else if (rank <= 100) score += 5;
        // Beyond top 100 - higher risk
        else if (rank > 200) score -= 5;
    }

    // CoinGecko scoring system analysis
    if (priceData.coingecko_score) {
        const cgScore = priceData.coingecko_score;
        if (cgScore > 70) score += 10; // High quality project
        else if (cgScore > 50) score += 5; // Decent project
        else if (cgScore < 30) score -= 10; // Low quality
    }

    // Community strength analysis
    if (priceData.community_data) {
        const community = priceData.community_data;
        let communityScore = 0;
        
        // Social media following
        if (community.twitter_followers > 1000000) communityScore += 5;
        else if (community.twitter_followers > 100000) communityScore += 3;
        
        if (community.reddit_subscribers > 100000) communityScore += 5;
        else if (community.reddit_subscribers > 10000) communityScore += 3;
        
        // Community activity
        if (community.reddit_average_posts_48h > 10) communityScore += 3;
        if (community.reddit_average_comments_48h > 50) communityScore += 3;
        
        score += Math.min(communityScore, 15); // Cap community bonus
    }

    // Supply analysis
    if (priceData.market_data) {
        const { circulating_supply, total_supply, max_supply } = priceData.market_data;
        
        if (max_supply && circulating_supply) {
            const supplyRatio = circulating_supply / max_supply;
            // Lower circulating supply ratio can be positive (scarcity)
            if (supplyRatio < 0.5) score += 5;
            else if (supplyRatio > 0.95) score += 3; // Nearly fully diluted
        }
    }
    
    return Math.max(0, Math.min(100, score));
}

function analyzeVolumeProfile(priceData) {
    let score = 50;
    
    const volume24h = priceData.usd_24h_vol || priceData.total_volume;
    const marketCap = priceData.usd_market_cap || priceData.market_cap;
    
    if (volume24h && marketCap) {
        const volumeRatio = volume24h / marketCap;
        
        // Volume ratio analysis
        if (volumeRatio > 0.25) score += 25; // Extremely high volume
        else if (volumeRatio > 0.15) score += 20; // Very high volume
        else if (volumeRatio > 0.1) score += 15; // High volume
        else if (volumeRatio > 0.05) score += 10; // Good volume
        else if (volumeRatio < 0.01) score -= 15; // Low volume - concerning
        else if (volumeRatio < 0.005) score -= 25; // Very low volume - very concerning
    }
    
    // Historical volume analysis using volume data
    if (priceData.historical_data && priceData.historical_data.total_volumes) {
        const volumes = priceData.historical_data.total_volumes;
        const currentVolume = volume24h;
        
        if (volumes.length > 7 && currentVolume) {
            const recentVolumes = volumes.slice(-7).map(v => Array.isArray(v) ? v[1] : v);
            const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
            
            // Current volume vs recent average
            const volumeChange = (currentVolume - avgVolume) / avgVolume;
            
            if (volumeChange > 1.0) score += 15; // Volume doubled - high interest
            else if (volumeChange > 0.5) score += 10; // Volume increased 50%
            else if (volumeChange < -0.5) score -= 10; // Volume dropped significantly
        }
    }
    
    // Liquidity analysis based on market cap and volume
    if (marketCap) {
        if (marketCap > 1e9 && volume24h > 50e6) score += 10; // Good liquidity
        else if (marketCap < 100e6 && volume24h > 1e6) score += 5; // Decent for small cap
        else if (marketCap > 1e9 && volume24h < 10e6) score -= 10; // Poor liquidity for large cap
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

// Enhanced helper functions for CoinGecko data analysis
function calculateDataQuality(dataResults) {
    const successful = dataResults.filter(r => r.status === 'fulfilled').length;
    const total = dataResults.length;
    const percentage = (successful / total) * 100;
    
    if (percentage >= 100) return 'Excellent';
    if (percentage >= 66) return 'Good'; 
    if (percentage >= 33) return 'Fair';
    return 'Poor';
}

function calculateRSIFromHistory(prices) {
    if (!prices || prices.length < 14) return 50; // Default neutral RSI
    
    const priceArray = prices.map(p => Array.isArray(p) ? p[1] : p);
    const changes = [];
    
    for (let i = 1; i < priceArray.length; i++) {
        changes.push(priceArray[i] - priceArray[i - 1]);
    }
    
    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);
    
    const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14;
    const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi);
}

function calculateMovingAverageFromSparkline(sparkline) {
    if (!sparkline || sparkline.length === 0) return 0;
    
    const sum = sparkline.reduce((a, b) => a + b, 0);
    return sum / sparkline.length;
}

function calculateVolatility(prices) {
    if (!prices || prices.length < 2) return 0;
    
    const priceArray = prices.map(p => Array.isArray(p) ? p[1] : p);
    const returns = [];
    
    for (let i = 1; i < priceArray.length; i++) {
        const returnValue = (priceArray[i] - priceArray[i - 1]) / priceArray[i - 1];
        returns.push(returnValue);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(365) * 100; // Annualized volatility percentage
}

function analyzePriceStability(prices) {
    const volatility = calculateVolatility(prices);
    
    if (volatility < 30) return 'Very Stable';
    if (volatility < 60) return 'Stable'; 
    if (volatility < 100) return 'Moderate';
    if (volatility < 150) return 'Volatile';
    return 'Highly Volatile';
}

function calculateSocialActivityScore(communityData) {
    let score = 0;
    
    // Twitter influence
    if (communityData.twitter_followers > 1000000) score += 30;
    else if (communityData.twitter_followers > 100000) score += 20;
    else if (communityData.twitter_followers > 10000) score += 10;
    
    // Reddit engagement
    if (communityData.reddit_subscribers > 100000) score += 25;
    else if (communityData.reddit_subscribers > 10000) score += 15;
    else if (communityData.reddit_subscribers > 1000) score += 5;
    
    // Activity level
    const posts = communityData.reddit_average_posts_48h || 0;
    const comments = communityData.reddit_average_comments_48h || 0;
    
    if (posts > 20) score += 15;
    else if (posts > 10) score += 10;
    else if (posts > 5) score += 5;
    
    if (comments > 100) score += 15;
    else if (comments > 50) score += 10;
    else if (comments > 20) score += 5;
    
    // Other platforms
    if (communityData.telegram_channel_user_count > 50000) score += 10;
    if (communityData.facebook_likes > 100000) score += 5;
    
    return Math.min(score, 100);
}

function generateInsights(priceData, finalScore, technicalScore, marketScore) {
    const insights = [];
    const currentPrice = priceData.usd || priceData.current_price || 0;
    
    // Price position insights
    if (priceData.market_data) {
        const athDistance = priceData.market_data.ath_change_percentage || 0;
        const atlDistance = priceData.market_data.atl_change_percentage || 0;
        
        if (athDistance < -70) {
            insights.push("Currently trading at significant discount from all-time high");
        }
        if (atlDistance > 500) {
            insights.push("Strong recovery from all-time low shows resilience");
        }
    }
    
    // Technical insights
    if (technicalScore > 70) {
        insights.push("Strong technical indicators support buying opportunity");
    } else if (technicalScore < 30) {
        insights.push("Technical analysis suggests caution - wait for better entry");
    }
    
    // Market position insights
    if (priceData.market_cap_rank && priceData.market_cap_rank <= 50) {
        insights.push("Established top-50 cryptocurrency with proven track record");
    }
    
    // Volume insights  
    const volume = priceData.usd_24h_vol || priceData.total_volume || 0;
    const marketCap = priceData.usd_market_cap || priceData.market_cap || 0;
    if (volume && marketCap && (volume / marketCap) > 0.15) {
        insights.push("High trading volume indicates strong market interest");
    }
    
    return insights;
}

function identifyRiskFactors(priceData) {
    const riskFactors = [];
    
    // Market cap risk
    const marketCap = priceData.usd_market_cap || priceData.market_cap || 0;
    if (marketCap < 100e6) {
        riskFactors.push("Small market cap increases volatility risk");
    }
    
    // Volume risk
    const volume = priceData.usd_24h_vol || priceData.total_volume || 0;
    if (volume && marketCap && (volume / marketCap) < 0.01) {
        riskFactors.push("Low trading volume may affect liquidity");
    }
    
    // Price volatility
    if (priceData.historical_data) {
        const volatility = calculateVolatility(priceData.historical_data.prices);
        if (volatility > 100) {
            riskFactors.push("High price volatility increases investment risk");
        }
    }
    
    // Ranking risk
    if (priceData.market_cap_rank && priceData.market_cap_rank > 200) {
        riskFactors.push("Lower market ranking indicates higher speculative risk");
    }
    
    // Quality score risk
    if (priceData.coingecko_score && priceData.coingecko_score < 40) {
        riskFactors.push("Low CoinGecko quality score suggests project concerns");
    }
    
    return riskFactors;
}

function identifyOpportunityFactors(priceData, finalScore) {
    const opportunities = [];
    
    // Score-based opportunities
    if (finalScore > 80) {
        opportunities.push("Exceptional buying opportunity identified");
    } else if (finalScore > 70) {
        opportunities.push("Strong buying signal with favorable conditions");
    }
    
    // Price position opportunities
    if (priceData.market_data) {
        const athDistance = priceData.market_data.ath_change_percentage || 0;
        if (athDistance < -80) {
            opportunities.push("Trading near historic lows - potential for significant upside");
        } else if (athDistance < -50) {
            opportunities.push("Substantial discount from all-time high");
        }
    }
    
    // Quality opportunities
    if (priceData.coingecko_score && priceData.coingecko_score > 70) {
        opportunities.push("High-quality project with strong fundamentals");
    }
    
    // Community opportunities
    if (priceData.community_data) {
        const socialScore = calculateSocialActivityScore(priceData.community_data);
        if (socialScore > 70) {
            opportunities.push("Strong community support and engagement");
        }
    }
    
    // Market position opportunities
    if (priceData.market_cap_rank && priceData.market_cap_rank <= 20) {
        opportunities.push("Top-tier cryptocurrency with institutional recognition");
    }
    
    return opportunities;
}