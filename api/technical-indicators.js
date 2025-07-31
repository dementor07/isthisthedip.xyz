const axios = require('axios');
const config = require('./config');

class TechnicalIndicators {
  constructor(cache) {
    this.cache = cache;
    this.apiKey = config.API_KEYS.ALPHA_VANTAGE;
    this.baseUrl = config.APIs.ALPHA_VANTAGE;
    this.dailyCallCount = 0;
    this.maxDailyCalls = 20; // Free tier limit: 25 requests/day, buffer of 5
  }

  canMakeCall() {
    return this.dailyCallCount < this.maxDailyCalls && this.apiKey;
  }

  incrementCallCount() {
    this.dailyCallCount++;
    console.log(`Alpha Vantage calls today: ${this.dailyCallCount}/${this.maxDailyCalls}`);
  }

  async getTechnicalIndicators(cryptoSymbol) {
    if (!this.canMakeCall()) {
      console.log(`Alpha Vantage: Daily limit reached (${this.dailyCallCount}/${this.maxDailyCalls}) or no API key`);
      return this.getDefaultTechnicalIndicators(cryptoSymbol);
    }

    const symbol = this.normalizeCryptoSymbol(cryptoSymbol);
    const cacheKey = `technical_${symbol}`;

    return await this.cache.fetchWithCache('technical_indicators', async () => {
      try {
        console.log(`API CALL: Fetching technical indicators for ${symbol}`);
        
        // Get multiple indicators in parallel
        const [rsiData, macdData, smaData] = await Promise.all([
          this.getRSI(symbol),
          this.getMACD(symbol),
          this.getSMA(symbol)
        ]);

        const indicators = {
          symbol,
          rsi: this.parseRSI(rsiData),
          macd: this.parseMACD(macdData),
          sma: this.parseSMA(smaData),
          timestamp: new Date().toISOString(),
          dataSource: 'alpha_vantage'
        };

        console.log(`✅ Technical indicators for ${symbol}:`, {
          rsi: indicators.rsi.current,
          macd: indicators.macd.signal,
          sma: indicators.sma
        });

        return indicators;

      } catch (error) {
        console.error(`❌ Alpha Vantage error for ${symbol}:`, error.message);
        
        // Check if it's a rate limit error
        if (error.response?.data?.Information?.includes('rate limit')) {
          console.log('⚠️  Alpha Vantage rate limit exceeded, using fallback data');
          this.dailyCallCount = this.maxDailyCalls; // Mark as exhausted
        }
        
        return this.getDefaultTechnicalIndicators(symbol);
      }
    }, { symbol });
  }

  async getRSI(symbol, timePeriod = 14) {
    if (!this.canMakeCall()) return null;

    this.incrementCallCount();
    
    const response = await axios.get(this.baseUrl, {
      params: {
        function: 'RSI',
        symbol: symbol,
        interval: 'daily',
        time_period: timePeriod,
        series_type: 'close',
        apikey: this.apiKey
      },
      timeout: 8000
    });

    return response.data;
  }

  async getMACD(symbol) {
    if (!this.canMakeCall()) return null;

    this.incrementCallCount();

    const response = await axios.get(this.baseUrl, {
      params: {
        function: 'MACD',
        symbol: symbol,
        interval: 'daily',
        series_type: 'close',
        apikey: this.apiKey
      },
      timeout: 8000
    });

    return response.data;
  }

  async getSMA(symbol, timePeriod = 20) {
    if (!this.canMakeCall()) return null;

    this.incrementCallCount();

    const response = await axios.get(this.baseUrl, {
      params: {
        function: 'SMA',
        symbol: symbol,
        interval: 'daily',
        time_period: timePeriod,
        series_type: 'close',
        apikey: this.apiKey
      },
      timeout: 8000
    });

    return response.data;
  }

  parseRSI(rsiData) {
    try {
      if (!rsiData || rsiData['Error Message'] || !rsiData['Technical Analysis: RSI']) {
        return { current: 50, signal: 'neutral', reliability: 'low' };
      }

      const timeSeries = rsiData['Technical Analysis: RSI'];
      const dates = Object.keys(timeSeries).sort((a, b) => new Date(b) - new Date(a));
      
      if (dates.length === 0) {
        return { current: 50, signal: 'neutral', reliability: 'low' };
      }

      const currentRSI = parseFloat(timeSeries[dates[0]]['RSI']);
      const previousRSI = dates.length > 1 ? parseFloat(timeSeries[dates[1]]['RSI']) : currentRSI;

      return {
        current: currentRSI,
        previous: previousRSI,
        trend: currentRSI > previousRSI ? 'rising' : 'falling',
        signal: this.getRSISignal(currentRSI),
        reliability: 'high',
        interpretation: this.getRSIInterpretation(currentRSI)
      };
    } catch (error) {
      console.error('RSI parsing error:', error);
      return { current: 50, signal: 'neutral', reliability: 'low' };
    }
  }

  parseMACD(macdData) {
    try {
      if (!macdData || macdData['Error Message'] || !macdData['Technical Analysis: MACD']) {
        return { macd: 0, signal: 'neutral', histogram: 0, reliability: 'low' };
      }

      const timeSeries = macdData['Technical Analysis: MACD'];
      const dates = Object.keys(timeSeries).sort((a, b) => new Date(b) - new Date(a));
      
      if (dates.length < 2) {
        return { macd: 0, signal: 'neutral', histogram: 0, reliability: 'low' };
      }

      const current = timeSeries[dates[0]];
      const previous = timeSeries[dates[1]];

      const currentMACD = parseFloat(current['MACD']);
      const currentSignal = parseFloat(current['MACD_Signal']);
      const currentHistogram = parseFloat(current['MACD_Hist']);
      
      const previousHistogram = parseFloat(previous['MACD_Hist']);

      return {
        macd: currentMACD,
        signalLine: currentSignal,
        histogram: currentHistogram,
        previousHistogram: previousHistogram,
        signal: this.getMACDSignal(currentHistogram, previousHistogram),
        reliability: 'high',
        interpretation: this.getMACDInterpretation(currentHistogram, previousHistogram)
      };
    } catch (error) {
      console.error('MACD parsing error:', error);
      return { macd: 0, signal: 'neutral', histogram: 0, reliability: 'low' };
    }
  }

  parseSMA(smaData) {
    try {
      if (!smaData || smaData['Error Message'] || !smaData['Technical Analysis: SMA']) {
        return { current: 0, signal: 'neutral', reliability: 'low' };
      }

      const timeSeries = smaData['Technical Analysis: SMA'];
      const dates = Object.keys(timeSeries).sort((a, b) => new Date(b) - new Date(a));
      
      if (dates.length === 0) {
        return { current: 0, signal: 'neutral', reliability: 'low' };
      }

      const currentSMA = parseFloat(timeSeries[dates[0]]['SMA']);
      const previousSMA = dates.length > 1 ? parseFloat(timeSeries[dates[1]]['SMA']) : currentSMA;

      return {
        current: currentSMA,
        previous: previousSMA,
        trend: currentSMA > previousSMA ? 'rising' : 'falling',
        reliability: 'high'
      };
    } catch (error) {
      console.error('SMA parsing error:', error);
      return { current: 0, signal: 'neutral', reliability: 'low' };
    }
  }

  getRSISignal(rsi) {
    if (rsi <= 20) return 'extremely_oversold';
    if (rsi <= 30) return 'oversold';
    if (rsi <= 40) return 'bearish';
    if (rsi >= 80) return 'extremely_overbought';
    if (rsi >= 70) return 'overbought';
    if (rsi >= 60) return 'bullish';
    return 'neutral';
  }

  getRSIInterpretation(rsi) {
    if (rsi <= 20) return 'Extreme oversold - strong buy signal';
    if (rsi <= 30) return 'Oversold - potential buy opportunity';
    if (rsi <= 40) return 'Bearish momentum - wait for confirmation';
    if (rsi >= 80) return 'Extremely overbought - avoid buying';
    if (rsi >= 70) return 'Overbought - poor buying opportunity';
    if (rsi >= 60) return 'Bullish momentum - neutral to positive';
    return 'Neutral territory - no strong signals';
  }

  getMACDSignal(currentHist, previousHist) {
    if (currentHist > 0 && previousHist <= 0) return 'bullish_crossover';
    if (currentHist < 0 && previousHist >= 0) return 'bearish_crossover';
    if (currentHist > previousHist && currentHist > 0) return 'bullish_momentum';
    if (currentHist < previousHist && currentHist < 0) return 'bearish_momentum';
    return 'neutral';
  }

  getMACDInterpretation(currentHist, previousHist) {
    const signal = this.getMACDSignal(currentHist, previousHist);
    
    switch (signal) {
      case 'bullish_crossover': return 'MACD crossed above signal - buy signal';
      case 'bearish_crossover': return 'MACD crossed below signal - sell signal';
      case 'bullish_momentum': return 'MACD gaining upward momentum';
      case 'bearish_momentum': return 'MACD gaining downward momentum';
      default: return 'MACD showing no clear directional signal';
    }
  }

  calculateTechnicalScore(indicators, currentPrice) {
    let score = 0;
    let maxScore = 100;
    
    // RSI Analysis (40% of technical score)
    const rsiScore = this.scoreRSI(indicators.rsi);
    score += rsiScore * 0.4;
    
    // MACD Analysis (35% of technical score)  
    const macdScore = this.scoreMACD(indicators.macd);
    score += macdScore * 0.35;
    
    // SMA Analysis (25% of technical score)
    const smaScore = this.scoreSMA(indicators.sma, currentPrice);
    score += smaScore * 0.25;

    console.log(`Technical Score Breakdown: RSI=${rsiScore}, MACD=${macdScore}, SMA=${smaScore}, Final=${Math.round(score)}`);
    
    return Math.max(0, Math.min(maxScore, Math.round(score)));
  }

  scoreRSI(rsi) {
    if (rsi.reliability === 'low') return 50; // Neutral if no data
    
    const value = rsi.current;
    
    if (value <= 20) return 90; // Extremely oversold - excellent buy
    if (value <= 30) return 80; // Oversold - very good buy
    if (value <= 40) return 65; // Bearish but not extreme
    if (value <= 50) return 55; // Slightly bearish
    if (value <= 60) return 45; // Slightly bullish  
    if (value <= 70) return 30; // Overbought - poor buy
    if (value <= 80) return 15; // Very overbought - bad buy
    return 5; // Extremely overbought - worst buy
  }

  scoreMACD(macd) {
    if (macd.reliability === 'low') return 50; // Neutral if no data
    
    switch (macd.signal) {
      case 'bullish_crossover': return 85; // Strong buy signal
      case 'bullish_momentum': return 70;  // Good momentum
      case 'bearish_crossover': return 15; // Strong sell signal
      case 'bearish_momentum': return 30;  // Weak momentum
      default: return 50; // Neutral
    }
  }

  scoreSMA(sma, currentPrice) {
    if (sma.reliability === 'low' || !currentPrice || sma.current === 0) return 50;
    
    const priceVsSMA = ((currentPrice - sma.current) / sma.current) * 100;
    
    // Price significantly below SMA = good buy opportunity
    if (priceVsSMA <= -15) return 85; // Very oversold vs moving average
    if (priceVsSMA <= -10) return 75; // Oversold vs moving average
    if (priceVsSMA <= -5) return 65;  // Moderately oversold
    if (priceVsSMA <= 0) return 55;   // Below moving average
    if (priceVsSMA <= 5) return 45;   // Slightly above moving average
    if (priceVsSMA <= 10) return 35;  // Above moving average
    return 25; // Significantly above moving average - poor buy
  }

  normalizeCryptoSymbol(crypto) {
    // Convert crypto names/symbols to Alpha Vantage format
    const symbolMap = {
      'bitcoin': 'BTCUSD',
      'btc': 'BTCUSD',
      'ethereum': 'ETHUSD',
      'eth': 'ETHUSD',
      'litecoin': 'LTCUSD',
      'ltc': 'LTCUSD',
      'bitcoin-cash': 'BCHUSD',
      'bch': 'BCHUSD',
      'eos': 'EOSUSD',
      'xrp': 'XRPUSD',
      'ripple': 'XRPUSD'
    };

    const normalized = crypto.toLowerCase().replace(/\s+/g, '-');
    return symbolMap[normalized] || `${crypto.toUpperCase()}USD`;
  }

  getDefaultTechnicalIndicators(symbol = 'UNKNOWN') {
    return {
      symbol,
      rsi: { current: 50, signal: 'neutral', reliability: 'low' },
      macd: { macd: 0, signal: 'neutral', histogram: 0, reliability: 'low' },
      sma: { current: 0, signal: 'neutral', reliability: 'low' },
      timestamp: new Date().toISOString(),
      dataSource: 'fallback'
    };
  }

  getCallStats() {
    return {
      dailyCalls: this.dailyCallCount,
      maxDailyCalls: this.maxDailyCalls,
      remaining: this.maxDailyCalls - this.dailyCallCount,
      hasApiKey: !!this.apiKey
    };
  }
}

module.exports = TechnicalIndicators;