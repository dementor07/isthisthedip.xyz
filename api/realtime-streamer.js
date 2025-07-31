const WebSocket = require('ws');
const EventEmitter = require('events');

class RealTimeStreamer extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // symbol -> WebSocket connection
    this.subscribers = new Map(); // symbol -> Set of callback functions
    this.priceHistory = new Map(); // symbol -> array of recent prices
    this.reconnectAttempts = new Map(); // symbol -> attempt count
    this.maxHistoryLength = 1000; // Keep last 1000 price points for calculations
    this.isConnecting = new Map(); // symbol -> boolean to prevent duplicate connections
  }

  // Subscribe to real-time price updates for a cryptocurrency
  subscribe(symbol, callback) {
    const normalizedSymbol = symbol.toLowerCase();
    
    if (!this.subscribers.has(normalizedSymbol)) {
      this.subscribers.set(normalizedSymbol, new Set());
    }
    
    this.subscribers.get(normalizedSymbol).add(callback);
    
    // Start streaming if not already connected
    if (!this.connections.has(normalizedSymbol) && !this.isConnecting.get(normalizedSymbol)) {
      this.startStream(normalizedSymbol);
    }
    
    // Return unsubscribe function
    return () => {
      this.unsubscribe(normalizedSymbol, callback);
    };
  }

  unsubscribe(symbol, callback) {
    const normalizedSymbol = symbol.toLowerCase();
    
    if (this.subscribers.has(normalizedSymbol)) {
      this.subscribers.get(normalizedSymbol).delete(callback);
      
      // If no more subscribers, close the connection
      if (this.subscribers.get(normalizedSymbol).size === 0) {
        this.stopStream(normalizedSymbol);
      }
    }
  }

  async startStream(symbol) {
    if (this.isConnecting.get(symbol)) {
      return; // Already attempting to connect
    }

    this.isConnecting.set(symbol, true);
    
    try {
      // Use Binance WebSocket for most reliable real-time data
      const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}usdt@ticker`;
      const ws = new WebSocket(wsUrl);
      
      ws.on('open', () => {
        console.log(`🔴 LIVE: Connected to real-time stream for ${symbol.toUpperCase()}`);
        this.connections.set(symbol, ws);
        this.reconnectAttempts.set(symbol, 0);
        this.isConnecting.set(symbol, false);
      });

      ws.on('message', (data) => {
        try {
          const ticker = JSON.parse(data);
          this.handlePriceUpdate(symbol, ticker);
        } catch (error) {
          console.error(`Error parsing WebSocket data for ${symbol}:`, error);
        }
      });

      ws.on('close', () => {
        console.log(`🔴 LIVE: Disconnected from stream for ${symbol.toUpperCase()}`);
        this.connections.delete(symbol);
        this.isConnecting.set(symbol, false);
        
        // Attempt to reconnect if there are still subscribers
        if (this.subscribers.has(symbol) && this.subscribers.get(symbol).size > 0) {
          this.scheduleReconnect(symbol);
        }
      });

      ws.on('error', (error) => {
        console.error(`🔴 LIVE: WebSocket error for ${symbol}:`, error.message);
        this.isConnecting.set(symbol, false);
        
        if (this.subscribers.has(symbol) && this.subscribers.get(symbol).size > 0) {
          this.scheduleReconnect(symbol);
        }
      });

    } catch (error) {
      console.error(`Failed to start stream for ${symbol}:`, error);
      this.isConnecting.set(symbol, false);
    }
  }

  handlePriceUpdate(symbol, ticker) {
    const priceData = {
      symbol: symbol.toUpperCase(),
      price: parseFloat(ticker.c), // Current price
      change24h: parseFloat(ticker.P), // 24h price change percentage
      volume24h: parseFloat(ticker.v), // 24h volume
      high24h: parseFloat(ticker.h), // 24h high
      low24h: parseFloat(ticker.l), // 24h low
      timestamp: Date.now(),
      source: 'binance_websocket'
    };

    // Store price history for technical analysis
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }
    
    const history = this.priceHistory.get(symbol);
    history.push({
      price: priceData.price,
      timestamp: priceData.timestamp,
      volume: priceData.volume24h
    });
    
    // Keep only recent history
    if (history.length > this.maxHistoryLength) {
      history.splice(0, history.length - this.maxHistoryLength);
    }

    // Notify all subscribers
    if (this.subscribers.has(symbol)) {
      this.subscribers.get(symbol).forEach(callback => {
        try {
          callback(priceData);
        } catch (error) {
          console.error(`Error in subscriber callback for ${symbol}:`, error);
        }
      });
    }

    // Emit event for other components
    this.emit('priceUpdate', symbol, priceData);
  }

  scheduleReconnect(symbol) {
    const attempts = (this.reconnectAttempts.get(symbol) || 0) + 1;
    this.reconnectAttempts.set(symbol, attempts);
    
    // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
    const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
    
    console.log(`🔄 Reconnecting to ${symbol.toUpperCase()} stream in ${delay/1000}s (attempt ${attempts})`);
    
    setTimeout(() => {
      if (this.subscribers.has(symbol) && this.subscribers.get(symbol).size > 0) {
        this.startStream(symbol);
      }
    }, delay);
  }

  stopStream(symbol) {
    if (this.connections.has(symbol)) {
      this.connections.get(symbol).close();
      this.connections.delete(symbol);
    }
    
    this.subscribers.delete(symbol);
    this.priceHistory.delete(symbol);
    this.reconnectAttempts.delete(symbol);
    this.isConnecting.delete(symbol);
    
    console.log(`🔴 LIVE: Stopped stream for ${symbol.toUpperCase()}`);
  }

  // Get recent price history for technical analysis
  getPriceHistory(symbol, periods = 100) {
    const history = this.priceHistory.get(symbol.toLowerCase()) || [];
    return history.slice(-periods);
  }

  // Calculate real-time moving average
  calculateSMA(symbol, periods = 20) {
    const history = this.getPriceHistory(symbol, periods);
    
    if (history.length < periods) {
      return null; // Not enough data
    }
    
    const recentPrices = history.slice(-periods);
    const sum = recentPrices.reduce((acc, point) => acc + point.price, 0);
    return sum / periods;
  }

  // Calculate real-time RSI
  calculateRSI(symbol, periods = 14) {
    const history = this.getPriceHistory(symbol, periods + 1);
    
    if (history.length < periods + 1) {
      return null; // Not enough data
    }

    const changes = [];
    for (let i = 1; i < history.length; i++) {
      changes.push(history[i].price - history[i - 1].price);
    }

    const gains = changes.map(change => change > 0 ? change : 0);
    const losses = changes.map(change => change < 0 ? Math.abs(change) : 0);

    const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / periods;
    const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / periods;

    if (avgLoss === 0) return 100; // No losses = max RSI
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return Math.round(rsi * 100) / 100; // Round to 2 decimals
  }

  // Get real-time technical indicators
  getTechnicalIndicators(symbol) {
    const currentPrice = this.getCurrentPrice(symbol);
    const sma20 = this.calculateSMA(symbol, 20);
    const sma50 = this.calculateSMA(symbol, 50);
    const rsi = this.calculateRSI(symbol, 14);
    
    return {
      price: currentPrice,
      sma20,
      sma50,
      rsi,
      timestamp: Date.now(),
      dataPoints: this.getPriceHistory(symbol).length,
      source: 'realtime_calculation'
    };
  }

  getCurrentPrice(symbol) {
    const history = this.getPriceHistory(symbol, 1);
    return history.length > 0 ? history[0].price : null;
  }

  // Get connection status for all streams
  getStatus() {
    const status = {};
    
    for (const [symbol, subscribers] of this.subscribers) {
      status[symbol] = {
        connected: this.connections.has(symbol),
        subscribers: subscribers.size,
        dataPoints: this.getPriceHistory(symbol).length,
        reconnectAttempts: this.reconnectAttempts.get(symbol) || 0
      };
    }
    
    return status;
  }

  // Cleanup all connections
  disconnect() {
    for (const symbol of this.connections.keys()) {
      this.stopStream(symbol);
    }
    
    console.log('🔴 LIVE: All real-time streams disconnected');
  }
}

module.exports = RealTimeStreamer;