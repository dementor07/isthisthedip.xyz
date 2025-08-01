class RealTimeService {
  constructor() {
    this.updateInterval = null;
    this.subscribers = [];
    this.lastUpdate = null;
    this.isActive = false;
    this.updateFrequency = 30000; // 30 seconds for price updates
    this.fastUpdateFrequency = 5000; // 5 seconds for live data (pro only)
  }

  subscribe(callback) {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  notifySubscribers(data) {
    this.subscribers.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Subscriber notification error:', error);
      }
    });
  }

  start(userTier = 'free') {
    if (this.isActive) return;
    
    this.isActive = true;
    const frequency = userTier === 'pro' ? this.fastUpdateFrequency : this.updateFrequency;
    
    console.log(`Starting real-time updates every ${frequency/1000}s for ${userTier} user`);
    
    // Initial update
    this.fetchRealTimeData();
    
    // Set up interval
    this.updateInterval = setInterval(() => {
      this.fetchRealTimeData();
    }, frequency);
  }

  stop() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.isActive = false;
    console.log('Stopped real-time updates');
  }

  async fetchRealTimeData() {
    try {
      const response = await fetch('/api/realtime-market', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.lastUpdate = new Date();
        this.notifySubscribers({
          type: 'market_update',
          data: data,
          timestamp: this.lastUpdate
        });
      }
    } catch (error) {
      console.error('Real-time data fetch error:', error);
      this.notifySubscribers({
        type: 'error',
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  async fetchLivePriceData(crypto) {
    try {
      const response = await fetch(`/api/live-price?crypto=${encodeURIComponent(crypto)}`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        this.notifySubscribers({
          type: 'price_update',
          crypto: crypto,
          data: data,
          timestamp: new Date()
        });
        return data;
      }
    } catch (error) {
      console.error('Live price fetch error:', error);
      return null;
    }
  }

  getUpdateStatus() {
    return {
      isActive: this.isActive,
      lastUpdate: this.lastUpdate,
      subscriberCount: this.subscribers.length
    };
  }
}

// Global instance
window.realTimeService = new RealTimeService();