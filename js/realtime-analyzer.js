/**
 * Real-Time Cryptocurrency Analysis Engine
 * Client-side WebSocket hybrid system for live dip analysis
 */

class RealTimeAnalyzer {
    constructor() {
        this.exchanges = [];
        this.priceBuffer = new CircularBuffer(1000);
        this.volumeBuffer = new CircularBuffer(100);
        this.currentSymbol = null;
        this.isActive = false;
        this.callbacks = {};
        this.lastServerSync = 0;
        this.serverSyncInterval = 60000; // Sync with server every minute
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        
        // Initialize exchange connections
        this.initializeExchanges();
        
        // Performance monitoring
        this.metrics = {
            ticksReceived: 0,
            lastTickTime: 0,
            averageLatency: 0,
            connectionStatus: {}
        };
    }

    initializeExchanges() {
        // Binance WebSocket - Most reliable for major cryptos
        this.exchanges.push(new BinanceWebSocket({
            name: 'binance',
            priority: 1,
            onTick: this.onPriceTick.bind(this),
            onError: this.onExchangeError.bind(this),
            onConnect: this.onExchangeConnect.bind(this)
        }));

        // Coinbase Pro WebSocket - Good for USD pairs
        this.exchanges.push(new CoinbaseWebSocket({
            name: 'coinbase',
            priority: 2,
            onTick: this.onPriceTick.bind(this),
            onError: this.onExchangeError.bind(this),
            onConnect: this.onExchangeConnect.bind(this)
        }));

        // KuCoin WebSocket - Good altcoin coverage
        this.exchanges.push(new KuCoinWebSocket({
            name: 'kucoin',
            priority: 3,
            onTick: this.onPriceTick.bind(this),
            onError: this.onExchangeError.bind(this),
            onConnect: this.onExchangeConnect.bind(this)
        }));
    }

    /**
     * Start real-time analysis for a cryptocurrency
     */
    async startAnalysis(symbol) {
        console.log(`🚀 Starting real-time analysis for ${symbol.toUpperCase()}`);
        
        this.currentSymbol = symbol.toLowerCase();
        this.isActive = true;
        this.reconnectAttempts = 0;

        // Get comprehensive baseline analysis from server
        const baseline = await this.getBaselineAnalysis(symbol);
        
        // Start WebSocket connections
        await this.connectToExchanges(symbol);
        
        // Start server sync timer
        this.startServerSync();
        
        return baseline;
    }

    /**
     * Stop real-time analysis and cleanup connections
     */
    stopAnalysis() {
        console.log('⏹️ Stopping real-time analysis');
        
        this.isActive = false;
        this.exchanges.forEach(exchange => exchange.disconnect());
        this.clearBuffers();
        
        if (this.serverSyncTimer) {
            clearInterval(this.serverSyncTimer);
        }
    }

    /**
     * Get baseline analysis from server
     */
    async getBaselineAnalysis(symbol) {
        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ 
                    crypto: symbol,
                    mode: 'baseline',
                    realtime: true
                })
            });

            if (!response.ok) throw new Error('Baseline analysis failed');
            
            const baseline = await response.json();
            console.log('📊 Baseline analysis loaded:', baseline.crypto.name);
            
            return baseline;
        } catch (error) {
            console.error('❌ Baseline analysis error:', error);
            throw error;
        }
    }

    /**
     * Connect to all available exchanges
     */
    async connectToExchanges(symbol) {
        const connections = this.exchanges.map(exchange => 
            exchange.connect(symbol).catch(error => {
                console.warn(`⚠️ ${exchange.name} connection failed:`, error);
                return null;
            })
        );

        const results = await Promise.allSettled(connections);
        const connected = results.filter(r => r.status === 'fulfilled' && r.value).length;
        
        console.log(`🔗 Connected to ${connected}/${this.exchanges.length} exchanges`);
        
        if (connected === 0) {
            throw new Error('Failed to connect to any exchanges');
        }
    }

    /**
     * Handle incoming price tick from exchanges
     */
    onPriceTick(tick) {
        if (!this.isActive) return;

        // Add timestamp and source validation
        tick.timestamp = Date.now();
        tick.localTime = new Date().toISOString();
        
        // Update metrics
        this.metrics.ticksReceived++;
        this.metrics.lastTickTime = tick.timestamp;
        
        // Add to price buffer
        this.priceBuffer.push({
            price: parseFloat(tick.price),
            volume: parseFloat(tick.volume || 0),
            timestamp: tick.timestamp,
            source: tick.source,
            bid: parseFloat(tick.bid || tick.price),
            ask: parseFloat(tick.ask || tick.price)
        });

        // Add to volume buffer (for volume analysis)
        if (tick.volume) {
            this.volumeBuffer.push({
                volume: parseFloat(tick.volume),
                timestamp: tick.timestamp,
                source: tick.source
            });
        }

        // Trigger real-time analysis update
        this.updateRealTimeAnalysis();
    }

    /**
     * Update real-time analysis with latest data
     */
    updateRealTimeAnalysis() {
        if (this.priceBuffer.length < 10) return; // Need minimum data

        const analysis = {
            timestamp: Date.now(),
            currentPrice: this.getCurrentPrice(),
            priceMovement: this.calculatePriceMovement(),
            momentum: this.calculateMomentum(),
            volatility: this.calculateVolatility(),
            volume: this.calculateVolumeMetrics(),
            technicals: this.calculateTechnicals(),
            signals: this.generateSignals(),
            quality: this.calculateDataQuality()
        };

        // Emit real-time update
        this.emit('analysis_update', analysis);

        // Check if we should sync with server
        if (this.shouldSyncWithServer()) {
            this.syncWithServer();
        }
    }

    /**
     * Calculate current price from latest ticks
     */
    getCurrentPrice() {
        if (this.priceBuffer.length === 0) return 0;
        
        // Get last 5 ticks and average them (reduce noise)
        const recent = this.priceBuffer.slice(-5);
        const prices = recent.map(tick => tick.price);
        const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        
        return {
            price: avgPrice,
            bid: recent[recent.length - 1].bid,
            ask: recent[recent.length - 1].ask,
            spread: recent[recent.length - 1].ask - recent[recent.length - 1].bid,
            lastUpdate: recent[recent.length - 1].timestamp
        };
    }

    /**
     * Calculate price movements over different timeframes
     */
    calculatePriceMovement() {
        const current = this.getCurrentPrice().price;
        const movements = {};

        // Calculate movements for different time windows
        const timeWindows = [
            { name: '1m', ms: 60 * 1000 },
            { name: '5m', ms: 5 * 60 * 1000 },
            { name: '15m', ms: 15 * 60 * 1000 },
            { name: '1h', ms: 60 * 60 * 1000 }
        ];

        const now = Date.now();
        
        timeWindows.forEach(window => {
            const cutoff = now - window.ms;
            const historicalTicks = this.priceBuffer.filter(tick => tick.timestamp >= cutoff);
            
            if (historicalTicks.length > 0) {
                const oldPrice = historicalTicks[0].price;
                const change = ((current - oldPrice) / oldPrice) * 100;
                
                movements[window.name] = {
                    change: change,
                    from: oldPrice,
                    to: current,
                    dataPoints: historicalTicks.length
                };
            }
        });

        return movements;
    }

    /**
     * Calculate momentum indicators
     */
    calculateMomentum() {
        if (this.priceBuffer.length < 20) return null;

        const prices = this.priceBuffer.slice(-50).map(tick => tick.price);
        
        return {
            rsi: this.calculateRSI(prices),
            macd: this.calculateMACD(prices),
            momentum: this.calculatePriceMomentum(prices),
            acceleration: this.calculateAcceleration(prices)
        };
    }

    /**
     * Calculate Real-Time RSI
     */
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;

        const changes = [];
        for (let i = 1; i < prices.length; i++) {
            changes.push(prices[i] - prices[i - 1]);
        }

        const gains = changes.map(change => change > 0 ? change : 0);
        const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);

        const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period;
        const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period;

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));

        return Math.round(rsi * 100) / 100;
    }

    /**
     * Calculate MACD
     */
    calculateMACD(prices) {
        if (prices.length < 26) return null;

        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        const macdLine = ema12 - ema26;
        
        // Simple signal line (could be improved with EMA of MACD)
        const signalLine = macdLine; // Simplified
        const histogram = macdLine - signalLine;

        return {
            macd: Math.round(macdLine * 1000) / 1000,
            signal: Math.round(signalLine * 1000) / 1000,
            histogram: Math.round(histogram * 1000) / 1000
        };
    }

    /**
     * Calculate Exponential Moving Average
     */
    calculateEMA(prices, period) {
        const k = 2 / (period + 1);
        let ema = prices[0];

        for (let i = 1; i < prices.length; i++) {
            ema = (prices[i] * k) + (ema * (1 - k));
        }

        return ema;
    }

    /**
     * Calculate price momentum
     */
    calculatePriceMomentum(prices) {
        if (prices.length < 10) return 0;

        const recent = prices.slice(-10);
        const older = prices.slice(-20, -10);

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        return ((recentAvg - olderAvg) / olderAvg) * 100;
    }

    /**
     * Calculate price acceleration
     */
    calculateAcceleration(prices) {
        if (prices.length < 6) return 0;

        const velocities = [];
        for (let i = 2; i < prices.length; i += 2) {
            const velocity = (prices[i] - prices[i - 2]) / 2;
            velocities.push(velocity);
        }

        if (velocities.length < 2) return 0;

        const acceleration = velocities[velocities.length - 1] - velocities[velocities.length - 2];
        return acceleration;
    }

    /**
     * Calculate volatility metrics
     */
    calculateVolatility() {
        if (this.priceBuffer.length < 20) return null;

        const prices = this.priceBuffer.slice(-50).map(tick => tick.price);
        const returns = [];

        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }

        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        return {
            standardDeviation: Math.round(stdDev * 10000) / 10000,
            volatilityPercent: Math.round(stdDev * 100 * 100) / 100,
            highLow: this.calculateHighLowVolatility(),
            averageTrueRange: this.calculateATR(prices)
        };
    }

    /**
     * Calculate High-Low volatility
     */
    calculateHighLowVolatility() {
        if (this.priceBuffer.length < 20) return 0;

        const recent = this.priceBuffer.slice(-20);
        const prices = recent.map(tick => tick.price);
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const avg = prices.reduce((a, b) => a + b, 0) / prices.length;

        return ((high - low) / avg) * 100;
    }

    /**
     * Calculate Average True Range (ATR)
     */
    calculateATR(prices, period = 14) {
        if (prices.length < period + 1) return 0;

        const trueRanges = [];
        for (let i = 1; i < prices.length; i++) {
            const high = prices[i];
            const low = prices[i];
            const prevClose = prices[i - 1];

            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trueRanges.push(tr);
        }

        const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
        return Math.round(atr * 1000) / 1000;
    }

    /**
     * Calculate volume metrics
     */
    calculateVolumeMetrics() {
        if (this.volumeBuffer.length < 10) return null;

        const volumes = this.volumeBuffer.map(v => v.volume);
        const currentVolume = volumes[volumes.length - 1] || 0;
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

        return {
            current: currentVolume,
            average: Math.round(avgVolume * 100) / 100,
            ratio: currentVolume / avgVolume,
            spike: currentVolume > avgVolume * 2,
            trend: this.calculateVolumeTrend(volumes)
        };
    }

    /**
     * Calculate volume trend
     */
    calculateVolumeTrend(volumes) {
        if (volumes.length < 10) return 'neutral';

        const recent = volumes.slice(-5);
        const older = volumes.slice(-10, -5);

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        const change = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (change > 20) return 'increasing';
        if (change < -20) return 'decreasing';
        return 'neutral';
    }

    /**
     * Calculate technical indicators
     */
    calculateTechnicals() {
        const prices = this.priceBuffer.slice(-100).map(tick => tick.price);
        if (prices.length < 20) return null;

        const sma20 = this.calculateSMA(prices, 20);
        const sma50 = prices.length >= 50 ? this.calculateSMA(prices, 50) : sma20;
        const ema12 = this.calculateEMA(prices, 12);
        const currentPrice = prices[prices.length - 1];

        return {
            sma20: Math.round(sma20 * 100) / 100,
            sma50: Math.round(sma50 * 100) / 100,
            ema12: Math.round(ema12 * 100) / 100,
            priceVsSMA20: ((currentPrice - sma20) / sma20) * 100,
            priceVsSMA50: ((currentPrice - sma50) / sma50) * 100,
            trend: this.determineTrend(currentPrice, sma20, sma50),
            support: this.findSupportLevel(prices),
            resistance: this.findResistanceLevel(prices)
        };
    }

    /**
     * Calculate Simple Moving Average
     */
    calculateSMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];
        
        const relevantPrices = prices.slice(-period);
        return relevantPrices.reduce((a, b) => a + b, 0) / period;
    }

    /**
     * Determine price trend
     */
    determineTrend(price, sma20, sma50) {
        if (price > sma20 && sma20 > sma50) return 'bullish';
        if (price < sma20 && sma20 < sma50) return 'bearish';
        return 'neutral';
    }

    /**
     * Find support level
     */
    findSupportLevel(prices) {
        if (prices.length < 20) return prices[0];
        
        const lows = [];
        for (let i = 2; i < prices.length - 2; i++) {
            if (prices[i] < prices[i-1] && prices[i] < prices[i+1] && 
                prices[i] < prices[i-2] && prices[i] < prices[i+2]) {
                lows.push(prices[i]);
            }
        }
        
        return lows.length > 0 ? Math.max(...lows.slice(-3)) : Math.min(...prices);
    }

    /**
     * Find resistance level
     */
    findResistanceLevel(prices) {
        if (prices.length < 20) return prices[0];
        
        const highs = [];
        for (let i = 2; i < prices.length - 2; i++) {
            if (prices[i] > prices[i-1] && prices[i] > prices[i+1] && 
                prices[i] > prices[i-2] && prices[i] > prices[i+2]) {
                highs.push(prices[i]);
            }
        }
        
        return highs.length > 0 ? Math.min(...highs.slice(-3)) : Math.max(...prices);
    }

    /**
     * Generate trading signals
     */
    generateSignals() {
        const signals = [];
        const momentum = this.calculateMomentum();
        const technicals = this.calculateTechnicals();
        const volume = this.calculateVolumeMetrics();
        const movement = this.calculatePriceMovement();

        if (!momentum || !technicals || !volume) return signals;

        // RSI signals
        if (momentum.rsi < 30) {
            signals.push({ type: 'BUY', strength: 'strong', reason: 'RSI oversold', value: momentum.rsi });
        } else if (momentum.rsi > 70) {
            signals.push({ type: 'SELL', strength: 'strong', reason: 'RSI overbought', value: momentum.rsi });
        }

        // MACD signals
        if (momentum.macd && momentum.macd.histogram > 0 && momentum.macd.macd > momentum.macd.signal) {
            signals.push({ type: 'BUY', strength: 'medium', reason: 'MACD bullish crossover' });
        }

        // Volume signals
        if (volume.spike && movement['1m'] && movement['1m'].change < -2) {
            signals.push({ type: 'BUY', strength: 'strong', reason: 'Volume spike on dip' });
        }

        // Support/Resistance signals
        const currentPrice = this.getCurrentPrice().price;
        if (currentPrice <= technicals.support * 1.02) {
            signals.push({ type: 'BUY', strength: 'medium', reason: 'Price near support level' });
        }
        if (currentPrice >= technicals.resistance * 0.98) {
            signals.push({ type: 'SELL', strength: 'medium', reason: 'Price near resistance level' });
        }

        // Momentum acceleration signals
        if (momentum.acceleration > 0 && movement['5m'] && movement['5m'].change < -3) {
            signals.push({ type: 'BUY', strength: 'strong', reason: 'Positive acceleration during dip' });
        }

        return signals;
    }

    /**
     * Calculate data quality score
     */
    calculateDataQuality() {
        const connectedExchanges = this.exchanges.filter(ex => ex.isConnected).length;
        const tickRate = this.metrics.ticksReceived / ((Date.now() - this.metrics.lastTickTime) / 1000 || 1);
        const dataAge = Date.now() - this.metrics.lastTickTime;

        let quality = 'poor';
        let score = 0;

        // Exchange connectivity score
        if (connectedExchanges >= 3) score += 40;
        else if (connectedExchanges >= 2) score += 30;
        else if (connectedExchanges >= 1) score += 20;

        // Data freshness score
        if (dataAge < 5000) score += 30;
        else if (dataAge < 15000) score += 20;
        else if (dataAge < 30000) score += 10;

        // Tick rate score
        if (tickRate > 5) score += 30;
        else if (tickRate > 2) score += 20;
        else if (tickRate > 0.5) score += 10;

        if (score >= 80) quality = 'excellent';
        else if (score >= 60) quality = 'good';
        else if (score >= 40) quality = 'fair';

        return {
            score: score,
            quality: quality,
            connectedExchanges: connectedExchanges,
            tickRate: Math.round(tickRate * 10) / 10,
            dataAge: dataAge,
            bufferSize: this.priceBuffer.length
        };
    }

    /**
     * Check if we should sync with server
     */
    shouldSyncWithServer() {
        return Date.now() - this.lastServerSync > this.serverSyncInterval;
    }

    /**
     * Sync comprehensive analysis with server
     */
    async syncWithServer() {
        if (!this.currentSymbol) return;

        try {
            console.log('🔄 Syncing with server for comprehensive analysis...');
            
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ 
                    crypto: this.currentSymbol,
                    mode: 'comprehensive',
                    realtime_data: {
                        current_price: this.getCurrentPrice().price,
                        recent_movement: this.calculatePriceMovement(),
                        momentum: this.calculateMomentum(),
                        volume: this.calculateVolumeMetrics()
                    }
                })
            });

            if (response.ok) {
                const serverAnalysis = await response.json();
                this.lastServerSync = Date.now();
                this.emit('server_sync', serverAnalysis);
                console.log('✅ Server sync completed');
            }
        } catch (error) {
            console.error('❌ Server sync failed:', error);
        }
    }

    /**
     * Start server sync timer
     */
    startServerSync() {
        if (this.serverSyncTimer) clearInterval(this.serverSyncTimer);
        
        this.serverSyncTimer = setInterval(() => {
            this.syncWithServer();
        }, this.serverSyncInterval);
    }

    /**
     * Handle exchange connection events
     */
    onExchangeConnect(exchangeName) {
        console.log(`✅ ${exchangeName} connected`);
        this.metrics.connectionStatus[exchangeName] = 'connected';
        this.emit('exchange_connected', exchangeName);
    }

    /**
     * Handle exchange errors
     */
    onExchangeError(exchangeName, error) {
        console.warn(`⚠️ ${exchangeName} error:`, error);
        this.metrics.connectionStatus[exchangeName] = 'error';
        
        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
                console.log(`🔄 Attempting to reconnect ${exchangeName}...`);
                this.reconnectExchange(exchangeName);
            }, 5000 * this.reconnectAttempts);
        }
    }

    /**
     * Reconnect to a specific exchange
     */
    async reconnectExchange(exchangeName) {
        const exchange = this.exchanges.find(ex => ex.name === exchangeName);
        if (exchange && this.currentSymbol) {
            try {
                await exchange.connect(this.currentSymbol);
            } catch (error) {
                console.error(`❌ ${exchangeName} reconnection failed:`, error);
            }
        }
    }

    /**
     * Clear all buffers
     */
    clearBuffers() {
        this.priceBuffer.clear();
        this.volumeBuffer.clear();
        this.metrics.ticksReceived = 0;
    }

    /**
     * Event emitter functionality
     */
    on(event, callback) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => callback(data));
        }
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            bufferSizes: {
                price: this.priceBuffer.length,
                volume: this.volumeBuffer.length
            },
            isActive: this.isActive,
            currentSymbol: this.currentSymbol,
            uptime: this.metrics.lastTickTime - (this.startTime || Date.now())
        };
    }
}

/**
 * Circular Buffer implementation for efficient data storage
 */
class CircularBuffer {
    constructor(maxSize) {
        this.maxSize = maxSize;
        this.buffer = [];
        this.head = 0;
        this.size = 0;
    }

    push(item) {
        if (this.size < this.maxSize) {
            this.buffer[this.size] = item;
            this.size++;
        } else {
            this.buffer[this.head] = item;
            this.head = (this.head + 1) % this.maxSize;
        }
    }

    slice(start, end) {
        if (this.size < this.maxSize) {
            return this.buffer.slice(start, end);
        }
        
        const result = [];
        const actualStart = start < 0 ? Math.max(0, this.size + start) : start;
        const actualEnd = end === undefined ? this.size : (end < 0 ? this.size + end : end);
        
        for (let i = actualStart; i < actualEnd && i < this.size; i++) {
            const index = (this.head + i) % this.maxSize;
            result.push(this.buffer[index]);
        }
        
        return result;
    }

    get length() {
        return this.size;
    }

    clear() {
        this.buffer = [];
        this.head = 0;
        this.size = 0;
    }

    filter(callback) {
        const result = [];
        for (let i = 0; i < this.size; i++) {
            const index = this.size < this.maxSize ? i : (this.head + i) % this.maxSize;
            if (callback(this.buffer[index], i)) {
                result.push(this.buffer[index]);
            }
        }
        return result;
    }

    map(callback) {
        const result = [];
        for (let i = 0; i < this.size; i++) {
            const index = this.size < this.maxSize ? i : (this.head + i) % this.maxSize;
            result.push(callback(this.buffer[index], i));
        }
        return result;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RealTimeAnalyzer, CircularBuffer };
} else if (typeof window !== 'undefined') {
    window.RealTimeAnalyzer = RealTimeAnalyzer;
    window.CircularBuffer = CircularBuffer;
}