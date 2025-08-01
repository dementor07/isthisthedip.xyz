require('dotenv').config();

module.exports = {
  // Server Config
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'fallback_secret_change_in_production',
  
  // Stripe Config
  STRIPE: {
    SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    PRICES: {
      PREMIUM: process.env.STRIPE_PRICE_PREMIUM,
      PRO: process.env.STRIPE_PRICE_PRO
    }
  },
  
  // API Keys
  API_KEYS: {
    ALPHA_VANTAGE: process.env.ALPHA_VANTAGE_API_KEY,
    HUGGING_FACE: process.env.HUGGING_FACE_API_TOKEN,
    NEWS_API: process.env.NEWS_API_KEY
  },
  
  // API Endpoints
  APIs: {
    COINGECKO: 'https://api.coingecko.com/api/v3',
    ALPHA_VANTAGE: 'https://www.alphavantage.co/query',
    HUGGING_FACE: 'https://api-inference.huggingface.co/models/ProsusAI/finbert',
    NEWS_API: 'https://newsapi.org/v2/everything',
    FEAR_GREED: 'https://api.alternative.me/fng/'
  },
  
  // Rate Limits
  RATE_LIMITS: {
    FREE_DAILY_SEARCHES: 10,
    API_LIMITS: {
      ALPHA_VANTAGE: 20,  // Free tier: 25/day with buffer
      HUGGING_FACE: 900,  // Buffer under 1000
      NEWS_API: 90        // Buffer under 100
    }
  },
  
  // Subscription Tiers
  TIERS: {
    FREE: 'free',
    PREMIUM: 'premium',
    PRO: 'pro'
  },
  
  // Database
  DATABASE_PATH: process.env.DATABASE_PATH || './database.sqlite'
};