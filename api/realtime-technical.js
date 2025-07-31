class RealTimeTechnical {
  constructor(streamer) {
    this.streamer = streamer;
    this.priceBuffers = new Map(); // symbol -> time-based price buckets
    this.intervals = ['1s', '5s', '15s', '1m', '5m', '15m', '1h']; // Supported timeframes
    this.maxBufferSize = 200; // Keep last 200 periods per timeframe
  }

  // Subscribe to real-time technical updates
  subscribeToTechnicals(symbol, callback, interval = '5m') {
    const normalizedSymbol = symbol.toLowerCase();
    
    // Subscribe to price updates from streamer
    return this.streamer.subscribe(normalizedSymbol, (priceData) => {
      this.updatePriceBuffer(normalizedSymbol, priceData, interval);
      
      // Calculate technical indicators
      const technicals = this.calculateIntradayTechnicals(normalizedSymbol, interval);
      
      if (technicals) {
        callback({
          symbol: symbol.toUpperCase(),
          interval,
          ...technicals,
          timestamp: Date.now()
        });
      }
    });
  }

  updatePriceBuffer(symbol, priceData, interval) {
    const key = `${symbol}_${interval}`;
    
    if (!this.priceBuffers.has(key)) {
      this.priceBuffers.set(key, []);
    }
    
    const buffer = this.priceBuffers.get(key);
    const intervalMs = this.getIntervalMs(interval);
    const currentTime = priceData.timestamp;
    const bucketTime = Math.floor(currentTime / intervalMs) * intervalMs;
    
    // Find or create current time bucket
    let currentBucket = buffer.find(bucket => bucket.timestamp === bucketTime);
    
    if (!currentBucket) {
      currentBucket = {
        timestamp: bucketTime,
        open: priceData.price,
        high: priceData.price,
        low: priceData.price,
        close: priceData.price,
        volume: 0,
        trades: 0
      };
      buffer.push(currentBucket);
      
      // Keep buffer size manageable
      if (buffer.length > this.maxBufferSize) {
        buffer.splice(0, buffer.length - this.maxBufferSize);
      }
    }
    
    // Update OHLC data
    currentBucket.high = Math.max(currentBucket.high, priceData.price);
    currentBucket.low = Math.min(currentBucket.low, priceData.price);
    currentBucket.close = priceData.price;
    currentBucket.volume += (priceData.volume24h || 0) / (24 * 60); // Approximate per-minute volume
    currentBucket.trades += 1;
  }

  calculateIntradayTechnicals(symbol, interval = '5m') {
    const key = `${symbol}_${interval}`;
    const buffer = this.priceBuffers.get(key);
    
    // Adjust minimum periods based on timeframe
    const minPeriods = this.getMinimumPeriods(interval);
    
    if (!buffer || buffer.length < minPeriods) {
      return null; // Need sufficient periods for meaningful analysis
    }
    
    const closes = buffer.map(candle => candle.close);
    const volumes = buffer.map(candle => candle.volume);
    const highs = buffer.map(candle => candle.high);
    const lows = buffer.map(candle => candle.low);
    
    // Adjust indicator periods based on timeframe
    const periods = this.getOptimalPeriods(interval, buffer.length);
    
    return {
      price: closes[closes.length - 1],
      sma_fast: this.calculateSMA(closes, periods.sma_fast),
      sma_slow: this.calculateSMA(closes, periods.sma_slow),
      ema_fast: this.calculateEMA(closes, periods.ema_fast),
      ema_slow: this.calculateEMA(closes, periods.ema_slow),
      rsi: this.calculateRSI(closes, periods.rsi),
      macd: this.calculateOptimizedMACD(closes, periods),
      bb: this.calculateBollingerBands(closes, periods.bb),
      volume_sma: this.calculateSMA(volumes, periods.volume),
      stoch: this.calculateStochastic(highs, lows, closes, periods.stoch),
      atr: this.calculateATR(highs, lows, closes, periods.atr),
      trend: this.determineTrend(closes),
      momentum: this.calculateMomentum(closes, periods.momentum),
      price_velocity: this.calculatePriceVelocity(closes, interval),
      volatility: this.calculateVolatility(closes, periods.volatility),
      support_resistance: this.findSupportResistance(highs, lows, closes)
    };
  }

  calculateSMA(prices, periods) {
    if (prices.length < periods) return null;
    
    const recentPrices = prices.slice(-periods);
    const sum = recentPrices.reduce((acc, price) => acc + price, 0);
    return Math.round((sum / periods) * 100) / 100;
  }

  calculateEMA(prices, periods) {
    if (prices.length < periods) return null;
    
    const multiplier = 2 / (periods + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return Math.round(ema * 100) / 100;
  }

  calculateRSI(prices, periods = 14) {
    if (prices.length < periods + 1) return null;
    
    const changes = [];
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1]);
    }
    
    const recentChanges = changes.slice(-periods);
    const gains = recentChanges.filter(change => change > 0);
    const losses = recentChanges.filter(change => change < 0).map(loss => Math.abs(loss));
    
    const avgGain = gains.length > 0 ? gains.reduce((sum, gain) => sum + gain, 0) / periods : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((sum, loss) => sum + loss, 0) / periods : 0;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi * 100) / 100;
  }

  calculateMACD(prices) {
    if (prices.length < 26) return null;
    
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    
    if (!ema12 || !ema26) return null;
    
    const macdLine = ema12 - ema26;
    
    // Calculate signal line (9-period EMA of MACD)
    const macdHistory = [];
    for (let i = 26; i <= prices.length; i++) {
      const slice = prices.slice(0, i);
      const ema12_hist = this.calculateEMA(slice, 12);
      const ema26_hist = this.calculateEMA(slice, 26);
      if (ema12_hist && ema26_hist) {
        macdHistory.push(ema12_hist - ema26_hist);
      }
    }
    
    const signalLine = this.calculateEMA(macdHistory, 9);
    const histogram = signalLine ? macdLine - signalLine : 0;
    
    return {
      macd: Math.round(macdLine * 10000) / 10000,
      signal: Math.round((signalLine || 0) * 10000) / 10000,
      histogram: Math.round(histogram * 10000) / 10000
    };
  }

  calculateBollingerBands(prices, periods = 20) {
    if (prices.length < periods) return null;
    
    const sma = this.calculateSMA(prices, periods);
    if (!sma) return null;
    
    const recentPrices = prices.slice(-periods);
    const variance = recentPrices.reduce((acc, price) => acc + Math.pow(price - sma, 2), 0) / periods;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: Math.round((sma + (stdDev * 2)) * 100) / 100,
      middle: sma,
      lower: Math.round((sma - (stdDev * 2)) * 100) / 100,
      bandwidth: Math.round(((stdDev * 4) / sma * 100) * 100) / 100
    };
  }

  calculateStochastic(highs, lows, closes, periods = 14) {
    if (closes.length < periods) return null;
    
    const recentHighs = highs.slice(-periods);
    const recentLows = lows.slice(-periods);
    const currentClose = closes[closes.length - 1];
    
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    
    const kPercent = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    
    return {
      k: Math.round(kPercent * 100) / 100,
      interpretation: kPercent > 80 ? 'overbought' : kPercent < 20 ? 'oversold' : 'neutral'
    };
  }

  calculateATR(highs, lows, closes, periods = 14) {
    if (closes.length < periods + 1) return null;
    
    const trueRanges = [];
    
    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      
      trueRanges.push(tr);
    }
    
    const recentTR = trueRanges.slice(-periods);
    const atr = recentTR.reduce((sum, tr) => sum + tr, 0) / periods;
    
    return Math.round(atr * 100) / 100;
  }

  calculateOptimizedMACD(closes, periods) {
    if (closes.length < periods.ema_slow) return null;
    
    const emaFast = this.calculateEMA(closes, periods.ema_fast);
    const emaSlow = this.calculateEMA(closes, periods.ema_slow);
    
    if (!emaFast || !emaSlow) return null;
    
    const macdLine = emaFast - emaSlow;
    const signalPeriod = Math.max(2, Math.floor(periods.ema_fast / 2)); // Faster signal for ultra-HF
    
    // Calculate signal line using shorter period for responsiveness
    const macdHistory = [];
    for (let i = periods.ema_slow; i <= closes.length; i++) {
      const slice = closes.slice(0, i);
      const fast = this.calculateEMA(slice, periods.ema_fast);
      const slow = this.calculateEMA(slice, periods.ema_slow);
      if (fast && slow) {
        macdHistory.push(fast - slow);
      }
    }
    
    const signalLine = this.calculateEMA(macdHistory, signalPeriod);
    const histogram = signalLine ? macdLine - signalLine : 0;
    
    return {
      macd: Math.round(macdLine * 10000) / 10000,
      signal: Math.round((signalLine || 0) * 10000) / 10000,
      histogram: Math.round(histogram * 10000) / 10000
    };
  }

  calculateMomentum(closes, periods) {
    if (closes.length < periods + 1) return null;
    
    const current = closes[closes.length - 1];
    const previous = closes[closes.length - 1 - periods];
    
    const momentum = ((current - previous) / previous) * 100;
    
    return {
      value: Math.round(momentum * 10000) / 10000,
      interpretation: momentum > 2 ? 'strong_bullish' :
                     momentum > 0.5 ? 'bullish' :
                     momentum > -0.5 ? 'neutral' :
                     momentum > -2 ? 'bearish' : 'strong_bearish'
    };
  }

  calculatePriceVelocity(closes, interval) {
    if (closes.length < 3) return null;
    
    const recent3 = closes.slice(-3);
    const changes = [];
    
    for (let i = 1; i < recent3.length; i++) {
      const change = ((recent3[i] - recent3[i-1]) / recent3[i-1]) * 100;
      changes.push(change);
    }
    
    const avgVelocity = changes.reduce((sum, change) => sum + change, 0) / changes.length;
    const intervalMs = this.getIntervalMs(interval);
    
    // Normalize velocity per second
    const velocityPerSecond = avgVelocity / (intervalMs / 1000);
    
    return {
      velocity: Math.round(velocityPerSecond * 100000) / 100000, // % per second
      acceleration: changes.length > 1 ? changes[1] - changes[0] : 0,
      interpretation: Math.abs(velocityPerSecond) > 0.01 ? 'high_velocity' :
                     Math.abs(velocityPerSecond) > 0.001 ? 'medium_velocity' : 'low_velocity'
    };
  }

  calculateVolatility(closes, periods) {
    if (closes.length < periods) return null;
    
    const recentPrices = closes.slice(-periods);
    const returns = [];
    
    for (let i = 1; i < recentPrices.length; i++) {
      const return_ = Math.log(recentPrices[i] / recentPrices[i-1]);
      returns.push(return_);
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);
    
    return {
      volatility: Math.round(volatility * 10000) / 10000,
      annualized: Math.round(volatility * Math.sqrt(365 * 24 * 3600) * 100) / 100, // Annualized %
      classification: volatility > 0.05 ? 'extremely_high' :
                     volatility > 0.02 ? 'high' :
                     volatility > 0.01 ? 'medium' :
                     volatility > 0.005 ? 'low' : 'very_low'
    };
  }

  determineTrend(closes) {
    if (closes.length < 20) return 'insufficient_data';
    
    const recent = closes.slice(-10);
    const older = closes.slice(-20, -10);
    
    const recentAvg = recent.reduce((sum, price) => sum + price, 0) / recent.length;
    const olderAvg = older.reduce((sum, price) => sum + price, 0) / older.length;
    
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    
    if (change > 2) return 'strong_uptrend';
    if (change > 0.5) return 'uptrend';
    if (change > -0.5) return 'sideways';
    if (change > -2) return 'downtrend';
    return 'strong_downtrend';
  }

  findSupportResistance(highs, lows, closes) {
    if (closes.length < 50) return null;
    
    const recent = closes.slice(-50);
    const currentPrice = closes[closes.length - 1];
    
    // Find potential support (recent lows)
    const recentLows = lows.slice(-50);
    const sortedLows = [...recentLows].sort((a, b) => a - b);
    const support = sortedLows.slice(0, 3); // 3 lowest points
    
    // Find potential resistance (recent highs)
    const recentHighs = highs.slice(-50);
    const sortedHighs = [...recentHighs].sort((a, b) => b - a);
    const resistance = sortedHighs.slice(0, 3); // 3 highest points
    
    return {
      support: support.filter(level => level < currentPrice),
      resistance: resistance.filter(level => level > currentPrice),
      currentPrice
    };
  }

  getIntervalMs(interval) {
    const intervals = {
      '1s': 1000,              // 1 second
      '5s': 5 * 1000,          // 5 seconds  
      '15s': 15 * 1000,        // 15 seconds
      '1m': 60 * 1000,         // 1 minute
      '5m': 5 * 60 * 1000,     // 5 minutes
      '15m': 15 * 60 * 1000,   // 15 minutes
      '1h': 60 * 60 * 1000,    // 1 hour
      '4h': 4 * 60 * 60 * 1000, // 4 hours
      '1d': 24 * 60 * 60 * 1000 // 1 day
    };
    
    return intervals[interval] || intervals['5m'];
  }

  getMinimumPeriods(interval) {
    // Ultra-high frequency intervals need fewer periods to start analysis
    const minimums = {
      '1s': 10,   // 10 seconds of data
      '5s': 8,    // 40 seconds of data  
      '15s': 6,   // 90 seconds of data
      '1m': 15,   // 15 minutes of data
      '5m': 20,   // 100 minutes of data
      '15m': 20,  // 5 hours of data
      '1h': 20    // 20 hours of data
    };
    
    return minimums[interval] || 20;
  }

  getOptimalPeriods(interval, dataLength) {
    // Optimize indicator periods for different timeframes
    const configs = {
      '1s': {
        sma_fast: 5, sma_slow: 10, ema_fast: 3, ema_slow: 8,
        rsi: 6, bb: 8, volume: 5, stoch: 5, atr: 5,
        momentum: 3, volatility: 5
      },
      '5s': {
        sma_fast: 4, sma_slow: 8, ema_fast: 3, ema_slow: 6,  
        rsi: 5, bb: 6, volume: 4, stoch: 4, atr: 4,
        momentum: 3, volatility: 4
      },
      '15s': {
        sma_fast: 4, sma_slow: 6, ema_fast: 2, ema_slow: 5,
        rsi: 4, bb: 5, volume: 4, stoch: 4, atr: 3,
        momentum: 2, volatility: 3
      },
      '1m': {
        sma_fast: 10, sma_slow: 20, ema_fast: 6, ema_slow: 12,
        rsi: 8, bb: 12, volume: 10, stoch: 8, atr: 8,
        momentum: 5, volatility: 8
      },
      '5m': {
        sma_fast: 20, sma_slow: 50, ema_fast: 12, ema_slow: 26,
        rsi: 14, bb: 20, volume: 20, stoch: 14, atr: 14,
        momentum: 10, volatility: 14
      }
    };

    const config = configs[interval] || configs['5m'];
    
    // Adjust periods if we don't have enough data
    const adjusted = {};
    for (const [key, value] of Object.entries(config)) {
      adjusted[key] = Math.min(value, Math.floor(dataLength * 0.8));
    }
    
    return adjusted;
  }

  // Get current technical analysis snapshot
  getTechnicalSnapshot(symbol, interval = '5m') {
    return this.calculateIntradayTechnicals(symbol.toLowerCase(), interval);
  }

  // Calculate trading signals based on multiple indicators
  generateTradingSignals(symbol, interval = '5m') {
    const technicals = this.getTechnicalSnapshot(symbol, interval);
    
    if (!technicals) return null;
    
    let signals = {
      overall: 'neutral',
      strength: 0,
      signals: [],
      confidence: 'low'
    };
    
    let bullishSignals = 0;
    let bearishSignals = 0;
    
    // RSI signals
    if (technicals.rsi_14 < 30) {
      signals.signals.push('RSI oversold - potential buy');
      bullishSignals++;
    } else if (technicals.rsi_14 > 70) {
      signals.signals.push('RSI overbought - potential sell');
      bearishSignals++;
    }
    
    // MACD signals
    if (technicals.macd && technicals.macd.histogram > 0) {
      signals.signals.push('MACD bullish momentum');
      bullishSignals++;
    } else if (technicals.macd && technicals.macd.histogram < 0) {
      signals.signals.push('MACD bearish momentum');
      bearishSignals++;
    }
    
    // Moving average signals
    if (technicals.sma_20 && technicals.sma_50 && technicals.sma_20 > technicals.sma_50) {
      signals.signals.push('Golden cross - bullish trend');
      bullishSignals++;
    } else if (technicals.sma_20 && technicals.sma_50 && technicals.sma_20 < technicals.sma_50) {
      signals.signals.push('Death cross - bearish trend');
      bearishSignals++;
    }
    
    // Price vs SMA signals
    if (technicals.sma_20 && technicals.price > technicals.sma_20) {
      signals.signals.push('Price above SMA20 - bullish');
      bullishSignals++;
    } else if (technicals.sma_20 && technicals.price < technicals.sma_20) {
      signals.signals.push('Price below SMA20 - bearish');
      bearishSignals++;
    }
    
    // Determine overall signal
    const netSignals = bullishSignals - bearishSignals;
    
    if (netSignals >= 2) {
      signals.overall = 'bullish';
      signals.strength = Math.min(netSignals * 25, 100);
      signals.confidence = netSignals >= 3 ? 'high' : 'medium';
    } else if (netSignals <= -2) {
      signals.overall = 'bearish';
      signals.strength = Math.min(Math.abs(netSignals) * 25, 100);
      signals.confidence = Math.abs(netSignals) >= 3 ? 'high' : 'medium';
    } else {
      signals.overall = 'neutral';
      signals.strength = 0;
      signals.confidence = 'low';
    }
    
    return signals;
  }

  // Get status of all tracked symbols
  getStatus() {
    const status = {};
    
    for (const key of this.priceBuffers.keys()) {
      const [symbol, interval] = key.split('_');
      const buffer = this.priceBuffers.get(key);
      
      if (!status[symbol]) status[symbol] = {};
      
      status[symbol][interval] = {
        dataPoints: buffer.length,
        latestTimestamp: buffer.length > 0 ? buffer[buffer.length - 1].timestamp : null,
        hasTechnicals: buffer.length >= 20
      };
    }
    
    return status;
  }
}

module.exports = RealTimeTechnical;