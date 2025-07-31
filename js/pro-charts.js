class ProChartsManager {
  constructor() {
    this.charts = {};
    this.realTimeData = {};
    this.priceHistory = [];
    this.maxHistoryPoints = 100;
    this.colors = {
      primary: '#8B5CF6',
      secondary: '#3B82F6', 
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      gray: '#6B7280'
    };
  }

  initializeProCharts(containerId, cryptoData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="pro-charts-container">
        <!-- Real-time Price Chart -->
        <div class="bg-gray-800 rounded-lg p-6 mb-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">📈 Real-Time Price Movement</h3>
            <div class="flex items-center space-x-4">
              <div class="flex items-center text-sm">
                <div class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
                <span>Live</span>
              </div>
              <div class="text-sm text-gray-400">
                Last: <span id="lastUpdateTime">--:--:--</span>
              </div>
            </div>
          </div>
          <div class="relative">
            <canvas id="realTimePriceChart" width="400" height="200"></canvas>
          </div>
        </div>

        <!-- Advanced Analytics Grid -->
        <div class="grid md:grid-cols-2 gap-6 mb-6">
          <!-- Volume Analysis -->
          <div class="bg-gray-800 rounded-lg p-6">
            <h4 class="text-lg font-semibold mb-4">📊 Volume Analysis</h4>
            <canvas id="volumeAnalysisChart" width="400" height="300"></canvas>
          </div>

          <!-- Market Correlation -->
          <div class="bg-gray-800 rounded-lg p-6">
            <h4 class="text-lg font-semibold mb-4">🔗 Market Correlation</h4>
            <canvas id="correlationChart" width="400" height="300"></canvas>
          </div>
        </div>

        <!-- Technical Indicators -->
        <div class="bg-gray-800 rounded-lg p-6 mb-6">
          <h4 class="text-lg font-semibold mb-4">📉 Technical Indicators</h4>
          <div class="grid md:grid-cols-3 gap-6">
            <!-- RSI -->
            <div class="text-center">
              <div class="text-2xl font-bold mb-2" id="rsiValue">0</div>
              <div class="text-sm text-gray-400">RSI (14)</div>
              <div class="mt-2">
                <canvas id="rsiGauge" width="120" height="60"></canvas>
              </div>
            </div>

            <!-- MACD -->
            <div class="text-center">
              <div class="text-2xl font-bold mb-2" id="macdValue">0.0</div>
              <div class="text-sm text-gray-400">MACD</div>
              <div class="mt-2">
                <canvas id="macdChart" width="120" height="60"></canvas>
              </div>
            </div>

            <!-- Moving Averages -->
            <div class="text-center">
              <div class="text-2xl font-bold mb-2" id="maValue">$0</div>
              <div class="text-sm text-gray-400">20-Day MA</div>
              <div class="text-xs mt-1">
                <span class="text-green-400" id="maTrend">↗ Bullish</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Heat Map -->
        <div class="bg-gray-800 rounded-lg p-6">
          <h4 class="text-lg font-semibold mb-4">🔥 Market Opportunity Heat Map</h4>
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2" id="heatMapGrid">
            <!-- Heat map cells will be generated here -->
          </div>
          <div class="mt-4 text-sm text-gray-400 text-center">
            Color intensity indicates dip opportunity strength
          </div>
        </div>
      </div>
    `;

    this.initializeRealTimeChart(cryptoData);
    this.initializeVolumeChart(cryptoData);
    this.initializeCorrelationChart(cryptoData);
    this.initializeTechnicalIndicators(cryptoData);
    this.initializeHeatMap();
    this.startRealTimeUpdates();
  }

  initializeRealTimeChart(cryptoData) {
    const ctx = document.getElementById('realTimePriceChart');
    if (!ctx) return;

    // Initialize with current price
    const currentPrice = cryptoData.crypto?.price || 0;
    this.priceHistory = [{ time: new Date(), price: currentPrice }];

    this.charts.realTimePrice = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [new Date().toLocaleTimeString()],
        datasets: [{
          label: 'Price',
          data: [currentPrice],
          borderColor: this.colors.primary,
          backgroundColor: `${this.colors.primary}20`,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1F2937',
            titleColor: '#F9FAFB',
            bodyColor: '#D1D5DB',
            callbacks: {
              label: (context) => `Price: $${context.parsed.y.toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: {
              color: '#374151'
            },
            ticks: {
              color: '#9CA3AF',
              maxTicksLimit: 8
            }
          },
          y: {
            display: true,
            grid: {
              color: '#374151'
            },
            ticks: {
              color: '#9CA3AF',
              callback: (value) => `$${value.toLocaleString()}`
            }
          }
        },
        animation: {
          duration: 750,
          easing: 'easeInOutQuart'
        }
      }
    });
  }

  initializeVolumeChart(cryptoData) {
    const ctx = document.getElementById('volumeAnalysisChart');
    if (!ctx) return;

    // Simulate volume data (in real app, fetch from API)
    const volumeData = this.generateVolumeData();

    this.charts.volume = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: volumeData.labels,
        datasets: [{
          label: 'Volume',
          data: volumeData.volumes,
          backgroundColor: volumeData.volumes.map(v => 
            v > volumeData.average ? this.colors.success : this.colors.gray
          ),
          borderColor: this.colors.secondary,
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1F2937',
            callbacks: {
              label: (context) => `Volume: $${(context.parsed.y / 1e6).toFixed(1)}M`
            }
          }
        },
        scales: {
          x: {
            grid: { color: '#374151' },
            ticks: { color: '#9CA3AF' }
          },
          y: {
            grid: { color: '#374151' },
            ticks: { 
              color: '#9CA3AF',
              callback: (value) => `$${(value / 1e6).toFixed(0)}M`
            }
          }
        }
      }
    });
  }

  initializeCorrelationChart(cryptoData) {
    const ctx = document.getElementById('correlationChart');
    if (!ctx) return;

    const correlationData = {
      labels: ['Bitcoin', 'Ethereum', 'Market', 'This Asset'],
      datasets: [{
        label: 'Correlation',
        data: [0.75, 0.65, 0.55, 1.0],
        backgroundColor: [
          this.colors.warning,
          this.colors.secondary,
          this.colors.gray,
          this.colors.primary
        ],
        borderWidth: 0
      }]
    };

    this.charts.correlation = new Chart(ctx, {
      type: 'polarArea',
      data: correlationData,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#D1D5DB' }
          },
          tooltip: {
            backgroundColor: '#1F2937',
            callbacks: {
              label: (context) => `${context.label}: ${(context.parsed.r * 100).toFixed(0)}%`
            }
          }
        },
        scales: {
          r: {
            beginAtZero: true,
            max: 1,
            ticks: {
              color: '#9CA3AF',
              callback: (value) => `${(value * 100).toFixed(0)}%`
            },
            grid: { color: '#374151' }
          }
        }
      }
    });
  }

  initializeTechnicalIndicators(cryptoData) {
    // RSI Gauge
    const rsiCtx = document.getElementById('rsiGauge');
    if (rsiCtx) {
      const rsi = this.calculateRSI(cryptoData);
      document.getElementById('rsiValue').textContent = rsi.toFixed(1);
      this.createGaugeChart(rsiCtx, rsi, 0, 100, [
        { min: 0, max: 30, color: this.colors.success },
        { min: 30, max: 70, color: this.colors.warning },
        { min: 70, max: 100, color: this.colors.danger }
      ]);
    }

    // MACD Chart
    const macdCtx = document.getElementById('macdChart');
    if (macdCtx) {
      const macd = this.calculateMACD(cryptoData);
      document.getElementById('macdValue').textContent = macd.toFixed(3);
      this.createSparklineChart(macdCtx, this.generateMACDHistory(macd));
    }

    // Moving Average
    const ma = this.calculateMovingAverage(cryptoData);
    document.getElementById('maValue').textContent = `$${ma.toLocaleString()}`;
    
    const currentPrice = cryptoData.crypto?.price || 0;
    const trend = currentPrice > ma ? '↗ Bullish' : '↘ Bearish';
    document.getElementById('maTrend').textContent = trend;
    document.getElementById('maTrend').className = currentPrice > ma ? 'text-green-400' : 'text-red-400';
  }

  initializeHeatMap() {
    const heatMapGrid = document.getElementById('heatMapGrid');
    if (!heatMapGrid) return;

    const cryptos = [
      { symbol: 'BTC', score: 45 },
      { symbol: 'ETH', score: 67 },
      { symbol: 'SOL', score: 78 },
      { symbol: 'ADA', score: 34 },
      { symbol: 'DOT', score: 56 },
      { symbol: 'LINK', score: 89 },
      { symbol: 'MATIC', score: 23 },
      { symbol: 'AVAX', score: 91 },
      { symbol: 'ALGO', score: 45 },
      { symbol: 'ATOM', score: 67 },
      { symbol: 'XRP', score: 12 },
      { symbol: 'LTC', score: 78 }
    ];

    heatMapGrid.innerHTML = cryptos.map(crypto => {
      const intensity = crypto.score / 100;
      const bgColor = this.getHeatMapColor(intensity);
      const textColor = intensity > 0.6 ? 'text-white' : 'text-gray-900';
      
      return `
        <div class="aspect-square rounded-lg flex flex-col items-center justify-center text-xs font-bold cursor-pointer hover:scale-105 transition-transform" 
             style="background-color: ${bgColor}" 
             title="${crypto.symbol}: ${crypto.score}/100">
          <div class="${textColor}">${crypto.symbol}</div>
          <div class="${textColor} text-xs opacity-75">${crypto.score}</div>
        </div>
      `;
    }).join('');
  }

  getHeatMapColor(intensity) {
    // Green to red gradient based on intensity
    const red = Math.floor(255 * (1 - intensity));
    const green = Math.floor(255 * intensity);
    return `rgb(${red}, ${green}, 50)`;
  }

  startRealTimeUpdates() {
    // Update real-time chart every 5 seconds
    setInterval(() => {
      this.updateRealTimeChart();
      this.updateLastUpdateTime();
    }, 5000);

    // Update technical indicators every 30 seconds  
    setInterval(() => {
      this.updateTechnicalIndicators();
    }, 30000);
  }

  updateRealTimeChart() {
    if (!this.charts.realTimePrice) return;

    // Simulate price movement (in real app, fetch from API)
    const lastPrice = this.priceHistory[this.priceHistory.length - 1]?.price || 0;
    const newPrice = lastPrice * (1 + (Math.random() - 0.5) * 0.02); // ±1% movement
    const now = new Date();

    this.priceHistory.push({ time: now, price: newPrice });

    // Keep only last 100 points
    if (this.priceHistory.length > this.maxHistoryPoints) {
      this.priceHistory.shift();
    }

    // Update chart
    const chart = this.charts.realTimePrice;
    chart.data.labels = this.priceHistory.map(p => p.time.toLocaleTimeString());
    chart.data.datasets[0].data = this.priceHistory.map(p => p.price);
    chart.update('none'); // No animation for real-time updates
  }

  updateLastUpdateTime() {
    const timeElement = document.getElementById('lastUpdateTime');
    if (timeElement) {
      timeElement.textContent = new Date().toLocaleTimeString();
    }
  }

  updateTechnicalIndicators() {
    // Update RSI
    const newRSI = 30 + Math.random() * 40; // Simulate RSI between 30-70
    document.getElementById('rsiValue').textContent = newRSI.toFixed(1);

    // Update MACD
    const newMACD = (Math.random() - 0.5) * 2; // Simulate MACD between -1 and 1
    document.getElementById('macdValue').textContent = newMACD.toFixed(3);
  }

  // Utility methods for calculations
  calculateRSI(cryptoData) {
    // Simplified RSI calculation (in real app, use proper historical data)
    const change = cryptoData.crypto?.change_24h || 0;
    return Math.max(10, Math.min(90, 50 + change * 2));
  }

  calculateMACD(cryptoData) {
    // Simplified MACD calculation
    const change = cryptoData.crypto?.change_24h || 0;
    return change * 0.1;
  }

  calculateMovingAverage(cryptoData) {
    // Simplified MA calculation
    const currentPrice = cryptoData.crypto?.price || 0;
    return currentPrice * (1 + (Math.random() - 0.5) * 0.05);
  }

  generateVolumeData() {
    const labels = [];
    const volumes = [];
    const now = new Date();

    for (let i = 23; i >= 0; i--) {
      const time = new Date(now - i * 60 * 60 * 1000);
      labels.push(time.getHours() + ':00');
      volumes.push(Math.random() * 100e6 + 10e6); // 10M-110M volume
    }

    const average = volumes.reduce((a, b) => a + b) / volumes.length;
    return { labels, volumes, average };
  }

  generateMACDHistory(currentMACD) {
    const history = [];
    for (let i = 0; i < 20; i++) {
      history.push(currentMACD + (Math.random() - 0.5) * 0.5);
    }
    return history;
  }

  createGaugeChart(ctx, value, min, max, colorRanges) {
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [value - min, max - value],
          backgroundColor: [
            this.getColorForValue(value, colorRanges),
            '#374151'
          ],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        cutout: '70%',
        rotation: -90,
        circumference: 180,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });
  }

  createSparklineChart(ctx, data) {
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map((_, i) => i),
        datasets: [{
          data: data,
          borderColor: this.colors.primary,
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }

  getColorForValue(value, colorRanges) {
    for (const range of colorRanges) {
      if (value >= range.min && value <= range.max) {
        return range.color;
      }
    }
    return this.colors.gray;
  }

  destroy() {
    Object.values(this.charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    this.charts = {};
  }
}

// Global instance
window.proChartsManager = new ProChartsManager();