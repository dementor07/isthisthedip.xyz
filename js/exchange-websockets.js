/**
 * WebSocket Exchange Connectors
 * Real-time cryptocurrency data from multiple exchanges
 */

/**
 * Base WebSocket Exchange Class
 */
class BaseExchange {
    constructor(config) {
        this.name = config.name;
        this.priority = config.priority || 1;
        this.onTick = config.onTick;
        this.onError = config.onError;
        this.onConnect = config.onConnect;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.currentSymbol = null;
        this.heartbeatInterval = null;
        this.lastHeartbeat = Date.now();
    }

    async connect(symbol) {
        this.currentSymbol = symbol;
        await this.connectWebSocket(symbol);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.isConnected = false;
    }

    onWebSocketOpen() {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log(`🔗 ${this.name} WebSocket connected`);
        if (this.onConnect) this.onConnect(this.name);
        this.startHeartbeat();
    }

    onWebSocketClose() {
        this.isConnected = false;
        console.log(`❌ ${this.name} WebSocket disconnected`);
        this.stopHeartbeat();
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
        }
    }

    onWebSocketError(error) {
        console.error(`⚠️ ${this.name} WebSocket error:`, error);
        this.isConnected = false;
        if (this.onError) this.onError(this.name, error);
    }

    async attemptReconnect() {
        if (!this.currentSymbol) return;
        
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        
        console.log(`🔄 ${this.name} reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(async () => {
            try {
                await this.connect(this.currentSymbol);
            } catch (error) {
                console.error(`❌ ${this.name} reconnection failed:`, error);
            }
        }, delay);
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendHeartbeat();
                this.lastHeartbeat = Date.now();
            }
        }, 30000); // 30 second heartbeat
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    sendHeartbeat() {
        // Override in subclasses
    }

    getConnectionStatus() {
        return {
            name: this.name,
            connected: this.isConnected,
            lastHeartbeat: this.lastHeartbeat,
            reconnectAttempts: this.reconnectAttempts
        };
    }
}

/**
 * Binance WebSocket Connector
 * Most reliable for major cryptocurrencies
 */
class BinanceWebSocket extends BaseExchange {
    constructor(config) {
        super(config);
        this.baseUrl = 'wss://stream.binance.com:9443/ws/';
    }

    async connectWebSocket(symbol) {
        // Convert symbol to Binance format (e.g., bitcoin -> btcusdt)
        const binanceSymbol = await this.convertSymbolToBinance(symbol);
        const wsUrl = `${this.baseUrl}${binanceSymbol}@ticker`;
        
        console.log(`🔗 Connecting to Binance: ${wsUrl}`);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => this.onWebSocketOpen();
        this.ws.onclose = () => this.onWebSocketClose();
        this.ws.onerror = (error) => this.onWebSocketError(error);
        this.ws.onmessage = (event) => this.handleMessage(event);
    }

    async convertSymbolToBinance(symbol) {
        // Common cryptocurrency mappings to Binance pairs
        const symbolMap = {
            'bitcoin': 'btcusdt',
            'ethereum': 'ethusdt',
            'bnb': 'bnbusdt',
            'cardano': 'adausdt',
            'solana': 'solusdt',
            'polkadot': 'dotusdt',
            'dogecoin': 'dogeusdt',
            'avalanche-2': 'avaxusdt',
            'chainlink': 'linkusdt',
            'polygon': 'maticusdt',
            'uniswap': 'uniusdt',
            'litecoin': 'ltcusdt',
            'bitcoin-cash': 'bchusdt',
            'stellar': 'xlmusdt',
            'vechain': 'vetusdt',
            'ethereum-classic': 'etcusdt',
            'monero': 'xmrusdt',
            'tron': 'trxusdt',
            'cosmos': 'atomusdt',
            'algorand': 'algousdt'
        };

        return symbolMap[symbol.toLowerCase()] || `${symbol.toLowerCase()}usdt`;
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.e === '24hrTicker') {
                const tick = {
                    source: 'binance',
                    symbol: data.s,
                    price: parseFloat(data.c),
                    volume: parseFloat(data.v),
                    change_24h: parseFloat(data.P),
                    high_24h: parseFloat(data.h),
                    low_24h: parseFloat(data.l),
                    bid: parseFloat(data.b),
                    ask: parseFloat(data.a),
                    timestamp: Date.now(),
                    raw: data
                };

                if (this.onTick) this.onTick(tick);
            }
        } catch (error) {
            console.error('Binance message parsing error:', error);
        }
    }

    sendHeartbeat() {
        // Binance doesn't require manual heartbeat
    }
}

/**
 * Coinbase Pro WebSocket Connector
 * Professional-grade data for USD pairs
 */
class CoinbaseWebSocket extends BaseExchange {
    constructor(config) {
        super(config);
        this.baseUrl = 'wss://ws-feed.pro.coinbase.com';
        this.lastTicker = {};
    }

    async connectWebSocket(symbol) {
        const coinbaseSymbol = await this.convertSymbolToCoinbase(symbol);
        
        console.log(`🔗 Connecting to Coinbase Pro: ${coinbaseSymbol}`);
        
        this.ws = new WebSocket(this.baseUrl);
        
        this.ws.onopen = () => {
            this.onWebSocketOpen();
            this.subscribeToTicker(coinbaseSymbol);
        };
        this.ws.onclose = () => this.onWebSocketClose();
        this.ws.onerror = (error) => this.onWebSocketError(error);
        this.ws.onmessage = (event) => this.handleMessage(event);
    }

    async convertSymbolToCoinbase(symbol) {
        const symbolMap = {
            'bitcoin': 'BTC-USD',
            'ethereum': 'ETH-USD',
            'litecoin': 'LTC-USD',
            'bitcoin-cash': 'BCH-USD',
            'ethereum-classic': 'ETC-USD',
            'chainlink': 'LINK-USD',
            'cardano': 'ADA-USD',
            'stellar': 'XLM-USD',
            'dogecoin': 'DOGE-USD',
            'solana': 'SOL-USD',
            'polygon': 'MATIC-USD',
            'uniswap': 'UNI-USD',
            'algorand': 'ALGO-USD',
            'cosmos': 'ATOM-USD'
        };

        return symbolMap[symbol.toLowerCase()] || `${symbol.toUpperCase()}-USD`;
    }

    subscribeToTicker(symbol) {
        const subscribeMsg = {
            type: 'subscribe',
            product_ids: [symbol],
            channels: ['ticker']
        };

        this.ws.send(JSON.stringify(subscribeMsg));
        console.log(`📡 Subscribed to Coinbase ticker: ${symbol}`);
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'ticker') {
                // Store latest ticker data
                this.lastTicker[data.product_id] = data;

                const tick = {
                    source: 'coinbase',
                    symbol: data.product_id,
                    price: parseFloat(data.price),
                    volume: parseFloat(data.volume_24h),
                    bid: parseFloat(data.best_bid),
                    ask: parseFloat(data.best_ask),
                    high_24h: parseFloat(data.high_24h),
                    low_24h: parseFloat(data.low_24h),
                    timestamp: new Date(data.time).getTime(),
                    raw: data
                };

                if (this.onTick) this.onTick(tick);
            }
        } catch (error) {
            console.error('Coinbase message parsing error:', error);
        }
    }

    sendHeartbeat() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const heartbeat = { type: 'heartbeat', on: true };
            this.ws.send(JSON.stringify(heartbeat));
        }
    }
}

/**
 * KuCoin WebSocket Connector
 * Good coverage for altcoins
 */
class KuCoinWebSocket extends BaseExchange {
    constructor(config) {
        super(config);
        this.baseUrl = null; // Will be obtained from KuCoin API
        this.token = null;
        this.connectId = null;
    }

    async connectWebSocket(symbol) {
        try {
            // Get WebSocket details from KuCoin API
            const wsDetails = await this.getWebSocketDetails();
            this.baseUrl = wsDetails.instanceServers[0].endpoint;
            this.token = wsDetails.token;
            
            const kucoinSymbol = await this.convertSymbolToKuCoin(symbol);
            const wsUrl = `${this.baseUrl}?token=${this.token}&connectId=${Date.now()}`;
            
            console.log(`🔗 Connecting to KuCoin: ${kucoinSymbol}`);
            
            this.ws = new WebSocket(wsUrl);
            this.currentKuCoinSymbol = kucoinSymbol;
            
            this.ws.onopen = () => {
                this.onWebSocketOpen();
                this.subscribeToTicker(kucoinSymbol);
            };
            this.ws.onclose = () => this.onWebSocketClose();
            this.ws.onerror = (error) => this.onWebSocketError(error);
            this.ws.onmessage = (event) => this.handleMessage(event);
        } catch (error) {
            console.error('KuCoin connection error:', error);
            throw error;
        }
    }

    async getWebSocketDetails() {
        const response = await fetch('https://api.kucoin.com/api/v1/bullet-public', {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Failed to get KuCoin WebSocket details');
        }
        
        const data = await response.json();
        return data.data;
    }

    async convertSymbolToKuCoin(symbol) {
        const symbolMap = {
            'bitcoin': 'BTC-USDT',
            'ethereum': 'ETH-USDT',
            'litecoin': 'LTC-USDT',
            'bitcoin-cash': 'BCH-USDT',
            'ethereum-classic': 'ETC-USDT',
            'chainlink': 'LINK-USDT',
            'cardano': 'ADA-USDT',
            'stellar': 'XLM-USDT',
            'dogecoin': 'DOGE-USDT',
            'solana': 'SOL-USDT',
            'polygon': 'MATIC-USDT',
            'uniswap': 'UNI-USDT',
            'vechain': 'VET-USDT',
            'tron': 'TRX-USDT',
            'cosmos': 'ATOM-USDT',
            'algorand': 'ALGO-USDT',
            'polkadot': 'DOT-USDT',
            'avalanche-2': 'AVAX-USDT'
        };

        return symbolMap[symbol.toLowerCase()] || `${symbol.toUpperCase()}-USDT`;
    }

    subscribeToTicker(symbol) {
        const subscribeMsg = {
            id: Date.now(),
            type: 'subscribe',
            topic: `/market/ticker:${symbol}`,
            response: true
        };

        this.ws.send(JSON.stringify(subscribeMsg));
        console.log(`📡 Subscribed to KuCoin ticker: ${symbol}`);
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'message' && data.topic && data.topic.includes('/market/ticker:')) {
                const tickerData = data.data;
                
                const tick = {
                    source: 'kucoin',
                    symbol: data.subject,
                    price: parseFloat(tickerData.price),
                    volume: parseFloat(tickerData.vol),
                    change_24h: parseFloat(tickerData.changeRate) * 100,
                    bid: parseFloat(tickerData.bestBid),
                    ask: parseFloat(tickerData.bestAsk),
                    high_24h: parseFloat(tickerData.high),
                    low_24h: parseFloat(tickerData.low),
                    timestamp: parseInt(tickerData.time),
                    raw: data
                };

                if (this.onTick) this.onTick(tick);
            } else if (data.type === 'pong') {
                // Heartbeat response
                this.lastHeartbeat = Date.now();
            }
        } catch (error) {
            console.error('KuCoin message parsing error:', error);
        }
    }

    sendHeartbeat() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const ping = {
                id: Date.now(),
                type: 'ping'
            };
            this.ws.send(JSON.stringify(ping));
        }
    }
}

/**
 * Fallback HTTP Polling Exchange
 * Used when WebSocket connections fail
 */
class HTTPPollingExchange extends BaseExchange {
    constructor(config) {
        super(config);
        this.pollingInterval = null;
        this.pollingRate = config.pollingRate || 5000; // 5 seconds default
        this.lastPrice = null;
    }

    async connectWebSocket(symbol) {
        console.log(`🔗 Starting HTTP polling for ${symbol} (${this.pollingRate}ms interval)`);
        this.currentSymbol = symbol;
        this.isConnected = true;
        
        if (this.onConnect) this.onConnect(this.name);
        
        this.startPolling();
    }

    disconnect() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.isConnected = false;
    }

    startPolling() {
        this.pollingInterval = setInterval(async () => {
            try {
                const data = await this.fetchPriceData(this.currentSymbol);
                if (data && data.price !== this.lastPrice) {
                    this.lastPrice = data.price;
                    
                    const tick = {
                        source: `${this.name}-http`,
                        symbol: this.currentSymbol,
                        price: data.price,
                        volume: data.volume || 0,
                        change_24h: data.change_24h || 0,
                        timestamp: Date.now(),
                        raw: data
                    };
                    
                    if (this.onTick) this.onTick(tick);
                }
            } catch (error) {
                console.error(`HTTP polling error for ${this.name}:`, error);
                if (this.onError) this.onError(this.name, error);
            }
        }, this.pollingRate);
    }

    async fetchPriceData(symbol) {
        // Override in subclasses
        throw new Error('fetchPriceData must be implemented in subclass');
    }

    sendHeartbeat() {
        // Not needed for HTTP polling
    }
}

/**
 * CoinGecko HTTP Fallback
 */
class CoinGeckoHTTP extends HTTPPollingExchange {
    constructor(config) {
        super({ ...config, name: 'coingecko-http', pollingRate: 10000 });
    }

    async fetchPriceData(symbol) {
        const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`);
        
        if (!response.ok) throw new Error('CoinGecko API error');
        
        const data = await response.json();
        const coinData = data[symbol];
        
        if (!coinData) throw new Error('Coin data not found');
        
        return {
            price: coinData.usd,
            volume: coinData.usd_24h_vol || 0,
            change_24h: coinData.usd_24h_change || 0
        };
    }
}

/**
 * WebSocket Exchange Manager
 * Manages multiple exchange connections and provides unified interface
 */
class ExchangeManager {
    constructor() {
        this.exchanges = [];
        this.activeConnections = 0;
        this.callbacks = {};
    }

    addExchange(ExchangeClass, config) {
        const exchange = new ExchangeClass({
            ...config,
            onTick: this.handleTick.bind(this),
            onConnect: this.handleConnect.bind(this),
            onError: this.handleError.bind(this)
        });
        
        this.exchanges.push(exchange);
        return exchange;
    }

    async connectAll(symbol) {
        console.log(`🚀 Connecting to all exchanges for ${symbol}...`);
        
        const connections = this.exchanges.map(async (exchange) => {
            try {
                await exchange.connect(symbol);
                return { success: true, exchange: exchange.name };
            } catch (error) {
                console.warn(`⚠️ ${exchange.name} connection failed:`, error);
                return { success: false, exchange: exchange.name, error };
            }
        });

        const results = await Promise.allSettled(connections);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        
        console.log(`✅ Connected to ${successful}/${this.exchanges.length} exchanges`);
        return successful;
    }

    disconnectAll() {
        this.exchanges.forEach(exchange => exchange.disconnect());
        this.activeConnections = 0;
    }

    handleTick(tick) {
        this.emit('tick', tick);
    }

    handleConnect(exchangeName) {
        this.activeConnections++;
        this.emit('connect', exchangeName);
    }

    handleError(exchangeName, error) {
        this.emit('error', { exchange: exchangeName, error });
    }

    getStatus() {
        return {
            totalExchanges: this.exchanges.length,
            activeConnections: this.activeConnections,
            exchanges: this.exchanges.map(ex => ex.getConnectionStatus())
        };
    }

    on(event, callback) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
    }

    emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(callback => callback(data));
        }
    }
}

// Export classes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        BinanceWebSocket,
        CoinbaseWebSocket,
        KuCoinWebSocket,
        CoinGeckoHTTP,
        ExchangeManager
    };
} else if (typeof window !== 'undefined') {
    window.BinanceWebSocket = BinanceWebSocket;
    window.CoinbaseWebSocket = CoinbaseWebSocket;
    window.KuCoinWebSocket = KuCoinWebSocket;
    window.CoinGeckoHTTP = CoinGeckoHTTP;
    window.ExchangeManager = ExchangeManager;
}