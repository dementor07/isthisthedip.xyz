const axios = require('axios');
const config = require('./config');

class CryptoAnalyzer {
  constructor(db) {
    this.db = db;
  }

  async calculateAdvancedDipScore(crypto, userTier = 'free') {
    try {
      // Get essential data first (fast APIs)
      const [priceData, fearGreed] = await Promise.all([
        this.getCoinGeckoData(crypto),
        this.getFearGreedIndex()
      ]);

      // Get slower APIs with timeout protection
      const [technicals, news] = await Promise.allSettled([
        Promise.race([
          this.getAlphaVantageTechnicals(crypto),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]),
        Promise.race([
          this.getCryptoNews(crypto),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ])
      ]);

      // Calculate individual scores with fallbacks
      const techData = technicals.status === 'fulfilled' ? technicals.value : {};
      const newsData = news.status === 'fulfilled' ? news.value : [];
      
      const technicalScore = this.analyzeTechnicals(techData, priceData);
      const sentimentScore = await this.analyzeNewsSentiment(newsData);
      const marketScore = this.analyzeMarketConditions(priceData, fearGreed);
      const volumeScore = this.analyzeVolumeProfile(priceData);

      // Weighted ensemble scoring
      const weights = {
        technical: 0.35,
        sentiment: 0.25,
        market: 0.25,
        volume: 0.15
      };

      const finalScore = Math.round(
        technicalScore * weights.technical +
        sentimentScore * weights.sentiment +
        marketScore * weights.market +
        volumeScore * weights.volume
      );

      const confidence = this.calculateConfidence([technicalScore, sentimentScore, marketScore, volumeScore]);
      const signal = this.generateSignal(finalScore);
      
      return this.formatResponse(finalScore, signal, confidence, userTier, {
        technical: technicalScore,
        sentiment: sentimentScore,
        market: marketScore,
        volume: volumeScore,
        priceData,
        fearGreed: fearGreed.value
      });

    } catch (error) {
      console.error('Analysis error:', error);
      throw new Error('Unable to analyze cryptocurrency at this time');
    }
  }

  async getCoinGeckoData(crypto) {
    // Check cache first for faster subsequent searches
    const cacheKey = `crypto_data:${crypto.toLowerCase()}`;
    const cached = this.cache ? this.cache.get(cacheKey) : null;
    
    if (cached) {
      console.log(`Cache HIT: ${cacheKey}`);
      return cached;
    }
    
    await this.db.incrementAPIUsage('coingecko');
    
    try {
      // Check search cache for coin ID
      const searchCacheKey = `search_results:${crypto.toLowerCase()}`;
      let coin = this.cache ? this.cache.get(searchCacheKey) : null;
      
      if (!coin) {
        // Get coin ID from API
        const searchResponse = await axios.get(`${config.APIs.COINGECKO}/search`, {
          params: { query: crypto },
          timeout: 10000
        });

        coin = searchResponse.data.coins?.[0];
        if (!coin) throw new Error('Cryptocurrency not found');
        
        // Cache the search result
        if (this.cache) {
          this.cache.set(searchCacheKey, coin, 'search_results');
        }
      }

      if (!coin) throw new Error('Cryptocurrency not found');

      // Get detailed price data
      const [priceResponse, marketResponse] = await Promise.all([
        axios.get(`${config.APIs.COINGECKO}/coins/${coin.id}`, {
          params: { 
            localization: false,
            tickers: false,
            market_data: true,
            community_data: false,
            developer_data: false
          }
        }),
        axios.get(`${config.APIs.COINGECKO}/coins/${coin.id}/market_chart`, {
          params: {
            vs_currency: 'usd',
            days: '30'
          }
        })
      ]);

      const marketData = priceResponse.data.market_data;
      return {
        id: coin.id,
        name: priceResponse.data.name,
        symbol: priceResponse.data.symbol?.toUpperCase(),
        current_price: marketData.current_price?.usd || 0,
        price_change_percentage_24h: marketData.price_change_percentage_24h || 0,
        price_change_percentage_7d: marketData.price_change_percentage_7d || 0,
        price_change_percentage_30d: marketData.price_change_percentage_30d || 0,
        market_cap: marketData.market_cap?.usd || 0,
        total_volume: marketData.total_volume?.usd || 0,
        high_24h: marketData.high_24h?.usd || 0,
        low_24h: marketData.low_24h?.usd || 0,
        ath: marketData.ath?.usd || 0,
        ath_change_percentage: marketData.ath_change_percentage?.usd || 0,
        price_history: marketResponse.data.prices || []
      };

      // Cache the result for faster subsequent searches
      if (this.cache) {
        this.cache.set(cacheKey, result, 'crypto_data');
        console.log(`Cache SET: ${cacheKey}`);
      }

      return result;
    } catch (error) {
      console.error('CoinGecko API error:', error.message);
      throw new Error('Unable to fetch price data');
    }
  }

  async getAlphaVantageTechnicals(crypto) {
    if (!config.API_KEYS.ALPHA_VANTAGE) return {};
    
    await this.db.incrementAPIUsage('alpha_vantage');
    
    try {
      const symbol = `${crypto.toUpperCase()}USD`;
      
      const [rsiResponse, macdResponse, smaResponse] = await Promise.all([
        axios.get(config.APIs.ALPHA_VANTAGE, {
          params: {
            function: 'RSI',
            symbol,
            interval: 'daily',
            time_period: 14,
            series_type: 'close',
            apikey: config.API_KEYS.ALPHA_VANTAGE
          }
        }),
        axios.get(config.APIs.ALPHA_VANTAGE, {
          params: {
            function: 'MACD',
            symbol,
            interval: 'daily',
            series_type: 'close',
            apikey: config.API_KEYS.ALPHA_VANTAGE
          }
        }),
        axios.get(config.APIs.ALPHA_VANTAGE, {
          params: {
            function: 'SMA',
            symbol,
            interval: 'daily',
            time_period: 20,
            series_type: 'close',
            apikey: config.API_KEYS.ALPHA_VANTAGE
          }
        })
      ]);

      return {
        rsi: rsiResponse.data['Technical Analysis: RSI'],
        macd: macdResponse.data['Technical Analysis: MACD'],
        sma20: smaResponse.data['Technical Analysis: SMA']
      };
    } catch (error) {
      console.error('Alpha Vantage API error:', error.message);
      return {};
    }
  }

  async getCryptoNews(crypto) {
    if (!config.API_KEYS.NEWS_API) return [];
    
    await this.db.incrementAPIUsage('news_api');
    
    try {
      const response = await axios.get(config.APIs.NEWS_API, {
        params: {
          q: `${crypto} cryptocurrency`,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 10,
          apiKey: config.API_KEYS.NEWS_API
        }
      });

      return response.data.articles?.slice(0, 5) || [];
    } catch (error) {
      console.error('News API error:', error.message);
      return [];
    }
  }

  async getFearGreedIndex() {
    try {
      const response = await axios.get(`${config.APIs.FEAR_GREED}?limit=1`, {
        timeout: 3000
      });
      return {
        value: parseInt(response.data.data?.[0]?.value || 50),
        classification: response.data.data?.[0]?.value_classification || 'Neutral'
      };
    } catch (error) {
      console.error('Fear & Greed API error:', error.message);
      return { value: 50, classification: 'Neutral' };
    }
  }

  async analyzeNewsSentiment(articles) {
    if (!articles.length || !config.API_KEYS.HUGGING_FACE) return 50;
    
    await this.db.incrementAPIUsage('hugging_face');
    
    try {
      const headlines = articles.slice(0, 2).map(article => 
        article.title || article.headline || ''
      ).filter(Boolean);
      
      if (!headlines.length) return 50;

      // Use Promise.allSettled with timeout for sentiment analysis
      const sentimentPromises = headlines.map(headline =>
        Promise.race([
          axios.post(config.APIs.HUGGING_FACE, {
            inputs: headline
          }, {
            headers: {
              'Authorization': `Bearer ${config.API_KEYS.HUGGING_FACE}`,
              'Content-Type': 'application/json'
            },
            timeout: 5000
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Sentiment timeout')), 5000))
        ])
      );

      const responses = await Promise.allSettled(sentimentPromises);
      let totalScore = 0;
      let validResponses = 0;

      responses.forEach(response => {
        if (response.status === 'fulfilled') {
          const sentiment = response.value.data?.[0];
          if (sentiment) {
            validResponses++;
            if (sentiment.label === 'positive') {
              totalScore += sentiment.score * 100;
            } else if (sentiment.label === 'negative') {
              totalScore += (1 - sentiment.score) * 100;
            } else {
              totalScore += 50;
            }
          }
        }
      });

      return validResponses > 0 ? Math.round(totalScore / validResponses) : 50;
    } catch (error) {
      console.error('Sentiment analysis error:', error.message);
      return 50;
    }
  }

  analyzeTechnicals(data, priceData) {
    let score = 0;

    try {
      // RSI Analysis (0-100)
      const rsiData = data.rsi;
      if (rsiData) {
        const rsiValues = Object.values(rsiData);
        if (rsiValues.length === 0) {
          throw new Error('No RSI data available');
        }
        const latestRSI = parseFloat(rsiValues[0]) || 50;
        
        if (latestRSI < 30) score += 25; // Oversold
        if (latestRSI < 25) score += 15; // Extremely oversold
        if (latestRSI > 70) score -= 15; // Overbought
      }

      // Price change analysis
      const change24h = priceData.price_change_percentage_24h || 0;
      const change7d = priceData.price_change_percentage_7d || 0;
      
      if (change24h < -5) score += 20;
      if (change24h < -10) score += 15;
      if (change7d < -15) score += 20;
      
      // ATH distance analysis
      const athDistance = priceData.ath_change_percentage || 0;
      if (athDistance < -50) score += 25;
      if (athDistance < -30) score += 15;

      // Volume analysis
      if (priceData.total_volume > 0 && priceData.market_cap > 0) {
        const volumeRatio = priceData.total_volume / priceData.market_cap;
        if (volumeRatio > 0.1) score += 10; // High volume
      }

    } catch (error) {
      console.error('Technical analysis error:', error);
    }

    return Math.max(0, Math.min(100, score));
  }

  analyzeMarketConditions(priceData, fearGreed) {
    let score = 0;

    // Fear & Greed Index contribution
    if (fearGreed.value < 25) score += 30; // Extreme Fear
    if (fearGreed.value < 40) score += 20; // Fear
    if (fearGreed.value > 75) score -= 20; // Extreme Greed

    // Market cap considerations
    if (priceData.market_cap < 1000000000) { // Under 1B market cap
      score += 5; // Smaller caps have more upside potential
    }

    return Math.max(0, Math.min(100, score));
  }

  analyzeVolumeProfile(priceData) {
    let score = 0;

    try {
      if (priceData.total_volume && priceData.market_cap) {
        const volumeRatio = priceData.total_volume / priceData.market_cap;
        
        if (volumeRatio > 0.15) score += 25; // Very high volume
        else if (volumeRatio > 0.10) score += 15; // High volume
        else if (volumeRatio > 0.05) score += 10; // Moderate volume
        
        // If price is down but volume is high, it's a good sign
        const priceChange = priceData.price_change_percentage_24h || 0;
        if (priceChange < -5 && volumeRatio > 0.10) {
          score += 15; // High volume on dip
        }
      }
    } catch (error) {
      console.error('Volume analysis error:', error);
    }

    return Math.max(0, Math.min(100, score));
  }

  calculateConfidence(scores) {
    const validScores = scores.filter(s => !isNaN(s) && s > 0);
    if (validScores.length === 0) return 'LOW';
    
    const variance = this.calculateVariance(validScores);
    const avgScore = validScores.reduce((a, b) => a + b) / validScores.length;
    
    if (variance < 400 && avgScore > 60) return 'HIGH';
    if (variance < 600 && avgScore > 40) return 'MEDIUM';
    return 'LOW';
  }

  calculateVariance(scores) {
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    return scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  }

  generateSignal(score) {
    if (score >= 70) return 'STRONG BUY';
    if (score >= 50) return 'BUY';
    if (score >= 30) return 'MODERATE BUY';
    return 'WAIT';
  }

  formatResponse(score, signal, confidence, userTier, breakdown) {
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
        message: 'Upgrade to Premium for detailed analysis',
        upgrade_url: '/pricing'
      };
    }

    // Premium and Pro features
    return {
      ...baseResponse,
      breakdown: {
        technical: breakdown.technical,
        sentiment: breakdown.sentiment,
        market: breakdown.market,
        volume: breakdown.volume
      },
      details: {
        fear_greed: breakdown.fearGreed,
        market_cap: breakdown.priceData.market_cap,
        volume_24h: breakdown.priceData.total_volume,
        ath_distance: breakdown.priceData.ath_change_percentage
      },
      explanation: this.generateExplanation(score, signal, breakdown),
      recommendations: this.generateRecommendations(score, breakdown)
    };
  }

  generateExplanation(score, signal, breakdown) {
    const reasons = [];
    
    if (breakdown.technical > 60) reasons.push("strong technical indicators");
    if (breakdown.sentiment > 60) reasons.push("positive market sentiment");
    if (breakdown.market > 60) reasons.push("favorable market conditions");
    if (breakdown.fearGreed < 30) reasons.push("extreme fear in the market");
    
    const change = breakdown.priceData.price_change_percentage_24h;
    if (change < -10) reasons.push(`significant 24h drop of ${change.toFixed(1)}%`);
    
    return `${signal} signal generated due to ${reasons.join(", ")}.`;
  }

  generateRecommendations(score, breakdown) {
    const recommendations = [];
    
    if (score >= 70) {
      recommendations.push("Consider dollar-cost averaging into this position");
      recommendations.push("This appears to be a significant buying opportunity");
    } else if (score >= 50) {
      recommendations.push("Wait for additional confirmation signals");
      recommendations.push("Consider a smaller position size");
    } else {
      recommendations.push("Monitor for further price action");
      recommendations.push("Wait for better entry opportunities");
    }
    
    return recommendations;
  }
}

module.exports = CryptoAnalyzer;