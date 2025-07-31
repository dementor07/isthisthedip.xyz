class CryptoCalculator {
  constructor() {
    this.isAnalyzing = false;
    this.init();
  }

  init() {
    this.attachEventListeners();
    this.updateSearchCounter();
  }

  attachEventListeners() {
    // Main search input
    const searchInput = document.getElementById('cryptoInput');
    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.checkDip();
        }
      });
    }

    // Quick check buttons
    document.addEventListener('click', (e) => {
      if (e.target.matches('[onclick*="quickCheck"]')) {
        e.preventDefault();
        const crypto = e.target.getAttribute('onclick').match(/quickCheck\('([^']+)'\)/)?.[1];
        if (crypto) {
          this.quickCheck(crypto);
        }
      }
    });

    // Main check button
    const checkBtn = document.querySelector('button[onclick="checkDip()"]');
    if (checkBtn) {
      checkBtn.onclick = (e) => {
        e.preventDefault();
        this.checkDip();
      };
    }
  }

  async quickCheck(crypto) {
    const searchInput = document.getElementById('cryptoInput');
    if (searchInput) {
      searchInput.value = crypto;
    }
    await this.checkDip();
  }

  async checkDip() {
    if (this.isAnalyzing) return;

    const cryptoInput = document.getElementById('cryptoInput');
    const crypto = cryptoInput?.value?.trim();
    
    if (!crypto) {
      this.showError('Please enter a cryptocurrency name');
      return;
    }

    // For authenticated users, check if they can search
    if (window.authManager && authManager.isAuthenticated() && !authManager.canSearch()) {
      this.showUpgradePrompt();
      return;
    }

    this.isAnalyzing = true;
    this.showLoading();

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ crypto })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Analysis result:', data); // Debug log
        this.displayResults(data);
        this.updateSearchCounter();
      } else {
        if (response.status === 429) {
          this.showUpgradePrompt(data.error);
        } else {
          this.showError(data.error || 'Analysis failed');
        }
      }
    } catch (error) {
      console.error('Analysis error:', error);
      this.showError('Network error. Please try again.');
    } finally {
      this.isAnalyzing = false;
    }
  }

  showLoading() {
    const resultsSection = document.getElementById('results');
    const signalElement = document.getElementById('signal');
    const signalText = document.getElementById('signalText');
    const signalSubtext = document.getElementById('signalSubtext');

    if (resultsSection) {
      resultsSection.classList.remove('hidden');
    }

    if (signalElement && signalText && signalSubtext) {
      signalElement.className = 'text-center py-8 mb-6 rounded-lg bg-gray-700';
      signalText.textContent = 'ANALYZING...';
      signalSubtext.innerHTML = `
        <div class="space-y-2">
          <div class="text-blue-400">📊 Fetching live price data...</div>
          <div class="text-yellow-400">📈 Analyzing technical indicators...</div>
          <div class="text-purple-400">🧠 Running AI sentiment analysis...</div>
          <div class="text-green-400">⚡ Pro tier: Unlimited searches</div>
        </div>
      `;
      
      // Add pulsing animation
      signalText.classList.add('animate-pulse');
    }

    // Show loading animation
    this.showLoadingAnimation();
  }

  showLoadingAnimation() {
    const steps = [
      'Fetching price data...',
      'Analyzing technical indicators...',
      'Processing market sentiment...',
      'Calculating dip score...'
    ];

    let currentStep = 0;
    const signalSubtext = document.getElementById('signalSubtext');
    
    const interval = setInterval(() => {
      if (signalSubtext && currentStep < steps.length) {
        signalSubtext.textContent = steps[currentStep];
        currentStep++;
      } else {
        clearInterval(interval);
      }
    }, 800);

    // Clear interval when analysis completes
    setTimeout(() => clearInterval(interval), 5000);
  }

  displayResults(data) {
    this.updateCryptoInfo(data);
    this.updateSignal(data);
    this.updatePriceStats(data);
    this.updateDipScore(data);
    
    if (window.authManager && authManager.getTier() !== 'free') {
      this.updatePremiumFeatures(data);
    } else {
      this.showUpgradeFeatures();
    }

    // Show results section
    const resultsSection = document.getElementById('results');
    if (resultsSection) {
      resultsSection.classList.remove('hidden');
      resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  updateCryptoInfo(data) {
    const cryptoName = document.getElementById('cryptoName');
    const cryptoIcon = document.getElementById('cryptoIcon');

    if (cryptoName && data.crypto?.name) {
      cryptoName.textContent = data.crypto.name;
    }

    if (cryptoIcon && data.crypto?.symbol) {
      // Set icon based on crypto symbol
      const icons = {
        'BTC': '₿',
        'ETH': 'Ξ',
        'SOL': '◎',
        'ADA': '₳',
        'DOGE': 'Ð'
      };
      cryptoIcon.textContent = icons[data.crypto.symbol] || '₿';
    }
  }

  updateSignal(data) {
    const signalElement = document.getElementById('signal');
    const signalText = document.getElementById('signalText');
    const signalSubtext = document.getElementById('signalSubtext');

    if (!signalElement || !signalText || !signalSubtext) return;

    signalText.textContent = data.signal || 'UNKNOWN';
    
    // Set signal styling
    let bgColor = 'bg-gray-700';
    let subtext = 'Analysis complete';

    switch (data.signal) {
      case 'STRONG BUY':
        bgColor = 'bg-green-600';
        subtext = 'Excellent buying opportunity!';
        break;
      case 'BUY':
        bgColor = 'bg-green-500';
        subtext = 'Good entry point';
        break;
      case 'MODERATE BUY':
        bgColor = 'bg-yellow-600';
        subtext = 'Consider dollar-cost averaging';
        break;
      case 'WAIT':
        bgColor = 'bg-red-600';
        subtext = 'Wait for better opportunity';
        break;
    }

    signalElement.className = `text-center py-8 mb-6 rounded-lg ${bgColor}`;
    signalSubtext.textContent = subtext;

    // Add confidence indicator for premium users
    if (data.confidence && window.authManager && authManager.getTier() !== 'free') {
      const confidenceSpan = document.createElement('span');
      confidenceSpan.className = `ml-2 text-sm opacity-75`;
      confidenceSpan.textContent = `(${data.confidence} confidence)`;
      signalText.appendChild(confidenceSpan);
    }
  }

  updatePriceStats(data) {
    const currentPrice = document.getElementById('currentPrice');
    const priceChange = document.getElementById('priceChange');

    if (currentPrice && data.crypto?.price) {
      currentPrice.textContent = `$${data.crypto.price.toLocaleString()}`;
    }

    if (priceChange && data.crypto?.change_24h !== undefined) {
      const change = data.crypto.change_24h;
      // Add null/undefined checks and handle NaN values
      if (change !== null && change !== undefined && !isNaN(change)) {
        priceChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        priceChange.className = `text-xl font-bold ${change >= 0 ? 'text-green-500' : 'text-red-500'}`;
      } else {
        priceChange.textContent = 'N/A';
        priceChange.className = 'text-xl font-bold text-gray-500';
      }
    }
  }

  updateDipScore(data) {
    const dipScoreText = document.getElementById('dipScoreText');
    const dipScoreBar = document.getElementById('dipScoreBar');

    if (dipScoreText && data.score !== undefined) {
      dipScoreText.textContent = `${data.score}/100`;
    }

    if (dipScoreBar && data.score !== undefined) {
      dipScoreBar.style.width = `${data.score}%`;
      
      let barColor = 'bg-red-500';
      if (data.score >= 70) barColor = 'bg-green-500';
      else if (data.score >= 40) barColor = 'bg-yellow-500';
      
      dipScoreBar.className = `h-3 rounded-full transition-all duration-500 ${barColor}`;
    }
  }

  updatePremiumFeatures(data) {
    // Show detailed analysis for premium users
    if (data.details) {
      this.showDetailedAnalysis(data);
    }

    const userTier = window.authManager ? authManager.getTier() : 'free';
    
    // Show pro charts for pro users
    if (userTier === 'pro') {
      this.showProCharts(data);
    } else {
      // Show interactive charts for premium users
      this.showPremiumCharts(data);
    }

    if (data.explanation) {
      this.showExplanation(data.explanation);
    }

    if (data.market_analysis) {
      this.showMarketAnalysis(data.market_analysis);
    }

    if (data.recommendations) {
      this.showRecommendations(data.recommendations);
    }

    // Start real-time updates for premium/pro users
    if (userTier !== 'free' && window.realTimeService) {
      this.startRealTimeUpdates(data.crypto?.symbol || data.crypto?.name);
    }
  }

  showDetailedAnalysis(data) {
    const analysisElement = this.createOrUpdateElement('detailed-analysis-section', `
      <div class="premium-feature mt-6 p-4 bg-gray-800 rounded-lg">
        <h4 class="text-lg font-semibold mb-4">🔍 Comprehensive Analysis</h4>
        
        <!-- Market Data -->
        <div class="grid md:grid-cols-2 gap-4 mb-4">
          <div class="bg-gray-900 rounded p-3">
            <div class="text-sm text-gray-400">Fear & Greed Index</div>
            <div class="text-xl font-bold ${data.details.fear_greed < 25 ? 'text-green-400' : data.details.fear_greed > 75 ? 'text-red-400' : 'text-yellow-400'}">
              ${data.details.fear_greed}/100
            </div>
          </div>
          <div class="bg-gray-900 rounded p-3">
            <div class="text-sm text-gray-400">Bitcoin Dominance</div>
            <div class="text-xl font-bold">${data.details.bitcoin_dominance}%</div>
          </div>
        </div>

        <!-- Price Analysis -->
        <div class="grid md:grid-cols-3 gap-4 mb-4">
          <div class="bg-gray-900 rounded p-3">
            <div class="text-sm text-gray-400">Market Cap</div>
            <div class="text-lg font-bold">$${this.formatLargeNumber(data.details.asset_market_cap)}</div>
          </div>
          <div class="bg-gray-900 rounded p-3">
            <div class="text-sm text-gray-400">24h Volume</div>
            <div class="text-lg font-bold">$${this.formatLargeNumber(data.details.asset_volume)}</div>
          </div>
          <div class="bg-gray-900 rounded p-3">
            <div class="text-sm text-gray-400">ATH Distance</div>
            <div class="text-lg font-bold ${data.details.ath_distance < -30 ? 'text-green-400' : 'text-red-400'}">
              ${data.details.ath_distance ? data.details.ath_distance.toFixed(1) : 'N/A'}%
            </div>
          </div>
        </div>

        <!-- Market Conditions -->
        <div class="bg-gray-900 rounded p-3">
          <div class="text-sm text-gray-400 mb-2">Market Conditions</div>
          <div class="text-sm">
            Market Cap Change: <span class="font-bold ${data.details.market_cap_change > 0 ? 'text-green-400' : 'text-red-400'}">
              ${data.details.market_cap_change ? data.details.market_cap_change.toFixed(2) : '0.00'}%
            </span>
          </div>
        </div>
      </div>
    `);

    this.insertAfterDipScore(analysisElement);
  }

  showMarketAnalysis(marketAnalysis) {
    const marketElement = this.createOrUpdateElement('market-analysis-section', `
      <div class="premium-feature mt-4 p-4 bg-gray-800 rounded-lg">
        <h4 class="text-lg font-semibold mb-3">📊 Market Analysis</h4>
        <div class="grid md:grid-cols-2 gap-4">
          <div>
            <div class="text-sm text-gray-400">Sentiment Score</div>
            <div class="text-lg font-bold">${marketAnalysis.sentiment_score}/100</div>
          </div>
          <div>
            <div class="text-sm text-gray-400">Volume Analysis</div>
            <div class="text-lg font-bold ${
              marketAnalysis.volume_analysis === 'Very High' ? 'text-green-400' :
              marketAnalysis.volume_analysis === 'High' ? 'text-blue-400' :
              marketAnalysis.volume_analysis === 'Moderate' ? 'text-yellow-400' : 'text-gray-400'
            }">${marketAnalysis.volume_analysis}</div>
          </div>
          <div>
            <div class="text-sm text-gray-400">Bitcoin Correlation</div>
            <div class="text-lg font-bold ${marketAnalysis.bitcoin_correlation > 0 ? 'text-green-400' : 'text-red-400'}">
              ${marketAnalysis.bitcoin_correlation ? marketAnalysis.bitcoin_correlation.toFixed(2) : '0.00'}%
            </div>
          </div>
          <div>
            <div class="text-sm text-gray-400">Market Strength</div>
            <div class="text-lg font-bold ${marketAnalysis.market_strength === 'Rising' ? 'text-green-400' : 'text-red-400'}">
              ${marketAnalysis.market_strength}
            </div>
          </div>
        </div>
      </div>
    `);

    this.insertAfterDipScore(marketElement);
  }

  formatLargeNumber(num) {
    if (!num) return '0';
    if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toLocaleString();
  }

  showExplanation(explanation) {
    const explanationElement = this.createOrUpdateElement('explanation-section', `
      <div class="premium-feature mt-4 p-4 bg-gray-800 rounded-lg">
        <h4 class="text-lg font-semibold mb-2">Analysis Explanation</h4>
        <p class="text-gray-300">${explanation}</p>
      </div>
    `);

    this.insertAfterDipScore(explanationElement);
  }

  showRecommendations(recommendations) {
    const recommendationsList = recommendations.map(rec => `<li>${rec}</li>`).join('');
    const recommendationsElement = this.createOrUpdateElement('recommendations-section', `
      <div class="premium-feature mt-4 p-4 bg-gray-800 rounded-lg">
        <h4 class="text-lg font-semibold mb-2">Recommendations</h4>
        <ul class="list-disc list-inside text-gray-300 space-y-1">
          ${recommendationsList}
        </ul>
      </div>
    `);

    this.insertAfterDipScore(recommendationsElement);
  }

  showUpgradeFeatures() {
    const upgradeElement = this.createOrUpdateElement('upgrade-features', `
      <div class="upgrade-prompt mt-6 p-6 bg-gradient-to-r from-purple-900 to-blue-900 rounded-lg border border-purple-600">
        <h4 class="text-xl font-semibold mb-3">🚀 Unlock Advanced Analysis</h4>
        <div class="grid md:grid-cols-2 gap-4 mb-4">
          <div class="flex items-center">
            <span class="text-green-400 mr-2">✓</span>
            <span>Detailed score breakdown</span>
          </div>
          <div class="flex items-center">
            <span class="text-green-400 mr-2">✓</span>
            <span>AI-powered explanations</span>
          </div>
          <div class="flex items-center">
            <span class="text-green-400 mr-2">✓</span>
            <span>Trading recommendations</span>
          </div>
          <div class="flex items-center">
            <span class="text-green-400 mr-2">✓</span>
            <span>Unlimited searches</span>
          </div>
        </div>
        <button class="upgrade-btn w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition">
          Upgrade to Premium - $9.99/month
        </button>
      </div>
    `);

    this.insertAfterDipScore(upgradeElement);
  }

  createOrUpdateElement(id, html) {
    let element = document.getElementById(id);
    if (!element) {
      element = document.createElement('div');
      element.id = id;
    }
    element.innerHTML = html;
    return element;
  }

  insertAfterDipScore(element) {
    // Use more compatible selector instead of :has() for better browser support
    const dipScoreBar = document.getElementById('dipScoreBar');
    let dipScoreContainer = null;
    
    if (dipScoreBar) {
      // Find the closest container with the mb-6 class
      let parent = dipScoreBar.parentElement;
      while (parent) {
        if (parent.classList && parent.classList.contains('mb-6')) {
          dipScoreContainer = parent;
          break;
        }
        parent = parent.parentElement;
      }
    }
    
    if (dipScoreContainer && dipScoreContainer.parentNode) {
      dipScoreContainer.parentNode.insertBefore(element, dipScoreContainer.nextSibling);
    } else {
      // Fallback: append to results container
      const resultsContainer = document.getElementById('results');
      if (resultsContainer) {
        resultsContainer.appendChild(element);
      }
    }
  }

  showPremiumCharts(data) {
    const chartsElement = this.createOrUpdateElement('premium-charts-section', `
      <div class="premium-feature mt-6">
        <h4 class="text-xl font-bold mb-6">📈 Interactive Charts & Analysis</h4>
        
        <!-- Chart Tabs -->
        <div class="flex space-x-1 mb-6 bg-gray-800 p-1 rounded-lg">
          <button class="chart-tab active flex-1 py-2 px-4 rounded-md transition bg-purple-600 text-white" data-chart="score">
            Score Breakdown
          </button>
          <button class="chart-tab flex-1 py-2 px-4 rounded-md transition hover:bg-gray-700" data-chart="market">
            Market Analysis
          </button>
          <button class="chart-tab flex-1 py-2 px-4 rounded-md transition hover:bg-gray-700" data-chart="comparison">
            Market Comparison
          </button>
        </div>

        <!-- Chart Container -->
        <div class="bg-gray-800 rounded-lg p-6">
          <!-- Score Breakdown Chart -->
          <div id="score-chart-container" class="chart-container">
            <canvas id="scoreBreakdownChart" width="400" height="300"></canvas>
          </div>
          
          <!-- Market Analysis Chart -->
          <div id="market-chart-container" class="chart-container hidden">
            <canvas id="marketAnalysisChart" width="400" height="300"></canvas>
          </div>
          
          <!-- Market Comparison Chart -->
          <div id="comparison-chart-container" class="chart-container hidden">
            <canvas id="marketComparisonChart" width="400" height="300"></canvas>
          </div>
        </div>

        <!-- Chart Legend -->
        <div class="bg-gray-900 rounded-lg p-4 mt-4">
          <div class="text-sm text-gray-400 mb-2">Chart Insights:</div>
          <div id="chart-insights" class="text-sm text-gray-300">
            Interactive charts show comprehensive analysis factors that determine the dip score.
          </div>
        </div>
      </div>
    `);

    this.insertAfterDipScore(chartsElement);
    this.initializeCharts(data);
    this.attachChartTabListeners();
  }

  initializeCharts(data) {
    // Destroy existing charts if they exist
    if (window.scoreChart) window.scoreChart.destroy();
    if (window.marketChart) window.marketChart.destroy();
    if (window.comparisonChart) window.comparisonChart.destroy();

    // Chart 1: Score Breakdown
    this.createScoreBreakdownChart(data);
    
    // Chart 2: Market Analysis
    this.createMarketAnalysisChart(data);
    
    // Chart 3: Market Comparison
    this.createMarketComparisonChart(data);
  }

  createScoreBreakdownChart(data) {
    const ctx = document.getElementById('scoreBreakdownChart');
    if (!ctx) return;
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('Chart.js is not loaded');
      ctx.parentElement.innerHTML = '<div class="text-gray-400 text-center py-8">Charts require Chart.js library</div>';
      return;
    }

    // Calculate component scores for visualization
    const priceScore = this.calculateDisplayPriceScore(data);
    const marketScore = this.calculateDisplayMarketScore(data);
    
    window.scoreChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Price Action', 'Market Conditions', 'Remaining'],
        datasets: [{
          data: [priceScore * 0.6, marketScore * 0.4, 100 - data.score],
          backgroundColor: [
            '#3B82F6', // Blue for price
            '#10B981', // Green for market
            '#374151'  // Gray for remaining
          ],
          borderColor: '#1F2937',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: '#D1D5DB',
              padding: 20
            }
          },
          tooltip: {
            backgroundColor: '#1F2937',
            titleColor: '#F9FAFB',
            bodyColor: '#D1D5DB',
            borderColor: '#374151',
            borderWidth: 1
          }
        }
      }
    });
  }

  createMarketAnalysisChart(data) {
    const ctx = document.getElementById('marketAnalysisChart');
    if (!ctx) return;
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('Chart.js is not loaded');
      ctx.parentElement.innerHTML = '<div class="text-gray-400 text-center py-8">Charts require Chart.js library</div>';
      return;
    }

    const marketFactors = [
      'Fear & Greed',
      'Bitcoin Dominance', 
      'Volume Analysis',
      'Market Structure',
      'Relative Performance'
    ];

    const marketValues = [
      this.normalizeValue(data.details?.fear_greed || 50, 0, 100),
      this.normalizeValue(data.details?.bitcoin_dominance || 50, 0, 100),
      this.getVolumeScore(data.market_analysis?.volume_analysis),
      this.normalizeValue(Math.abs(data.details?.market_cap_change || 0), 0, 10) * 10,
      50 + (data.crypto?.change_24h || 0) // Relative performance proxy
    ];

    window.marketChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: marketFactors,
        datasets: [{
          label: 'Market Factors',
          data: marketValues,
          backgroundColor: 'rgba(139, 92, 246, 0.2)',
          borderColor: '#8B5CF6',
          borderWidth: 2,
          pointBackgroundColor: '#8B5CF6',
          pointBorderColor: '#FFFFFF',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: {
              color: '#9CA3AF'
            },
            grid: {
              color: '#374151'
            },
            angleLines: {
              color: '#374151'
            }
          }
        },
        plugins: {
          legend: {
            labels: {
              color: '#D1D5DB'
            }
          }
        }
      }
    });
  }

  createMarketComparisonChart(data) {
    const ctx = document.getElementById('marketComparisonChart');
    if (!ctx) return;
    
    // Check if Chart.js is loaded
    if (typeof Chart === 'undefined') {
      console.error('Chart.js is not loaded');
      ctx.parentElement.innerHTML = '<div class="text-gray-400 text-center py-8">Charts require Chart.js library</div>';
      return;
    }

    // Simulated comparison data (in real app, you'd fetch multiple cryptos)
    const comparisonData = {
      labels: ['This Crypto', 'Bitcoin', 'Ethereum', 'Market Average'],
      datasets: [{
        label: 'Dip Score',
        data: [
          data.score,
          Math.max(20, data.score - 10 + Math.random() * 20),
          Math.max(15, data.score - 5 + Math.random() * 15),
          45
        ],
        backgroundColor: [
          '#8B5CF6', // Purple for current crypto
          '#F59E0B', // Orange for Bitcoin
          '#3B82F6', // Blue for Ethereum
          '#6B7280'  // Gray for average
        ],
        borderColor: '#1F2937',
        borderWidth: 1
      }]
    };

    window.comparisonChart = new Chart(ctx, {
      type: 'bar',
      data: comparisonData,
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: '#1F2937',
            titleColor: '#F9FAFB',
            bodyColor: '#D1D5DB'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              color: '#9CA3AF'
            },
            grid: {
              color: '#374151'
            }
          },
          x: {
            ticks: {
              color: '#D1D5DB'
            },
            grid: {
              display: false
            }
          }
        }
      }
    });
  }

  attachChartTabListeners() {
    document.querySelectorAll('.chart-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const chartType = e.target.dataset.chart;
        
        // Update active tab
        document.querySelectorAll('.chart-tab').forEach(t => {
          t.classList.remove('active', 'bg-purple-600', 'text-white');
          t.classList.add('hover:bg-gray-700');
        });
        
        e.target.classList.add('active', 'bg-purple-600', 'text-white');
        e.target.classList.remove('hover:bg-gray-700');
        
        // Show corresponding chart
        document.querySelectorAll('.chart-container').forEach(container => {
          container.classList.add('hidden');
        });
        
        document.getElementById(`${chartType}-chart-container`).classList.remove('hidden');
        
        // Update insights
        this.updateChartInsights(chartType);
      });
    });
  }

  updateChartInsights(chartType) {
    const insights = {
      score: 'Doughnut chart shows how price action and market conditions contribute to the final dip score.',
      market: 'Radar chart displays the strength of various market factors affecting this cryptocurrency.',
      comparison: 'Bar chart compares this crypto\'s dip opportunity against major cryptocurrencies and market average.'
    };
    
    document.getElementById('chart-insights').textContent = insights[chartType];
  }

  calculateDisplayPriceScore(data) {
    // Estimate price score for display
    let score = 0;
    const change24h = data.crypto?.change_24h || 0;
    const athDistance = data.details?.ath_distance || 0;
    
    if (change24h < -5) score += 25;
    if (change24h < -10) score += 20;
    if (athDistance < -30) score += 15;
    if (athDistance < -50) score += 30;
    
    return Math.min(100, score);
  }

  calculateDisplayMarketScore(data) {
    // Estimate market score for display
    const fearGreed = data.details?.fear_greed || 50;
    let score = 0;
    
    if (fearGreed < 25) score += 40;
    else if (fearGreed < 40) score += 30;
    else if (fearGreed < 60) score += 20;
    
    return Math.min(100, score);
  }

  normalizeValue(value, min, max) {
    return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  }

  getVolumeScore(volumeAnalysis) {
    const scores = {
      'Very High': 90,
      'High': 75,
      'Moderate': 50,
      'Low': 25,
      'Very Low': 10
    };
    return scores[volumeAnalysis] || 50;
  }

  showProCharts(data) {
    // Initialize advanced pro charts with real-time features
    const proChartsElement = this.createOrUpdateElement('pro-charts-section', `
      <div class="pro-feature mt-6 p-6 bg-gradient-to-br from-purple-900 to-blue-900 rounded-lg border border-purple-600">
        <div class="flex items-center justify-between mb-6">
          <h4 class="text-xl font-bold flex items-center">
            <span class="mr-2">⚡</span> Real-Time Pro Analysis
          </h4>
          <div class="flex items-center text-sm">
            <div class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
            <span>Live Updates</span>
          </div>
        </div>
        <div id="pro-charts-container"></div>
      </div>
    `);

    this.insertAfterDipScore(proChartsElement);

    // Initialize pro charts manager
    if (window.proChartsManager) {
      window.proChartsManager.initializeProCharts('pro-charts-container', data);
    }
  }

  startRealTimeUpdates(cryptoSymbol) {
    if (!window.realTimeService) return;

    // Stop any existing real-time updates to prevent race conditions
    this.stopRealTimeUpdates();

    const userTier = window.authManager ? authManager.getTier() : 'free';
    
    // Subscribe to real-time updates
    const unsubscribe = window.realTimeService.subscribe((update) => {
      this.handleRealTimeUpdate(update, cryptoSymbol);
    });

    // Start the service
    window.realTimeService.start(userTier);

    // Store unsubscribe function for cleanup
    this.realTimeUnsubscribe = unsubscribe;

    // Show real-time status indicator
    this.showRealTimeStatus();
  }

  stopRealTimeUpdates() {
    // Clean up existing subscription
    if (this.realTimeUnsubscribe) {
      this.realTimeUnsubscribe();
      this.realTimeUnsubscribe = null;
    }

    // Stop the real-time service
    if (window.realTimeService) {
      window.realTimeService.stop();
    }

    // Hide real-time status indicator
    this.hideRealTimeStatus();
  }

  handleRealTimeUpdate(update, currentCrypto) {
    switch (update.type) {
      case 'market_update':
        this.updateMarketIndicators(update.data);
        break;
      case 'price_update':
        if (update.crypto.toLowerCase() === currentCrypto.toLowerCase()) {
          this.updatePriceDisplay(update.data);
        }
        break;
      case 'error':
        console.warn('Real-time update error:', update.error);
        break;
    }
  }

  updateMarketIndicators(marketData) {
    // Update Fear & Greed index in header
    const fearGreedElement = document.getElementById('fearGreedIndex');
    if (fearGreedElement && marketData.fearGreed) {
      fearGreedElement.textContent = `${marketData.fearGreed}/100`;
      fearGreedElement.className = `font-bold ${
        marketData.fearGreed < 25 ? 'text-green-400' :
        marketData.fearGreed > 75 ? 'text-red-400' : 'text-yellow-400'
      }`;
    }

    // Update any market data displays in detailed analysis
    const marketCapElement = document.querySelector('[data-market-cap]');
    if (marketCapElement && marketData.totalMarketCap) {
      marketCapElement.textContent = `$${this.formatLargeNumber(marketData.totalMarketCap)}`;
    }
  }

  updatePriceDisplay(priceData) {
    // Update current price
    const currentPrice = document.getElementById('currentPrice');
    if (currentPrice && priceData.price) {
      currentPrice.textContent = `$${priceData.price.toLocaleString()}`;
      currentPrice.classList.add('animate-pulse');
      setTimeout(() => currentPrice.classList.remove('animate-pulse'), 1000);
    }

    // Update price change
    const priceChange = document.getElementById('priceChange');
    if (priceChange && priceData.change24h !== undefined) {
      const change = priceData.change24h;
      // Add null/undefined checks and handle NaN values
      if (change !== null && change !== undefined && !isNaN(change)) {
        priceChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
        priceChange.className = `text-xl font-bold ${change >= 0 ? 'text-green-500' : 'text-red-500'}`;
        priceChange.classList.add('animate-pulse');
        setTimeout(() => priceChange.classList.remove('animate-pulse'), 1000);
      } else {
        priceChange.textContent = 'N/A';
        priceChange.className = 'text-xl font-bold text-gray-500';
      }
    }
  }

  showRealTimeStatus() {
    const statusElement = this.createOrUpdateElement('realtime-status', `
      <div class="fixed bottom-4 right-4 bg-gray-800 border border-green-500 rounded-lg p-3 shadow-lg z-50">
        <div class="flex items-center text-sm">
          <div class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></div>
          <span class="text-green-400 font-medium">Real-time updates active</span>
        </div>
        <div class="text-xs text-gray-400 mt-1">
          Updates every ${window.authManager && authManager.getTier() === 'pro' ? '5' : '30'} seconds
        </div>
      </div>
    `);

    document.body.appendChild(statusElement);

    // Auto-hide after 5 seconds
    setTimeout(() => {
      statusElement.style.opacity = '0';
      statusElement.style.transform = 'translateY(20px)';
      setTimeout(() => statusElement.remove(), 300);
    }, 5000);
  }

  hideRealTimeStatus() {
    const statusElement = document.getElementById('realtime-status');
    if (statusElement) {
      statusElement.style.opacity = '0';
      statusElement.style.transform = 'translateY(20px)';
      setTimeout(() => statusElement.remove(), 300);
    }
  }

  showUpgradePrompt(message = 'Daily search limit reached') {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-gray-800 p-8 rounded-lg max-w-md mx-4">
        <h3 class="text-xl font-bold mb-4">Upgrade Required</h3>
        <p class="text-gray-300 mb-6">${message}</p>
        <div class="flex gap-3">
          <button class="upgrade-btn flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded">
            Upgrade Now
          </button>
          <button class="close-modal flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">
            Later
          </button>
        </div>
      </div>
    `;

    modal.querySelector('.close-modal').onclick = () => modal.remove();
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };

    document.body.appendChild(modal);
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-600 text-white p-4 rounded-lg z-50';
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  updateSearchCounter() {
    const counterElements = document.querySelectorAll('.search-counter');
    const remaining = window.authManager ? authManager.getSearchesRemaining() : 0;
    
    counterElements.forEach(el => {
      if (remaining === 'unlimited') {
        el.textContent = 'Unlimited searches';
        el.className = 'search-counter text-green-400';
      } else {
        el.textContent = `${remaining} searches remaining today`;
        el.className = `search-counter ${remaining === 0 ? 'text-red-400' : 'text-yellow-400'}`;
      }
    });
  }
}

// Initialize calculator
const cryptoCalculator = new CryptoCalculator();
window.cryptoCalculator = cryptoCalculator;

// Legacy function support for existing onclick handlers
// Add checks to ensure cryptoCalculator is initialized
window.checkDip = () => {
  if (window.cryptoCalculator) {
    window.cryptoCalculator.checkDip();
  } else {
    console.error('Crypto calculator not initialized');
  }
};

window.quickCheck = (crypto) => {
  if (window.cryptoCalculator) {
    window.cryptoCalculator.quickCheck(crypto);
  } else {
    console.error('Crypto calculator not initialized');
  }
};