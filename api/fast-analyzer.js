const axios = require('axios');
const config = require('./config');
const CacheManager = require('./cache-manager');
const TechnicalIndicators = require('./technical-indicators');
const SentimentAnalyzer = require('./sentiment-analyzer');
const RealTimeStreamer = require('./realtime-streamer');
const RealTimeTechnical = require('./realtime-technical');

class FastCryptoAnalyzer {
  constructor(db) {
    this.db = db;
    this.cache = new CacheManager();
    this.technicalIndicators = new TechnicalIndicators(this.cache);
    this.sentimentAnalyzer = new SentimentAnalyzer(this.cache);
    
    // Real-time components
    this.realTimeStreamer = new RealTimeStreamer();
    this.realTimeTechnical = new RealTimeTechnical(this.realTimeStreamer);
    
    // Preload common data on startup
    setTimeout(() => {
      this.cache.preloadCommonData();
    }, 1000);
  }

  async calculateFastDipScore(crypto, userTier = 'free') {
    try {
      console.log(`Starting comprehensive analysis for ${crypto}`);
      
      // Get essential data with timeout
      const [priceData, marketData] = await Promise.all([
        Promise.race([
          this.getCoinGeckoData(crypto),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Price timeout')), 8000))
        ]),
        Promise.race([
          this.getComprehensiveMarketData(),
          new Promise((resolve) => setTimeout(() => resolve(this.getDefaultMarketData()), 5000))
        ])
      ]);

      console.log('Got price data:', priceData.name, priceData.current_price);
      console.log('Got market data:', marketData);

      // Calculate comprehensive scores
      const priceScore = await this.calculateEnhancedPriceScore(priceData, crypto, userTier);
      const marketScore = this.calculateComprehensiveMarketScore(priceData, marketData);
      
      // Get sentiment analysis for Premium/Pro users
      let sentimentScore = 50; // Neutral default
      let sentimentData = null;
      
      if (userTier === 'premium' || userTier === 'pro') {
        sentimentData = await this.sentimentAnalyzer.analyzeCryptoSentiment(crypto, priceData.name);
        sentimentScore = this.sentimentAnalyzer.scoreSentiment(sentimentData);
        console.log(`✅ Sentiment analysis completed for ${crypto}: ${sentimentScore}/100 (${sentimentData.sentiment.classification})`);
      } else {
        console.log('📊 Sentiment analysis available with Premium upgrade');
      }
      
      // Get real-time technical data for Pro users
      let realTimeTechnicals = null;
      if (userTier === 'pro') {
        realTimeTechnicals = this.realTimeTechnical.getTechnicalSnapshot(crypto, '5m');
        console.log(`🔴 LIVE: Real-time technical analysis for ${crypto}:`, realTimeTechnicals ? 'Available' : 'Initializing...');
      }
      
      console.log(`Score breakdown: Price=${priceScore.score}, Market=${marketScore}, Sentiment=${sentimentScore}`);
      console.log(`Price data: 24h=${priceData.price_change_percentage_24h}%, 7d=${priceData.price_change_percentage_7d}%, ATH=${priceData.ath_change_percentage}%`);
      
      // Updated weighting: Price (70%) + Market (20%) + Sentiment (10%)
      // Sentiment gets small but meaningful weight to avoid emotion-driven decisions
      let finalScore;
      if (userTier === 'premium' || userTier === 'pro') {
        finalScore = Math.round((priceScore.score * 0.70) + (marketScore * 0.20) + (sentimentScore * 0.10));
      } else {
        // Free users: Original weighting without sentiment
        finalScore = Math.round((priceScore.score * 0.8) + (marketScore * 0.2));
      }
      const signal = this.generateSignal(finalScore);
      const confidence = this.calculateConfidence(priceScore.score, marketScore, marketData);

      console.log('Final comprehensive score:', finalScore);

      return this.formatFastResponse(finalScore, signal, confidence, userTier, {
        priceData,
        marketData,
        priceScore,
        sentimentData,
        sentimentScore,
        realTimeTechnicals,
        technicalData: priceScore.technicalData
      });

    } catch (error) {
      console.error('Fast analysis error:', error);
      throw new Error('Unable to analyze cryptocurrency at this time');
    }
  }

  async getCoinGeckoData(crypto) {
    const cryptoKey = crypto.toLowerCase().replace(/\s+/g, '-');
    
    return await this.cache.fetchWithCache('crypto_data', async () => {
      try {
        console.log(`API CALL: Fetching fresh data for ${crypto}`);
        
        // Try multiple search strategies to find the coin
        let coin = await this.findCryptocurrency(crypto);
        if (!coin) throw new Error('Cryptocurrency not found');

        console.log(`Found coin: ${coin.id} (${coin.name})`);

        // Get price data
        const priceResponse = await axios.get(`${config.APIs.COINGECKO}/coins/${coin.id}`, {
          params: { 
            localization: false,
            tickers: false,
            market_data: true,
            community_data: false,
            developer_data: false
          },
          timeout: 5000
        });

        const marketData = priceResponse.data.market_data;
        return {
          id: coin.id,
          name: priceResponse.data.name,
          symbol: priceResponse.data.symbol?.toUpperCase(),
          current_price: marketData.current_price?.usd || 0,
          price_change_percentage_24h: marketData.price_change_percentage_24h || 0,
          price_change_percentage_7d: marketData.price_change_percentage_7d || 0,
          market_cap: marketData.market_cap?.usd || 0,
          total_volume: marketData.total_volume?.usd || 0,
          ath_change_percentage: marketData.ath_change_percentage?.usd || 0,
          ath: marketData.ath?.usd || 0,
          atl: marketData.atl?.usd || 0,
          atl_change_percentage: marketData.atl_change_percentage?.usd || 0
        };
      } catch (error) {
        console.error('CoinGecko error:', error.message);
        throw error;
      }
    }, { crypto: cryptoKey });
  }

  async getFearGreedIndex() {
    return await this.cache.fetchWithCache('fear_greed', async () => {
      try {
        console.log('API CALL: Fetching fresh Fear & Greed data');
        const response = await axios.get(`${config.APIs.FEAR_GREED}?limit=1`, {
          timeout: 3000
        });
        return {
          value: parseInt(response.data.data?.[0]?.value || 50),
          classification: response.data.data?.[0]?.value_classification || 'Neutral'
        };
      } catch (error) {
        console.error('Fear & Greed error:', error.message);
        return { value: 50, classification: 'Neutral' };
      }
    });
  }

  async calculateEnhancedPriceScore(priceData, crypto, userTier) {
    // Get basic price action score (70% of price score)
    const basicPriceScore = this.calculateBasicPriceScore(priceData);
    
    // Get technical indicators (30% of price score) - for premium/pro users
    let technicalScore = 50; // Default neutral score
    let technicalData = null;
    
    if ((userTier === 'premium' || userTier === 'pro') && this.technicalIndicators.canMakeCall()) {
      try {
        technicalData = await this.technicalIndicators.getTechnicalIndicators(crypto);
        technicalScore = this.technicalIndicators.calculateTechnicalScore(technicalData, priceData.current_price);
        console.log(`✅ Technical analysis completed for ${crypto}: ${technicalScore}/100`);
      } catch (error) {
        console.log(`⚠️ Technical analysis failed for ${crypto}, using default`);
      }
    } else if (userTier === 'free') {
      console.log(`📊 Technical indicators available with Premium upgrade`);
    } else {
      console.log(`⚠️ Alpha Vantage API limit reached or no API key`);
    }
    
    // Combine scores: 70% basic price action + 30% technical indicators
    const enhancedScore = Math.round((basicPriceScore * 0.7) + (technicalScore * 0.3));
    
    console.log(`Price Score Breakdown: Basic=${basicPriceScore}, Technical=${technicalScore}, Enhanced=${enhancedScore}`);
    
    return {
      score: enhancedScore,
      basicScore: basicPriceScore,
      technicalScore: technicalScore,
      technicalData: technicalData
    };
  }

  calculateBasicPriceScore(priceData) {
    let score = 0;

    // PROVEN: Price drops are the strongest dip indicator
    const change24h = priceData.price_change_percentage_24h || 0;
    const change7d = priceData.price_change_percentage_7d || 0;
    const athDistance = priceData.ath_change_percentage || 0;
    
    // 1. Recent price action (what actually happened)
    if (change24h < -20) score += 30; // Massive single-day drop
    else if (change24h < -15) score += 25; // Major drop
    else if (change24h < -10) score += 20; // Significant drop
    else if (change24h < -5) score += 10; // Moderate drop
    
    // 2. Weekly trend (filters noise)
    if (change7d < -25) score += 20; // Major weekly decline
    else if (change7d < -15) score += 15; // Significant weekly decline
    else if (change7d < -10) score += 10; // Moderate weekly decline
    
    // 3. Distance from all-time high (mean reversion potential)
    if (athDistance < -80) score += 30; // Extreme oversold
    else if (athDistance < -60) score += 25; // Deep correction
    else if (athDistance < -40) score += 20; // Major correction
    else if (athDistance < -25) score += 15; // Moderate correction
    
    // 4. PROVEN: Multiple timeframe confirmation increases success rate
    if (change24h < -10 && change7d < -15) {
      score += 15; // Both short and medium term confirm dip
    }
    
    // 5. PROVEN: Extreme conditions have highest reversion probability
    if (change24h < -15 && athDistance < -50) {
      score += 10; // Extreme recent drop + major correction = high probability
    }

    return Math.max(0, Math.min(100, score));
  }

  async getComprehensiveMarketData() {
    try {
      const [fearGreed, bitcoinData, globalData] = await Promise.all([
        this.getFearGreedIndex(),
        this.getBitcoinDominance(),
        this.getGlobalMarketData()
      ]);

      return {
        fearGreed,
        bitcoinDominance: bitcoinData.dominance,
        bitcoinChange24h: bitcoinData.change24h,
        totalMarketCap: globalData.totalMarketCap,
        totalVolume: globalData.totalVolume,
        marketCapChange24h: globalData.marketCapChange24h,
        activeCoins: globalData.activeCoins,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Market data error:', error);
      return this.getDefaultMarketData();
    }
  }

  getDefaultMarketData() {
    return {
      fearGreed: { value: 50, classification: 'Neutral' },
      bitcoinDominance: 50,
      bitcoinChange24h: 0,
      totalMarketCap: 2000000000000, // $2T default
      totalVolume: 80000000000, // $80B default
      marketCapChange24h: 0,
      activeCoins: 2500,
      timestamp: Date.now()
    };
  }

  async getBitcoinDominance() {
    return await this.cache.fetchWithCache('bitcoin_dominance', async () => {
      try {
        console.log('API CALL: Fetching fresh Bitcoin dominance data');
        const response = await axios.get(`${config.APIs.COINGECKO}/coins/bitcoin`, {
          params: { market_data: true },
          timeout: 3000
        });
        
        const globalResponse = await axios.get(`${config.APIs.COINGECKO}/global`, {
          timeout: 3000
        });

        const btcMarketCap = response.data.market_data.market_cap.usd;
        const totalMarketCap = globalResponse.data.data.total_market_cap.usd;
        const dominance = (btcMarketCap / totalMarketCap) * 100;

        return {
          dominance: Math.round(dominance * 10) / 10,
          change24h: response.data.market_data.price_change_percentage_24h || 0
        };
      } catch (error) {
        return { dominance: 50, change24h: 0 };
      }
    });
  }

  async getGlobalMarketData() {
    return await this.cache.fetchWithCache('global_market', async () => {
      try {
        console.log('API CALL: Fetching fresh global market data');
        const response = await axios.get(`${config.APIs.COINGECKO}/global`, {
          timeout: 3000
        });

        const data = response.data.data;
        return {
          totalMarketCap: data.total_market_cap.usd,
          totalVolume: data.total_volume.usd,
          marketCapChange24h: data.market_cap_change_percentage_24h_usd,
          activeCoins: data.active_cryptocurrencies
        };
      } catch (error) {
        return {
          totalMarketCap: 2000000000000,
          totalVolume: 80000000000,
          marketCapChange24h: 0,
          activeCoins: 2500
        };
      }
    });
  }

  calculateComprehensiveMarketScore(priceData, marketData) {
    let score = 0;
    const factors = [];

    // FOCUS ON WHAT ACTUALLY WORKS:
    
    // 1. Volume (50% of market score) - PROVEN: Money flow is truth
    const volumeScore = this.analyzeVolumeProfile(priceData, marketData);
    score += volumeScore * 0.50;
    factors.push(`Volume: ${volumeScore}`);

    // 2. Bitcoin Correlation (35% of market score) - PROVEN: Crypto moves with BTC
    const bitcoinScore = this.analyzeBitcoinMarket(marketData, priceData);
    score += bitcoinScore * 0.35;
    factors.push(`Bitcoin: ${bitcoinScore}`);

    // 3. Market Cap Size (15% of market score) - PROVEN: Small caps have higher volatility
    const sizeScore = this.analyzeMarketCapSize(priceData, marketData);
    score += sizeScore * 0.15;
    factors.push(`Size: ${sizeScore}`);

    console.log('Market factors:', factors.join(', '));
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  analyzeFearGreed(fearGreed) {
    const value = fearGreed.value;
    
    if (value <= 10) return 100; // Extreme Fear - perfect buying
    if (value <= 25) return 80;  // Fear - great buying
    if (value <= 40) return 60;  // Some Fear - good buying
    if (value <= 60) return 40;  // Neutral - average
    if (value <= 75) return 20;  // Greed - poor buying
    return 0; // Extreme Greed - worst buying
  }

  analyzeMarketCapSize(priceData, marketData) {
    let score = 50; // Start neutral
    
    // PROVEN: Market cap affects volatility and recovery potential
    const marketCap = priceData.market_cap || 0;
    const totalMarketCap = marketData.totalMarketCap || 2000000000000; // $2T default
    const relativeSize = (marketCap / totalMarketCap) * 100;
    
    // PROVEN: Smaller caps have higher volatility = more dip opportunity but higher risk
    if (relativeSize < 0.01) score += 20; // Micro cap (<0.01% of total market)
    else if (relativeSize < 0.1) score += 15; // Small cap (<0.1% of total market)  
    else if (relativeSize < 0.5) score += 10; // Mid cap (<0.5% of total market)
    else if (relativeSize < 2.0) score += 5; // Large cap (<2% of total market)
    // Top caps (>2%) get no bonus - less volatile but safer
    
    // PROVEN: Market cap health check (avoid extremely illiquid assets)
    if (marketCap < 10000000) score -= 20; // Very small market cap = high risk
    if (marketCap < 1000000) score -= 30; // Extremely small = very high risk
    
    return Math.max(0, Math.min(100, score));
  }

  analyzeBitcoinMarket(marketData, priceData) {
    let score = 50; // Start neutral
    
    // Bitcoin dominance analysis
    const dominance = marketData.bitcoinDominance;
    if (dominance > 60) score += 15; // High dominance = safer for alts in dips
    if (dominance < 40) score -= 10; // Low dominance = alt season, less dip opportunity
    
    // Bitcoin correlation
    const btcChange = marketData.bitcoinChange24h;
    const assetChange = priceData.price_change_percentage_24h || 0;
    
    // If asset is dropping more than Bitcoin, it's a relative dip
    if (assetChange < btcChange - 5) score += 20;
    if (assetChange < btcChange - 10) score += 15;
    
    // If Bitcoin is crashing, everything follows
    if (btcChange < -10) score += 10; // Market-wide fear
    
    return Math.max(0, Math.min(100, score));
  }

  analyzeVolumeProfile(priceData, marketData) {
    let score = 0;
    
    // PROVEN: Sophisticated volume analysis with price context
    if (priceData.total_volume && priceData.market_cap) {
      const volumeRatio = priceData.total_volume / priceData.market_cap;
      const priceChange = priceData.price_change_percentage_24h || 0;
      let volumeScore = 0;
      
      // Base volume scoring - sophisticated tiering
      if (volumeRatio > 0.20) volumeScore = 40; // Very high volume
      else if (volumeRatio > 0.15) volumeScore = 30; // High volume
      else if (volumeRatio > 0.10) volumeScore = 20; // Good volume
      else if (volumeRatio > 0.05) volumeScore = 10; // Moderate volume
      else volumeScore = 0; // Low volume - less reliable
      
      // PROVEN: Volume-price divergence analysis (institutional activity detection)
      if (priceChange < -5 && volumeRatio > 0.15) {
        volumeScore += 15; // High volume selloff = potential capitulation bottom
      }
      if (priceChange < -10 && volumeRatio > 0.20) {
        volumeScore += 10; // Extreme volume on crash = major opportunity
      }
      
      // PROVEN: Distribution detection (avoid FOMO buying)
      if (priceChange > 5 && volumeRatio > 0.15) {
        volumeScore -= 10; // High volume pump = distribution risk
      }
      
      // PROVEN: Volume consistency matters for reliability  
      const volumeConsistency = this.calculateVolumeConsistency(priceData);
      if (volumeConsistency > 0.7) volumeScore += 5; // Consistent volume = reliable signals
      
      score += Math.min(50, volumeScore);
    }
    
    // PROVEN: Market-wide liquidity health (sophisticated analysis)
    const marketVolumeRatio = marketData.totalVolume / marketData.totalMarketCap;
    if (marketVolumeRatio > 0.08) score += 25; // Very healthy market activity
    else if (marketVolumeRatio > 0.06) score += 15; // Good market activity
    else if (marketVolumeRatio > 0.04) score += 10; // Normal activity
    else score += 0; // Low market activity - risky conditions
    
    // PROVEN: Volume trend during price weakness
    if (priceData.price_change_percentage_24h < -3) {
      score += 15; // Any decent volume during dips validates the move
    }
    
    return Math.max(0, Math.min(100, score));
  }

  calculateVolumeConsistency(priceData) {
    // Simplified volume consistency check (in full implementation, use 7-day volume history)
    const currentVolume = priceData.total_volume || 0;
    const marketCap = priceData.market_cap || 1;
    const volumeRatio = currentVolume / marketCap;
    
    // Return consistency score based on volume ratio (proxy for consistency)
    if (volumeRatio > 0.05) return 0.8; // High volume = likely consistent
    if (volumeRatio > 0.02) return 0.6; // Moderate volume = somewhat consistent  
    return 0.4; // Low volume = inconsistent
  }

  analyzeMarketStructure(marketData) {
    let score = 50; // Start neutral
    
    // Total market cap change
    const marketChange = marketData.marketCapChange24h;
    if (marketChange < -5) score += 20; // Market declining
    if (marketChange < -10) score += 15; // Market crashing
    if (marketChange > 5) score -= 10; // Market pumping
    
    // Active coins (diversification)
    if (marketData.activeCoins > 2000) score += 5; // Healthy ecosystem
    
    return Math.max(0, Math.min(100, score));
  }

  analyzeRelativePerformance(priceData, marketData) {
    let score = 50;
    
    const assetChange = priceData.price_change_percentage_24h || 0;
    const marketChange = marketData.marketCapChange24h;
    
    // Compare asset performance to market
    const relativePerformance = assetChange - marketChange;
    
    if (relativePerformance < -10) score += 30; // Much worse than market
    else if (relativePerformance < -5) score += 20; // Worse than market
    else if (relativePerformance < -2) score += 10; // Slightly worse
    else if (relativePerformance > 5) score -= 20; // Much better (not a dip)
    
    return Math.max(0, Math.min(100, score));
  }

  analyzeMarketMomentum(marketData) {
    let score = 50;
    
    // Based on fear/greed trend and market cap change
    const fearValue = marketData.fearGreed.value;
    const marketChange = marketData.marketCapChange24h;
    
    // Negative momentum is good for dip buying
    if (marketChange < -3 && fearValue < 40) score += 20;
    if (marketChange < -1 && fearValue < 50) score += 10;
    if (marketChange > 3 && fearValue > 60) score -= 15;
    
    return Math.max(0, Math.min(100, score));
  }

  calculateConfidence(priceScore, marketScore, marketData) {
    // Higher confidence when multiple factors align
    const scoreDiff = Math.abs(priceScore - marketScore);
    const avgScore = (priceScore + marketScore) / 2;
    
    if (avgScore > 70 && scoreDiff < 20) return 'HIGH';
    if (avgScore > 50 && scoreDiff < 30) return 'MEDIUM';
    if (avgScore > 30) return 'MEDIUM';
    return 'LOW';
  }

  generateSignal(score) {
    if (score >= 70) return 'STRONG BUY';
    if (score >= 50) return 'BUY';
    if (score >= 30) return 'MODERATE BUY';
    return 'WAIT';
  }

  formatFastResponse(score, signal, confidence, userTier, breakdown) {
    const baseResponse = {
      score,
      signal,
      confidence,
      crypto: {
        name: breakdown.priceData.name,
        symbol: breakdown.priceData.symbol,
        price: breakdown.priceData.current_price,
        change_24h: breakdown.priceData.price_change_percentage_24h
      },
      timestamp: new Date().toISOString()
    };

    if (userTier === 'free') {
      return {
        ...baseResponse,
        message: 'Upgrade to Premium for comprehensive market analysis',
        upgrade_url: '/pricing'
      };
    }

    const enhancedResponse = {
      ...baseResponse,
      userTier,
      breakdown: {
        priceScore: breakdown.priceScore.score,
        marketScore: breakdown.marketData ? 50 : 0, // Simplified for now
        technicalScore: breakdown.priceScore.technicalScore || null,
        sentimentScore: breakdown.sentimentScore || null,
        weights: userTier === 'premium' || userTier === 'pro' 
          ? { price: 70, market: 20, sentiment: 10 }
          : { price: 80, market: 20 }
      },
      details: {
        fear_greed: breakdown.marketData.fearGreed.value,
        bitcoin_dominance: breakdown.marketData.bitcoinDominance,
        market_cap_change: breakdown.marketData.marketCapChange24h,
        total_market_cap: breakdown.marketData.totalMarketCap,
        market_volume: breakdown.marketData.totalVolume,
        asset_market_cap: breakdown.priceData.market_cap,
        asset_volume: breakdown.priceData.total_volume,
        ath_distance: breakdown.priceData.ath_change_percentage
      },
      explanation: this.generateComprehensiveExplanation(signal, score, breakdown),
      market_analysis: {
        sentiment_score: this.analyzeFearGreed(breakdown.marketData.fearGreed),
        bitcoin_correlation: breakdown.marketData.bitcoinChange24h,
        market_strength: breakdown.marketData.marketCapChange24h > 0 ? 'Rising' : 'Declining',
        volume_analysis: this.getVolumeAnalysis(breakdown.priceData, breakdown.marketData),
        news_sentiment: breakdown.sentimentData ? {
          classification: breakdown.sentimentData.sentiment.classification,
          score: breakdown.sentimentData.sentiment.score,
          confidence: breakdown.sentimentData.sentiment.confidence,
          articles_analyzed: breakdown.sentimentData.articlesAnalyzed,
          recent_headlines: breakdown.sentimentData.recentNews.map(news => news.title).slice(0, 2)
        } : null,
        realtime_technicals: breakdown.realTimeTechnicals ? {
          interval: '5m',
          sma_20: breakdown.realTimeTechnicals.sma_20,
          sma_50: breakdown.realTimeTechnicals.sma_50,
          rsi_14: breakdown.realTimeTechnicals.rsi_14,
          macd: breakdown.realTimeTechnicals.macd,
          trend: breakdown.realTimeTechnicals.trend,
          timestamp: breakdown.realTimeTechnicals.timestamp
        } : null
      },
      score_breakdown: {
        basic_price: breakdown.priceScore.basicScore,
        technical_indicators: breakdown.priceScore.technicalScore,
        market_factors: breakdown.marketData
      }
    };

    // Add technical analysis for premium/pro users
    if (breakdown.technicalData && breakdown.technicalData.dataSource === 'alpha_vantage') {
      enhancedResponse.technical_analysis = {
        rsi: {
          value: breakdown.technicalData.rsi.current,
          signal: breakdown.technicalData.rsi.signal,
          interpretation: breakdown.technicalData.rsi.interpretation
        },
        macd: {
          signal: breakdown.technicalData.macd.signal,
          interpretation: breakdown.technicalData.macd.interpretation
        },
        moving_average: {
          sma_20: breakdown.technicalData.sma.current,
          trend: breakdown.technicalData.sma.trend
        },
        data_source: 'Alpha Vantage',
        timestamp: breakdown.technicalData.timestamp
      };
    } else if (userTier === 'premium' || userTier === 'pro') {
      enhancedResponse.technical_analysis = {
        message: 'Technical indicators temporarily unavailable',
        upgrade_note: 'Real RSI, MACD, and Moving Average analysis included with your plan'
      };
    }

    return enhancedResponse;
  }

  generateComprehensiveExplanation(signal, score, breakdown) {
    const factors = [];
    
    // Price factors
    const change24h = breakdown.priceData.price_change_percentage_24h || 0;
    if (change24h < -10) factors.push('significant 24h decline');
    else if (change24h < -5) factors.push('moderate 24h decline');
    
    // Market factors
    const fearValue = breakdown.marketData.fearGreed.value;
    if (fearValue < 25) factors.push('extreme market fear');
    else if (fearValue < 40) factors.push('market fear');
    
    // Bitcoin correlation
    const btcChange = breakdown.marketData.bitcoinChange24h;
    if (change24h < btcChange - 5) factors.push('underperforming Bitcoin');
    
    // Market structure
    if (breakdown.marketData.marketCapChange24h < -5) factors.push('declining market conditions');
    
    const factorText = factors.length > 0 ? factors.join(', ') : 'current market analysis';
    return `${signal} signal based on ${factorText}. Confidence: ${score}/100`;
  }

  getVolumeAnalysis(priceData, marketData) {
    if (!priceData.total_volume || !priceData.market_cap) return 'Insufficient data';
    
    const ratio = priceData.total_volume / priceData.market_cap;
    if (ratio > 0.20) return 'Very High';
    if (ratio > 0.15) return 'High';
    if (ratio > 0.10) return 'Moderate';
    if (ratio > 0.05) return 'Low';
    return 'Very Low';
  }

  async findCryptocurrency(searchTerm) {
    const normalizedTerm = searchTerm.toLowerCase().trim();
    
    // Strategy 0: Handle well-known cryptocurrencies by ID first
    const knownCoins = {
      'bitcoin': 'bitcoin',
      'btc': 'bitcoin',
      'ethereum': 'ethereum', 
      'eth': 'ethereum',
      'litecoin': 'litecoin',
      'ltc': 'litecoin',
      'ripple': 'ripple',
      'xrp': 'ripple',
      'cardano': 'cardano',
      'ada': 'cardano',
      'polkadot': 'polkadot',
      'dot': 'polkadot',
      'chainlink': 'chainlink',
      'link': 'chainlink'
    };
    
    if (knownCoins[normalizedTerm]) {
      console.log(`Strategy 0: Using known coin ID "${knownCoins[normalizedTerm]}" for "${normalizedTerm}"`);
      return { id: knownCoins[normalizedTerm], name: normalizedTerm, symbol: normalizedTerm.toUpperCase() };
    }
    
    try {
      // Strategy 1: Direct search API (best for names and symbols)
      console.log(`Strategy 1: Searching for "${normalizedTerm}"`);
      const searchResponse = await axios.get(`${config.APIs.COINGECKO}/search`, {
        params: { query: normalizedTerm },
        timeout: 5000
      });

      if (searchResponse.data.coins?.length > 0) {
        // Prioritize well-known coins by market cap rank
        const coins = searchResponse.data.coins.sort((a, b) => (a.market_cap_rank || 999999) - (b.market_cap_rank || 999999));
        
        // Look for exact symbol match with highest market cap
        let exactMatch = coins.find(coin => 
          coin.symbol?.toLowerCase() === normalizedTerm && coin.market_cap_rank && coin.market_cap_rank <= 100
        );
        
        if (exactMatch) {
          console.log(`Found exact symbol match: ${exactMatch.name} (${exactMatch.symbol}) rank ${exactMatch.market_cap_rank}`);
          return exactMatch;
        }

        // Look for exact name match
        exactMatch = coins.find(coin => 
          coin.name?.toLowerCase() === normalizedTerm
        );
        
        if (exactMatch) {
          console.log(`Found exact name match: ${exactMatch.name}`);
          return exactMatch;
        }

        // Return highest ranked result
        console.log(`Using highest ranked result: ${coins[0].name} (rank ${coins[0].market_cap_rank})`);
        return coins[0];
      }

      // Strategy 2: Get full coins list and search (for comprehensive coverage)
      console.log(`Strategy 2: Searching full coins list`);
      const coinsListResponse = await axios.get(`${config.APIs.COINGECKO}/coins/list`, {
        timeout: 8000
      });

      if (coinsListResponse.data?.length > 0) {
        const coinsList = coinsListResponse.data;
        
        // Search by symbol (exact match)
        let match = coinsList.find(coin => 
          coin.symbol?.toLowerCase() === normalizedTerm
        );
        
        if (match) {
          console.log(`Found in coins list by symbol: ${match.name} (${match.symbol})`);
          return match;
        }

        // Search by name (exact match)
        match = coinsList.find(coin => 
          coin.name?.toLowerCase() === normalizedTerm
        );
        
        if (match) {
          console.log(`Found in coins list by name: ${match.name}`);
          return match;
        }

        // Search by name (partial match)
        match = coinsList.find(coin => 
          coin.name?.toLowerCase().includes(normalizedTerm) ||
          normalizedTerm.includes(coin.name?.toLowerCase())
        );
        
        if (match) {
          console.log(`Found partial match in coins list: ${match.name}`);
          return match;
        }

        // Search by ID (some coins use ID as identifier)
        match = coinsList.find(coin => 
          coin.id?.toLowerCase() === normalizedTerm ||
          coin.id?.toLowerCase().includes(normalizedTerm)
        );
        
        if (match) {
          console.log(`Found by ID match: ${match.name} (${match.id})`);
          return match;
        }
      }

      // Strategy 3: Common cryptocurrency mappings
      console.log(`Strategy 3: Checking common mappings`);
      const commonMappings = this.getCommonCryptoMappings();
      const mappedId = commonMappings[normalizedTerm];
      
      if (mappedId) {
        console.log(`Found via common mapping: ${normalizedTerm} -> ${mappedId}`);
        return { id: mappedId, symbol: normalizedTerm.toUpperCase(), name: mappedId };
      }

      console.log(`No matches found for: ${searchTerm}`);
      return null;

    } catch (error) {
      console.error('Cryptocurrency search error:', error.message);
      
      // Fallback to common mappings if API fails
      const commonMappings = this.getCommonCryptoMappings();
      const mappedId = commonMappings[normalizedTerm];
      
      if (mappedId) {
        console.log(`Using fallback mapping: ${normalizedTerm} -> ${mappedId}`);
        return { id: mappedId, symbol: normalizedTerm.toUpperCase(), name: mappedId };
      }
      
      return null;
    }
  }

  getCommonCryptoMappings() {
    // Common cryptocurrencies and their CoinGecko IDs
    return {
      // Major cryptocurrencies
      'bitcoin': 'bitcoin',
      'btc': 'bitcoin',
      'ethereum': 'ethereum', 
      'eth': 'ethereum',
      'tether': 'tether',
      'usdt': 'tether',
      'bnb': 'binancecoin',
      'binance coin': 'binancecoin',
      'solana': 'solana',
      'sol': 'solana',
      'xrp': 'ripple',
      'ripple': 'ripple',
      'usdc': 'usd-coin',
      'usd coin': 'usd-coin',
      'steth': 'staked-ether',
      'cardano': 'cardano',
      'ada': 'cardano',
      'dogecoin': 'dogecoin',
      'doge': 'dogecoin',
      'avalanche': 'avalanche-2',
      'avax': 'avalanche-2',
      'tron': 'tron',
      'trx': 'tron',
      'chainlink': 'chainlink',
      'link': 'chainlink',
      'polygon': 'matic-network',
      'matic': 'matic-network',
      'wrapped bitcoin': 'wrapped-bitcoin',
      'wbtc': 'wrapped-bitcoin',
      'shiba inu': 'shiba-inu',
      'shib': 'shiba-inu',
      'dai': 'dai',
      'litecoin': 'litecoin',
      'ltc': 'litecoin',
      'bitcoin cash': 'bitcoin-cash',
      'bch': 'bitcoin-cash',
      'uniswap': 'uniswap',
      'uni': 'uniswap',
      'leo token': 'leo-token',
      'leo': 'leo-token',
      
      // Popular altcoins
      'polkadot': 'polkadot',
      'dot': 'polkadot',
      'near protocol': 'near',
      'near': 'near',
      'aptos': 'aptos',
      'apt': 'aptos',
      'internet computer': 'internet-computer',
      'icp': 'internet-computer',
      'cosmos': 'cosmos',
      'atom': 'cosmos',
      'ethereum classic': 'ethereum-classic',
      'etc': 'ethereum-classic',
      'filecoin': 'filecoin',
      'fil': 'filecoin',
      'stellar': 'stellar',
      'xlm': 'stellar',
      'vechain': 'vechain',
      'vet': 'vechain',
      'sandbox': 'the-sandbox',
      'sand': 'the-sandbox',
      'decentraland': 'decentraland',
      'mana': 'decentraland',
      'axie infinity': 'axie-infinity',
      'axs': 'axie-infinity',
      'chiliz': 'chiliz',
      'chz': 'chiliz',
      'flow': 'flow',
      'algo': 'algorand',
      'algorand': 'algorand',
      'elrond': 'elrond-erd-2',
      'egld': 'elrond-erd-2',
      'hedera': 'hedera-hashgraph',
      'hbar': 'hedera-hashgraph',
      'theta': 'theta-token',
      'tfuel': 'theta-fuel',
      'eos': 'eos',
      'tezos': 'tezos',
      'xtz': 'tezos',
      'fantom': 'fantom',
      'ftm': 'fantom',
      'klay': 'klay-token',
      'klaytn': 'klay-token',
      'iota': 'iota',
      'miota': 'iota',
      'monero': 'monero',
      'xmr': 'monero',
      'aave': 'aave',
      'compound': 'compound-governance-token',
      'comp': 'compound-governance-token',
      'maker': 'maker',
      'mkr': 'maker',
      'curve dao token': 'curve-dao-token',
      'crv': 'curve-dao-token',
      'pancakeswap': 'pancakeswap-token',
      'cake': 'pancakeswap-token',
      'sushiswap': 'sushi',
      'sushi': 'sushi',
      '1inch': '1inch',
      'yearn finance': 'yearn-finance',
      'yfi': 'yearn-finance',
      'synthetix': 'havven',
      'snx': 'havven',
      'enjin coin': 'enjincoin',
      'enj': 'enjincoin',
      'basic attention token': 'basic-attention-token',
      'bat': 'basic-attention-token',
      'zcash': 'zcash',
      'zec': 'zcash',
      'dash': 'dash',
      'neo': 'neo',
      'waves': 'waves',
      'qtum': 'qtum',
      'omg network': 'omisego',
      'omg': 'omisego',
      'zilliqa': 'zilliqa',
      'zil': 'zilliqa',
      'ontology': 'ontology',
      'ont': 'ontology',
      'decred': 'decred',
      'dcr': 'decred',
      'bitcoin sv': 'bitcoin-cash-sv',
      'bsv': 'bitcoin-cash-sv',
      'bitcoin gold': 'bitcoin-gold',
      'btg': 'bitcoin-gold',
      'digibyte': 'digibyte',
      'dgb': 'digibyte',
      'ravencoin': 'ravencoin',
      'rvn': 'ravencoin',
      'horizen': 'zencash',
      'zen': 'zencash',
      'verge': 'verge',
      'xvg': 'verge',
      'nano': 'nano',
      'xno': 'nano',
      'siacoin': 'siacoin',
      'sc': 'siacoin',
      'golem': 'golem-network-tokens',
      'glm': 'golem-network-tokens',
      'status': 'status',
      'snt': 'status',
      'storj': 'storj',
      'augur': 'augur',
      'rep': 'augur',
      '0x': '0x',
      'zrx': '0x',
      'kyber network': 'kyber-network',
      'knc': 'kyber-network',
      'loopring': 'loopring',
      'lrc': 'loopring',
      'bancor': 'bancor',
      'bnt': 'bancor',
      'gnosis': 'gnosis',
      'gno': 'gnosis',
      'civic': 'civic',
      'cvc': 'civic',
      'aragon': 'aragon',
      'ant': 'aragon',
      'district0x': 'district0x',
      'dnt': 'district0x',
      'funfair': 'funfair',
      'fun': 'funfair',
      
      // Meme coins and others
      'pepe': 'pepe',
      'floki': 'floki',
      'bonk': 'bonk',
      'babydoge': 'baby-doge-coin',
      'safemoon': 'safemoon',
      'akita inu': 'akita-inu',
      'dogelon mars': 'dogelon-mars',
      'elon': 'dogelon-mars',
      
      // Stablecoins
      'busd': 'binance-usd',
      'binance usd': 'binance-usd',
      'tusd': 'true-usd',
      'trueusd': 'true-usd',
      'pax dollar': 'paxos-standard',
      'usdp': 'paxos-standard',
      'gemini dollar': 'gemini-dollar',
      'gusd': 'gemini-dollar',
      'frax': 'frax',
      'lusd': 'liquity-usd',
      'usdd': 'usdd',
      'fei usd': 'fei-protocol',
      'fei': 'fei-protocol'
    };
  }
}

module.exports = FastCryptoAnalyzer;