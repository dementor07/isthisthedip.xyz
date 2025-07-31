const axios = require('axios');
const config = require('./config');

class SentimentAnalyzer {
  constructor(cache) {
    this.cache = cache;
    this.huggingFaceToken = config.API_KEYS.HUGGING_FACE;
    this.newsApiKey = config.API_KEYS.NEWS_API;
    this.dailyCalls = 0;
    this.maxDailyCalls = 800; // Buffer under 1000 limit
  }

  canMakeCall() {
    return this.dailyCalls < this.maxDailyCalls && this.huggingFaceToken;
  }

  incrementCallCount() {
    this.dailyCalls++;
    console.log(`HuggingFace calls today: ${this.dailyCalls}/${this.maxDailyCalls}`);
  }

  async analyzeCryptoSentiment(cryptoSymbol, cryptoName) {
    if (!this.canMakeCall()) {
      console.log(`HuggingFace: Daily limit reached (${this.dailyCalls}/${this.maxDailyCalls}) or no API key`);
      return this.getDefaultSentiment(cryptoSymbol);
    }

    const cacheKey = `sentiment_${cryptoSymbol.toLowerCase()}`;
    
    return await this.cache.fetchWithCache('sentiment_analysis', async () => {
      try {
        console.log(`API CALL: Fetching news sentiment for ${cryptoName}`);
        
        // Get recent news articles
        const newsArticles = await this.getRecentNews(cryptoName);
        
        if (!newsArticles || newsArticles.length === 0) {
          console.log('No news articles found, using neutral sentiment');
          return this.getDefaultSentiment(cryptoSymbol);
        }

        // Analyze sentiment of news headlines and descriptions
        const sentimentResults = await this.analyzeNewsArticles(newsArticles);
        
        const sentiment = this.calculateOverallSentiment(sentimentResults);
        
        console.log(`✅ Sentiment analysis for ${cryptoName}:`, {
          score: sentiment.score,
          classification: sentiment.classification,
          confidence: sentiment.confidence,
          articlesAnalyzed: sentimentResults.length
        });

        return {
          symbol: cryptoSymbol,
          name: cryptoName,
          sentiment: sentiment,
          articlesAnalyzed: sentimentResults.length,
          recentNews: newsArticles.slice(0, 3), // Top 3 news items
          timestamp: new Date().toISOString(),
          dataSource: 'huggingface_finbert'
        };

      } catch (error) {
        console.error(`❌ Sentiment analysis error for ${cryptoName}:`, error.message);
        
        // Check if it's a rate limit error
        if (error.response?.status === 429) {
          console.log('⚠️  HuggingFace rate limit exceeded, using neutral sentiment');
          this.dailyCalls = this.maxDailyCalls; // Mark as exhausted
        }
        
        return this.getDefaultSentiment(cryptoSymbol);
      }
    }, { symbol: cryptoSymbol });
  }

  async getRecentNews(cryptoName) {
    try {
      const searchTerms = [
        cryptoName,
        cryptoName === 'Bitcoin' ? 'BTC' : cryptoName.substring(0, 3).toUpperCase()
      ].join(' OR ');

      const response = await axios.get(config.APIs.NEWS_API, {
        params: {
          q: searchTerms,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 10,
          apiKey: this.newsApiKey
        },
        timeout: 8000
      });

      if (response.data.articles && response.data.articles.length > 0) {
        // Filter and clean articles
        return response.data.articles
          .filter(article => article.title && article.description)
          .filter(article => !article.title.includes('[Removed]'))
          .map(article => ({
            title: article.title,
            description: article.description,
            publishedAt: article.publishedAt,
            source: article.source.name,
            url: article.url
          }))
          .slice(0, 5); // Limit to 5 most recent
      }

      return [];

    } catch (error) {
      console.error('News API error:', error.message);
      return [];
    }
  }

  async analyzeNewsArticles(articles) {
    const sentimentResults = [];
    
    for (const article of articles) {
      try {
        // Combine title and description for analysis
        const textToAnalyze = `${article.title}. ${article.description}`;
        
        if (textToAnalyze.length > 500) {
          // Truncate if too long to avoid API limits
          textToAnalyze = textToAnalyze.substring(0, 500);
        }

        const sentiment = await this.analyzeTextSentiment(textToAnalyze);
        
        sentimentResults.push({
          title: article.title,
          sentiment: sentiment,
          publishedAt: article.publishedAt,
          source: article.source
        });
        
        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error('Error analyzing article sentiment:', error.message);
        // Continue with other articles even if one fails
      }
    }
    
    return sentimentResults;
  }

  async analyzeTextSentiment(text) {
    if (!this.canMakeCall()) {
      return { label: 'neutral', score: 0.5 };
    }

    this.incrementCallCount();

    const response = await axios.post(
      config.APIs.HUGGING_FACE,
      { inputs: text },
      {
        headers: {
          'Authorization': `Bearer ${this.huggingFaceToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    // FinBERT returns sentiment scores
    if (response.data && Array.isArray(response.data) && response.data.length > 0) {
      const results = response.data[0];
      
      // Find the highest confidence sentiment
      const topSentiment = results.reduce((prev, current) => 
        (prev.score > current.score) ? prev : current
      );

      return {
        label: topSentiment.label.toLowerCase(), // positive, negative, neutral
        score: topSentiment.score,
        confidence: topSentiment.score
      };
    }

    return { label: 'neutral', score: 0.5, confidence: 0.5 };
  }

  calculateOverallSentiment(sentimentResults) {
    if (sentimentResults.length === 0) {
      return { score: 50, classification: 'neutral', confidence: 'low' };
    }

    let positiveCount = 0;
    let negativeCount = 0;
    let neutralCount = 0;
    let totalConfidence = 0;

    sentimentResults.forEach(result => {
      const sentiment = result.sentiment;
      totalConfidence += sentiment.confidence;

      if (sentiment.label === 'positive') {
        positiveCount++;
      } else if (sentiment.label === 'negative') {
        negativeCount++;
      } else {
        neutralCount++;
      }
    });

    const avgConfidence = totalConfidence / sentimentResults.length;
    const total = sentimentResults.length;

    // Calculate sentiment score (0-100 scale)
    const positiveRatio = positiveCount / total;
    const negativeRatio = negativeCount / total;
    
    // Sentiment score: 0 = very negative, 50 = neutral, 100 = very positive
    let sentimentScore = 50; // Start neutral
    sentimentScore += (positiveRatio * 40); // Add up to 40 for positive news
    sentimentScore -= (negativeRatio * 40); // Subtract up to 40 for negative news
    
    // Weight by confidence
    sentimentScore = 50 + ((sentimentScore - 50) * avgConfidence);
    
    sentimentScore = Math.max(0, Math.min(100, Math.round(sentimentScore)));

    // Determine classification
    let classification;
    if (sentimentScore >= 70) classification = 'very_positive';
    else if (sentimentScore >= 60) classification = 'positive';
    else if (sentimentScore >= 40) classification = 'neutral';
    else if (sentimentScore >= 30) classification = 'negative';
    else classification = 'very_negative';

    // Determine confidence level
    let confidenceLevel;
    if (avgConfidence >= 0.8) confidenceLevel = 'high';
    else if (avgConfidence >= 0.6) confidenceLevel = 'medium';
    else confidenceLevel = 'low';

    return {
      score: sentimentScore,
      classification,
      confidence: confidenceLevel,
      breakdown: {
        positive: positiveCount,
        negative: negativeCount,
        neutral: neutralCount,
        avgConfidence: Math.round(avgConfidence * 100) / 100
      }
    };
  }

  scoreSentiment(sentimentData) {
    if (!sentimentData || sentimentData.sentiment.confidence === 'low') {
      return 50; // Neutral if no reliable data
    }

    const sentimentScore = sentimentData.sentiment.score;
    
    // Convert sentiment to buy opportunity score
    // High positive sentiment = lower buy score (FOMO risk)
    // High negative sentiment = higher buy score (fear opportunity)
    
    if (sentimentScore >= 80) return 20; // Very positive = poor buy (euphoria)
    if (sentimentScore >= 70) return 35; // Positive = below average buy
    if (sentimentScore >= 60) return 45; // Slightly positive = neutral
    if (sentimentScore >= 40) return 55; // Neutral = slightly positive buy
    if (sentimentScore >= 30) return 70; // Negative = good buy (fear)
    if (sentimentScore >= 20) return 85; // Very negative = excellent buy (panic)
    return 90; // Extremely negative = best buy opportunity
  }

  getDefaultSentiment(symbol) {
    return {
      symbol,
      sentiment: { 
        score: 50, 
        classification: 'neutral', 
        confidence: 'low',
        breakdown: { positive: 0, negative: 0, neutral: 1, avgConfidence: 0.5 }
      },
      articlesAnalyzed: 0,
      recentNews: [],
      timestamp: new Date().toISOString(),
      dataSource: 'fallback'
    };
  }

  getCallStats() {
    return {
      dailyCalls: this.dailyCalls,
      maxDailyCalls: this.maxDailyCalls,
      remaining: this.maxDailyCalls - this.dailyCalls,
      hasApiKey: !!this.huggingFaceToken,
      hasNewsApiKey: !!this.newsApiKey
    };
  }
}

module.exports = SentimentAnalyzer;