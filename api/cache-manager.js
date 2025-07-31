class CacheManager {
  constructor() {
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      apiCallsSaved: 0
    };
    
    // Cache duration configurations (in milliseconds) - Optimized for speed
    this.cacheDurations = {
      global_market: 5 * 60 * 1000,    // 5 minutes - changes slowly
      crypto_data: 30 * 1000,          // 30 seconds - faster updates for better UX
      fear_greed: 10 * 60 * 1000,      // 10 minutes - updates daily
      bitcoin_dominance: 5 * 60 * 1000, // 5 minutes - market structure
      coin_list: 60 * 60 * 1000,       // 1 hour - rarely changes
      search_results: 5 * 60 * 1000     // 5 minutes - coin search results
    };
    
    // Start cleanup interval
    this.startCleanupInterval();
  }

  generateKey(type, params = {}) {
    const paramString = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${type}:${paramString}`;
  }

  set(type, data, params = {}) {
    const key = this.generateKey(type, params);
    const duration = this.cacheDurations[type] || 5 * 60 * 1000; // Default 5 minutes
    const expiry = Date.now() + duration;
    
    this.cache.set(key, {
      data,
      expiry,
      type,
      createdAt: Date.now()
    });
    
    console.log(`Cache SET: ${key} (expires in ${duration/1000}s)`);
  }

  get(type, params = {}) {
    const key = this.generateKey(type, params);
    const cached = this.cache.get(key);
    
    if (!cached) {
      this.stats.misses++;
      console.log(`Cache MISS: ${key}`);
      return null;
    }
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      console.log(`Cache EXPIRED: ${key}`);
      return null;
    }
    
    this.stats.hits++;
    this.stats.apiCallsSaved++;
    console.log(`Cache HIT: ${key} (age: ${(Date.now() - cached.createdAt)/1000}s)`);
    return cached.data;
  }

  invalidate(type, params = {}) {
    const key = this.generateKey(type, params);
    const deleted = this.cache.delete(key);
    if (deleted) {
      console.log(`Cache INVALIDATED: ${key}`);
    }
    return deleted;
  }

  invalidateByType(type) {
    let deletedCount = 0;
    for (const [key, value] of this.cache.entries()) {
      if (value.type === type) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    console.log(`Cache INVALIDATED TYPE: ${type} (${deletedCount} entries)`);
    return deletedCount;
  }

  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`Cache CLEARED: ${size} entries removed`);
    return size;
  }

  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests * 100).toFixed(1) : 0;
    
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: `${hitRate}%`,
      apiCallsSaved: this.stats.apiCallsSaved,
      entries: this.getCacheEntries()
    };
  }

  getCacheEntries() {
    const entries = [];
    const now = Date.now();
    
    for (const [key, value] of this.cache.entries()) {
      entries.push({
        key,
        type: value.type,
        age: Math.round((now - value.createdAt) / 1000),
        ttl: Math.max(0, Math.round((value.expiry - now) / 1000)),
        expired: now > value.expiry
      });
    }
    
    return entries.sort((a, b) => b.age - a.age);
  }

  startCleanupInterval() {
    // Clean up expired entries every 2 minutes
    setInterval(() => {
      this.cleanup();
    }, 2 * 60 * 1000);
  }

  cleanup() {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now > value.expiry) {
        this.cache.delete(key);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`Cache CLEANUP: Removed ${expiredCount} expired entries`);
    }
  }

  // Utility method for debugging
  logCacheStatus() {
    const stats = this.getStats();
    console.log('=== CACHE STATUS ===');
    console.log(`Size: ${stats.size} entries`);
    console.log(`Hit Rate: ${stats.hitRate}`);
    console.log(`API Calls Saved: ${stats.apiCallsSaved}`);
    console.log('===================');
  }

  // Preload common data
  async preloadCommonData() {
    console.log('Preloading common cache data...');
    
    try {
      // Preload global market data
      await this.fetchWithCache('global_market', async () => {
        console.log('Preloading global market data...');
        const axios = require('axios');
        const response = await axios.get('https://api.coingecko.com/api/v3/global', {
          timeout: 5000
        });
        return response.data;
      });
      
      // Preload Fear & Greed data
      await this.fetchWithCache('fear_greed', async () => {
        console.log('Preloading Fear & Greed data...');
        const axios = require('axios');
        const response = await axios.get('https://api.alternative.me/fng/?limit=1', {
          timeout: 5000
        });
        return {
          value: parseInt(response.data.data?.[0]?.value || 50),
          classification: response.data.data?.[0]?.value_classification || 'Neutral'
        };
      });
      
      console.log('✅ Common data preloaded successfully');
      this.logCacheStatus();
    } catch (error) {
      console.error('❌ Error preloading cache data:', error.message);
    }
  }

  // Helper method to fetch with cache
  async fetchWithCache(type, fetchFunction, params = {}) {
    // Try cache first
    const cached = this.get(type, params);
    if (cached) {
      return cached;
    }
    
    // Fetch fresh data
    const data = await fetchFunction();
    
    // Cache the result
    this.set(type, data, params);
    
    return data;
  }

  // Rate limiting helper
  canMakeApiCall() {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    
    // Count API calls in the last minute (simplified rate limiting)
    let recentCalls = 0;
    for (const [key, value] of this.cache.entries()) {
      if (now - value.createdAt < oneMinute && value.type !== 'rate_limit_call') {
        // This is an approximation - in production, track actual API calls
        continue;
      }
    }
    
    // CoinGecko allows 50 calls per minute
    return recentCalls < 45; // Leave buffer
  }
}

module.exports = CacheManager;