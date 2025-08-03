// Complete AI Trading Advisor for Premium/Pro Users with Real AI Integration
import { authenticateToken, getUserById } from './prisma-utils.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { crypto, portfolioSize, riskTolerance, investmentGoal, timeHorizon } = req.body;
    
    // Validate required fields
    if (!crypto || !portfolioSize || !riskTolerance || !investmentGoal || !timeHorizon) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['crypto', 'portfolioSize', 'riskTolerance', 'investmentGoal', 'timeHorizon'],
        received: { crypto, portfolioSize, riskTolerance, investmentGoal, timeHorizon }
      });
    }
    
    // Authenticate user using cookie-based auth
    const decoded = authenticateToken(req);
    
    if (!decoded) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in.',
        redirect_url: '/login'
      });
    }

    // Get fresh user data from database
    const user = await getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ 
        error: 'User not found. Please log in again.',
        redirect_url: '/login'
      });
    }
    
    // Check subscription tier
    if (user.tier !== 'premium' && user.tier !== 'pro') {
      return res.status(403).json({ 
        error: 'AI Trading Advisor requires Premium or Pro subscription',
        upgrade_url: '/pricing',
        current_tier: user.tier
      });
    }

    // Generate comprehensive AI-powered trading advice
    const tradingAdvice = await generateAITradingAdvice({
      crypto,
      portfolioSize,
      riskTolerance,
      investmentGoal,
      timeHorizon,
      userTier: user.tier,
      userHistory: user.analysisHistory || []
    });

    return res.status(200).json({
      success: true,
      advice: tradingAdvice,
      timestamp: new Date(),
      tier: user.tier,
      dataQuality: {
        marketData: 'current',
        technicalAnalysis: tradingAdvice.aiInsights?.dataQuality?.warnings?.includes('Technical analysis unavailable') ? 'limited' : 'available',
        sentimentData: tradingAdvice.aiInsights?.dataQuality?.warnings?.includes('Sentiment data unavailable') ? 'limited' : 'available',
        aiAnalysis: tradingAdvice.aiInsights?.sources?.length > 1 ? 'full' : 'basic',
        overall: tradingAdvice.aiInsights?.dataQuality?.reliable ? 'high' : 'medium'
      }
    });

  } catch (error) {
    console.error('Trading Advisor error:', error);
    return res.status(500).json({ 
      error: 'Trading analysis failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// ==================== MAIN AI TRADING ADVICE GENERATION ====================

async function generateAITradingAdvice({
  crypto,
  portfolioSize,
  riskTolerance,
  investmentGoal,
  timeHorizon,
  userTier,
  userHistory
}) {
  console.log(`🤖 Generating AI trading advice for ${crypto} (${userTier} user)`);

  // Get real market data (required)
  const marketData = await getEnhancedMarketData(crypto);
  if (!marketData || !marketData.price) {
    throw new Error(`Unable to retrieve real market data for ${crypto}. Trading analysis requires current market data.`);
  }

  // Get additional analysis data (optional)
  const [technicalAnalysis, sentimentData, marketContext] = await Promise.all([
    getAdvancedTechnicalAnalysis(crypto).catch(() => null),
    getMarketSentimentAnalysis(crypto).catch(() => ({ score: null, sources: ['unavailable'], trend: 'unknown' })),
    getMarketContextAnalysis().catch(() => ({ condition: 'unknown', phase: 'unknown', bitcoinCorrelation: null }))
  ]);

  // Calculate metrics
  const riskMetrics = calculateRiskMetrics(marketData, technicalAnalysis);
  const opportunityAnalysis = calculateOpportunityScore(marketData, technicalAnalysis, sentimentData);
  
  // Get AI insights
  const aiInsights = await getAIMarketInsights({
    crypto,
    marketData,
    technicalAnalysis,
    sentimentData,
    marketContext,
    portfolioSize,
    riskTolerance,
    investmentGoal,
    timeHorizon,
    userTier
  });

  // Generate trading strategy
  const strategy = await generateIntelligentStrategy({
    crypto,
    marketData,
    technicalAnalysis,
    sentimentData,
    marketContext,
    riskMetrics,
    opportunityScore: opportunityAnalysis.score,
    portfolioSize,
    riskTolerance,
    investmentGoal,
    timeHorizon,
    userTier,
    userHistory,
    aiInsights
  });

  return strategy;
}

// ==================== MARKET DATA FUNCTIONS ====================

async function getEnhancedMarketData(crypto) {
  console.log(`🔍 Fetching real market data for ${crypto}...`);
  
  try {
    // Primary: Use internal analysis API
    const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crypto })
    });

    if (response.ok) {
      const analysisData = await response.json();
      if (analysisData.price && analysisData.price > 0) {
        console.log(`✅ Got market data from analysis API for ${crypto}`);
        return {
          price: analysisData.price,
          dipScore: analysisData.score || 0,
          price_change_percentage_24h: analysisData.crypto?.change_24h || 0,
          price_change_percentage_7d: analysisData.crypto?.change_7d || 0,
          total_volume: analysisData.crypto?.volume_24h || 0,
          market_cap: analysisData.crypto?.market_cap || 0,
          volatility: Math.abs(analysisData.crypto?.change_24h || 0) / 100,
          spread: 0.005
        };
      }
    }
    
    // Fallback: Direct CoinGecko API
    console.log(`🔄 Analysis API failed, trying direct CoinGecko for ${crypto}...`);
    const geckoResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${crypto}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`);
    
    if (geckoResponse.ok) {
      const geckoData = await geckoResponse.json();
      const coinData = geckoData[crypto];
      
      if (coinData && coinData.usd) {
        console.log(`✅ Got market data from CoinGecko for ${crypto}`);
        return {
          price: coinData.usd,
          dipScore: 0,
          price_change_percentage_24h: coinData.usd_24h_change || 0,
          price_change_percentage_7d: 0,
          total_volume: coinData.usd_24h_vol || 0,
          market_cap: coinData.usd_market_cap || 0,
          volatility: Math.abs(coinData.usd_24h_change || 0) / 100,
          spread: 0.01
        };
      }
    }
    
    throw new Error(`No market data available for ${crypto} from any source`);
    
  } catch (error) {
    console.error(`❌ Failed to get market data for ${crypto}:`, error.message);
    throw new Error(`Unable to retrieve current market data for ${crypto}. Please verify the cryptocurrency name and try again.`);
  }
}

async function getAdvancedTechnicalAnalysis(crypto) {
  // Placeholder for real technical analysis
  console.log(`⚠️ Technical analysis not implemented for ${crypto} - using market data only`);
  return null;
}

async function getMarketSentimentAnalysis(crypto) {
  // Placeholder for real sentiment analysis
  console.log(`⚠️ Sentiment analysis not implemented for ${crypto} - using market data only`);
  return { score: null, sources: ['unavailable'], trend: 'unknown' };
}

async function getMarketContextAnalysis() {
  // Placeholder for real market context analysis
  console.log(`⚠️ Market context analysis not implemented - using market data only`);
  return { condition: 'unknown', phase: 'unknown', bitcoinCorrelation: null };
}

// ==================== CALCULATION FUNCTIONS ====================

function calculateRiskMetrics(marketData, technicalAnalysis) {
  const price24h = marketData.price_change_percentage_24h || 0;
  const price7d = marketData.price_change_percentage_7d || 0;
  const volume = marketData.total_volume || 0;
  const marketCap = marketData.market_cap || 1;

  let technicalStrength = 'unknown';
  let momentumRisk = 0;
  
  if (technicalAnalysis && technicalAnalysis.rsi !== undefined) {
    technicalStrength = technicalAnalysis.rsi > 70 ? 'overbought' : 
                       technicalAnalysis.rsi < 30 ? 'oversold' : 'neutral';
  }
  
  if (technicalAnalysis && technicalAnalysis.macd !== undefined) {
    momentumRisk = Math.abs(technicalAnalysis.macd) / 100;
  }

  return {
    volatility: Math.abs(price24h) / 100 + Math.abs(price7d) / 100 / 7,
    liquidityRisk: marketCap > 0 ? volume / marketCap : 0,
    technicalStrength,
    momentumRisk,
    dataQuality: {
      hasTechnicalData: !!technicalAnalysis,
      hasVolumeData: !!volume,
      hasMarketCapData: !!marketCap
    }
  };
}

function calculateOpportunityScore(marketData, technicalAnalysis, sentimentData) {
  const dipScore = marketData.dipScore || 0;
  
  let technicalScore = 0;
  let technicalWeight = 0;
  if (technicalAnalysis && technicalAnalysis.overallScore !== undefined) {
    technicalScore = technicalAnalysis.overallScore;
    technicalWeight = 0.3;
  }
  
  let sentimentScore = 0; 
  let sentimentWeight = 0;
  if (sentimentData && sentimentData.score !== null && sentimentData.score !== undefined) {
    sentimentScore = 100 - sentimentData.score;
    sentimentWeight = 0.2;
  }
  
  const dipWeight = 0.5;
  const totalWeight = dipWeight + technicalWeight + sentimentWeight;
  
  if (totalWeight === 0) {
    throw new Error('Insufficient data to calculate opportunity score');
  }
  
  const score = (dipScore * dipWeight + technicalScore * technicalWeight + sentimentScore * sentimentWeight) / totalWeight;
  
  return {
    score: Math.round(score),
    confidence: totalWeight >= 0.8 ? 'high' : totalWeight >= 0.5 ? 'medium' : 'low',
    dataUsed: {
      dipScore: !!dipScore,
      technicalAnalysis: !!technicalWeight,
      sentimentAnalysis: !!sentimentWeight
    }
  };
}

// ==================== AI INTEGRATION FUNCTIONS ====================

async function getAIMarketInsights(params) {
  const { crypto, marketData, technicalAnalysis, sentimentData, marketContext, userTier } = params;
  
  console.log(`🧠 Getting AI insights for ${crypto}...`);

  try {
    // Try multi-AI analysis
    const aiAnalysis = await getMultiAIAnalysis(params);
    
    if (aiAnalysis && aiAnalysis.keyInsights) {
      return {
        insights: aiAnalysis.keyInsights,
        explanation: aiAnalysis.explanation,
        reasoning: aiAnalysis.reasoning,
        confidence: aiAnalysis.confidence || 75,
        sources: [aiAnalysis.provider || 'AI'],
        costUsed: aiAnalysis.costUsed || 0
      };
    }
    
    throw new Error('AI analysis failed');
    
  } catch (error) {
    console.error('AI insights failed:', error);
    
    // Fallback to algorithmic analysis
    const dataQualityWarnings = [];
    if (!technicalAnalysis) dataQualityWarnings.push('Technical analysis unavailable');
    if (!sentimentData || sentimentData.score === null) dataQualityWarnings.push('Sentiment data unavailable');
    if (!marketContext || marketContext.condition === 'unknown') dataQualityWarnings.push('Market context unavailable');
    
    return {
      insights: [
        `Analysis for ${crypto} based on available market data`,
        dataQualityWarnings.length > 0 ? `⚠️ Limited data: ${dataQualityWarnings.join(', ')}` : 'Standard market analysis completed',
        'Recommendation based on price action and basic metrics'
      ].filter(Boolean),
      explanation: `Analysis completed with real market data for ${crypto}. Some advanced features may be limited due to data availability.`,
      reasoning: `Based on current price: $${marketData.price}, 24h change: ${marketData.price_change_percentage_24h?.toFixed(2)}%`,
      confidence: dataQualityWarnings.length > 2 ? 50 : dataQualityWarnings.length > 0 ? 65 : 75,
      sources: ['Market Data', ...(technicalAnalysis ? ['Technical Analysis'] : []), ...(sentimentData?.score !== null ? ['Sentiment'] : [])],
      dataQuality: {
        warnings: dataQualityWarnings,
        reliable: dataQualityWarnings.length === 0
      }
    };
  }
}

async function getMultiAIAnalysis(params) {
  // Try providers in order: Groq (free) → Gemini (free) → GPT-4 (paid)
  const providers = [
    { name: 'Groq', func: getGroqAnalysis, free: true },
    { name: 'Gemini', func: getGeminiAnalysis, free: true },
    { name: 'GPT-4', func: getGPTMarketAnalysis, free: false }
  ];

  for (const provider of providers) {
    try {
      console.log(`🤖 Trying ${provider.name} for AI analysis...`);
      const result = await provider.func(params);
      if (result && result.keyInsights) {
        console.log(`✅ ${provider.name} analysis successful`);
        return {
          ...result,
          provider: provider.name,
          costUsed: provider.free ? 0 : 0.05
        };
      }
    } catch (error) {
      console.warn(`❌ ${provider.name} failed:`, error.message);
      continue;
    }
  }

  // If all fail, return null
  return null;
}

async function getGroqAnalysis(params) {
  const { crypto, marketData, technicalAnalysis, sentimentData, marketContext, riskTolerance, investmentGoal, timeHorizon } = params;
  
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Groq API key not configured');
  }

  const prompt = `CRYPTO TRADING ANALYSIS FOR ${crypto.toUpperCase()}

MARKET DATA:
- Price: $${marketData.price} (24h: ${marketData.price_change_percentage_24h}%, 7d: ${marketData.price_change_percentage_7d}%)
- Dip Score: ${marketData.dipScore}/100
- Volume: $${marketData.total_volume?.toLocaleString()}
- Market Cap: $${marketData.market_cap?.toLocaleString()}

USER PROFILE: ${riskTolerance} risk, ${investmentGoal} goal, ${timeHorizon} horizon

Provide JSON response with trading insights:
{
  "keyInsights": ["3-4 specific actionable insights"],
  "explanation": "Professional analysis of buying opportunity",
  "reasoning": "Clear reasoning for recommendation", 
  "confidence": 0-100,
  "risks": ["main risks"],
  "opportunities": ["key opportunities"]
}`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: 'You are a professional crypto trading advisor. Provide clear, actionable insights in valid JSON format. Focus on practical trading advice with specific price levels and timing.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    // Parse JSON response
    try {
      return JSON.parse(content);
    } catch (parseError) {
      // Extract insights from text if JSON parsing fails
      return extractInsightsFromText(content, crypto);
    }

  } catch (error) {
    console.error('Groq analysis failed:', error);
    throw error;
  }
}

async function getGeminiAnalysis(params) {
  const { crypto, marketData, technicalAnalysis, sentimentData, marketContext, riskTolerance, investmentGoal, timeHorizon } = params;
  
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const prompt = `Analyze ${crypto.toUpperCase()} for trading opportunities.

Market Data: Price $${marketData.price}, 24h change ${marketData.price_change_percentage_24h}%, Dip Score ${marketData.dipScore}/100
User: ${riskTolerance} risk tolerance, ${investmentGoal} goal, ${timeHorizon} timeframe

Provide JSON with: keyInsights (array), explanation (string), reasoning (string), confidence (number 0-100), risks (array), opportunities (array)`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 800
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API failed: ${response.status}`);
    }

    const data = await response.json();
    const content = data.candidates[0].content.parts[0].text;
    
    // Parse JSON response
    try {
      const jsonMatch = content.match(/```json\\s*([\\s\\S]*?)\\s*```/) || content.match(/\\{[\\s\\S]*\\}/);
      const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      return JSON.parse(jsonString);
    } catch (parseError) {
      return extractInsightsFromText(content, crypto);
    }

  } catch (error) {
    console.error('Gemini analysis failed:', error);
    throw error;
  }
}

async function getGPTMarketAnalysis(params) {
  const { crypto, marketData, technicalAnalysis, sentimentData, marketContext, riskTolerance, investmentGoal, timeHorizon } = params;
  
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `You are an expert cryptocurrency trading advisor analyzing ${crypto.toUpperCase()}. 

CURRENT MARKET DATA:
- Price: $${marketData.price}
- Dip Score: ${marketData.dipScore}/100
- 24h Change: ${marketData.price_change_percentage_24h}%
- Volume: $${marketData.total_volume?.toLocaleString()}

USER PROFILE:
- Risk Tolerance: ${riskTolerance}
- Investment Goal: ${investmentGoal}
- Time Horizon: ${timeHorizon}

Provide a comprehensive analysis in JSON format:
{
  "keyInsights": ["3-5 specific insights about current market conditions"],
  "explanation": "Detailed explanation of why this is or isn't a good buying opportunity",
  "reasoning": "Your professional reasoning behind the recommendation",
  "confidence": number between 0-100,
  "risks": ["key risks to consider"],
  "opportunities": ["key opportunities identified"]
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a professional cryptocurrency trading advisor with 10+ years of experience. Provide clear, actionable insights based on data analysis.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API failed: ${response.status}`);
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);

  } catch (error) {
    console.error('GPT analysis failed:', error);
    throw error;
  }
}

function extractInsightsFromText(text, crypto) {
  const insights = [];
  
  if (text.toLowerCase().includes('buy') || text.toLowerCase().includes('bullish')) {
    insights.push(`AI suggests ${crypto} may be a buying opportunity`);
  }
  if (text.toLowerCase().includes('sell') || text.toLowerCase().includes('bearish')) {
    insights.push(`AI suggests caution with ${crypto} at current levels`);
  }
  if (text.toLowerCase().includes('hold') || text.toLowerCase().includes('wait')) {
    insights.push(`AI recommends monitoring ${crypto} for better entry points`);
  }
  if (text.toLowerCase().includes('oversold')) {
    insights.push(`AI detects oversold conditions in ${crypto}`);
  }

  if (insights.length === 0) {
    insights.push(`AI analysis completed for ${crypto} - review full report above`);
  }

  return {
    keyInsights: insights,
    explanation: text.substring(0, 200) + '...',
    reasoning: 'Analysis extracted from AI model response',
    confidence: 60,
    risks: ['Market volatility', 'AI model limitations'],
    opportunities: ['Price movement potential', 'Market positioning']
  };
}

// ==================== STRATEGY GENERATION FUNCTIONS ====================

async function generateIntelligentStrategy(params) {
  const {
    crypto,
    marketData,
    technicalAnalysis,
    sentimentData,
    marketContext,
    riskMetrics,
    opportunityScore,
    portfolioSize,
    riskTolerance,
    investmentGoal,
    timeHorizon,
    userTier,
    userHistory,
    aiInsights
  } = params;

  // AI Decision Engine
  const aiDecision = analyzeWithAI(params);
  
  // Position Sizing Algorithm
  const positionSize = calculateOptimalPositionSize({
    portfolioSize,
    riskTolerance,
    riskMetrics,
    opportunityScore,
    userTier
  });

  // Entry Strategy
  const entryStrategy = generateEntryStrategy({
    marketData,
    technicalAnalysis,
    positionSize,
    userTier
  });

  // Exit Strategy
  const exitStrategy = generateExitStrategy({
    marketData,
    technicalAnalysis,
    riskMetrics,
    investmentGoal,
    timeHorizon,
    userTier
  });

  // Risk Management
  const riskManagement = generateRiskManagement({
    positionSize,
    riskTolerance,
    riskMetrics,
    userTier
  });

  return {
    // Core Decision
    action: aiDecision.action,
    confidence: aiDecision.confidence,
    reasoning: aiDecision.reasoning,
    
    // Detailed Instructions
    entryStrategy,
    exitStrategy,
    riskManagement,
    
    // Market Analysis
    marketAnalysis: {
      dipScore: marketData.dipScore,
      technicalSignals: technicalAnalysis?.signals || ['market-data-only'],
      sentimentScore: sentimentData.score,
      marketCondition: marketContext.condition,
      volatilityLevel: riskMetrics.volatility,
      momentumStrength: technicalAnalysis?.momentum || 'unknown'
    },
    
    // AI Insights
    aiInsights: aiInsights.insights || [],
    aiExplanation: aiInsights.explanation || '',
    aiReasoning: aiInsights.reasoning || '',
    
    // Advanced Features (Pro only)
    ...(userTier === 'pro' && {
      portfolioOptimization: generatePortfolioOptimization(params),
      automationSuggestions: generateAutomationSuggestions(params),
      advancedRiskMetrics: generateAdvancedRiskMetrics(params)
    })
  };
}

function analyzeWithAI(params) {
  const {
    marketData,
    technicalAnalysis,
    sentimentData,
    marketContext,
    riskMetrics,
    opportunityScore,
    riskTolerance,
    timeHorizon
  } = params;

  let actionScore = 0;
  let reasoning = [];

  // Dip Score Analysis (40% weight)
  const dipScore = marketData.dipScore || 0;
  if (dipScore >= 80) {
    actionScore += 40;
    reasoning.push(`🎯 Exceptional dip opportunity (${dipScore}/100 score)`);
  } else if (dipScore >= 65) {
    actionScore += 30;
    reasoning.push(`📈 Strong dip signal (${dipScore}/100 score)`);
  } else if (dipScore >= 50) {
    actionScore += 15;
    reasoning.push(`⚠️ Moderate dip signal (${dipScore}/100 score)`);
  } else {
    actionScore -= 10;
    reasoning.push(`🔴 Weak dip signal (${dipScore}/100 score)`);
  }

  // Technical Analysis (25% weight)
  if (technicalAnalysis && technicalAnalysis.overallScore) {
    const technicalScore = technicalAnalysis.overallScore;
    if (technicalScore >= 70) {
      actionScore += 25;
      reasoning.push(`📊 Strong technical indicators (${technicalScore}/100)`);
    } else if (technicalScore >= 50) {
      actionScore += 15;
      reasoning.push(`📊 Neutral technical signals (${technicalScore}/100)`);
    } else {
      actionScore -= 15;
      reasoning.push(`📉 Weak technical indicators (${technicalScore}/100)`);
    }
  }

  // Sentiment Analysis (20% weight)
  if (sentimentData && sentimentData.score !== null) {
    const sentiment = sentimentData.score;
    if (sentiment <= 25) {
      actionScore += 20;
      reasoning.push(`😰 Extreme fear creates buying opportunity`);
    } else if (sentiment <= 45) {
      actionScore += 10;
      reasoning.push(`😟 Market fear provides good entry point`);
    } else if (sentiment >= 75) {
      actionScore -= 15;
      reasoning.push(`🤑 Market greed suggests caution`);
    }
  }

  // Market Context (15% weight)
  if (marketContext.condition === 'bull_market') {
    actionScore += 10;
    reasoning.push(`🐂 Bull market supports upward momentum`);
  } else if (marketContext.condition === 'bear_market') {
    actionScore += 15;
    reasoning.push(`🐻 Bear market creates deeper discounts`);
  }

  // Risk adjustment
  if (riskTolerance === 'low' && riskMetrics.volatility > 0.7) {
    actionScore -= 20;
    reasoning.push(`⚠️ High volatility exceeds risk tolerance`);
  }

  // Determine action
  let action, confidence;
  if (actionScore >= 70) {
    action = 'STRONG_BUY';
    confidence = Math.min(95, actionScore);
  } else if (actionScore >= 50) {
    action = 'BUY';
    confidence = Math.min(85, actionScore);
  } else if (actionScore >= 30) {
    action = timeHorizon === 'long_term' ? 'DCA' : 'MAYBE';
    confidence = Math.min(70, actionScore);
  } else if (actionScore >= 0) {
    action = 'WAIT';
    confidence = 50;
  } else {
    action = 'AVOID';
    confidence = Math.max(30, 50 + actionScore);
  }

  return {
    action,
    confidence: Math.round(confidence),
    reasoning: reasoning.join('. ') + '.',
    score: actionScore
  };
}

function calculateOptimalPositionSize({ portfolioSize, riskTolerance, riskMetrics, opportunityScore, userTier }) {
  let baseAllocation;
  
  switch (riskTolerance) {
    case 'low': baseAllocation = 0.02; break;
    case 'moderate': baseAllocation = 0.05; break;
    case 'high': baseAllocation = 0.08; break;
    default: baseAllocation = 0.03;
  }

  // Adjust based on opportunity score
  const opportunityMultiplier = Math.min(2, opportunityScore / 50);
  const adjustedAllocation = baseAllocation * opportunityMultiplier;

  // Risk-adjusted sizing
  const volatilityPenalty = Math.max(0.5, 1 - (riskMetrics.volatility - 0.3));
  const finalAllocation = adjustedAllocation * volatilityPenalty;

  // Pro users get Kelly Criterion optimization
  if (userTier === 'pro') {
    const winRate = Math.min(0.7, opportunityScore / 100 * 1.4);
    const avgWin = 0.15;
    const avgLoss = 0.08;
    const kellyFraction = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
    const kellyAdjusted = Math.min(finalAllocation * 1.5, kellyFraction * 0.5);
    
    return {
      percentage: Math.round(Math.max(finalAllocation, kellyAdjusted) * 100 * 100) / 100,
      dollarAmount: Math.round(portfolioSize * Math.max(finalAllocation, kellyAdjusted)),
      method: 'Kelly-adjusted optimal sizing',
      kellyFraction: Math.round(kellyFraction * 100) / 100
    };
  }

  return {
    percentage: Math.round(finalAllocation * 100 * 100) / 100,
    dollarAmount: Math.round(portfolioSize * finalAllocation),
    method: 'Risk-adjusted position sizing'
  };
}

function generateEntryStrategy({ marketData, technicalAnalysis, positionSize, userTier }) {
  const strategy = {
    method: 'MARKET',
    allocation: positionSize,
    timing: 'IMMEDIATE',
    instructions: []
  };

  const volatility = marketData.volatility || 0.5;
  const spread = marketData.spread || 0.01;
  const volume = marketData.total_volume || 0;

  if (volatility > 0.6) {
    strategy.method = 'DCA';
    strategy.timing = 'GRADUAL';
    strategy.instructions = [
      `🎯 **Dollar-Cost Averaging Recommended**`,
      `• Split ${positionSize.percentage}% allocation into 3-5 purchases`,
      `• Execute over 24-48 hours to smooth volatility`,
      `• Place orders during lower volume periods (typically 2-6 AM UTC)`,
      `• Watch for support levels as entry points`
    ];
  } else if (spread > 0.02 || volume < 1000000) {
    strategy.method = 'LIMIT';
    strategy.instructions = [
      `📝 **Limit Order Strategy**`,
      `• Place limit buy at $${(marketData.price * 0.98).toFixed(6)} (2% below current)`,
      `• Valid for 24 hours or until filled`,
      `• If not filled, reassess market conditions`,
      `• Target entry near support levels`
    ];
  } else {
    strategy.method = 'MARKET';
    strategy.instructions = [
      `⚡ **Immediate Market Entry**`,
      `• Execute market buy for ${positionSize.percentage}% allocation`,
      `• Current favorable conditions: low volatility, tight spreads`,
      `• Entry at approximately $${marketData.price}`,
      `• Consider scaling in if position size > 10% of portfolio`
    ];
  }

  if (userTier === 'pro') {
    strategy.advanced = {
      optimalExchanges: ['Binance', 'Coinbase Pro', 'Kraken'],
      timingWindow: 'Next 2-4 hours (optimal entry window)',
      slippageProtection: positionSize.dollarAmount > volume * 0.001 ? 0.5 : 0.25
    };
    
    strategy.instructions.push(
      ``,
      `🔧 **Pro Features:**`,
      `• Best execution on: ${strategy.advanced.optimalExchanges.join(', ')}`,
      `• Optimal timing: ${strategy.advanced.timingWindow}`,
      `• Max slippage: ${strategy.advanced.slippageProtection}%`
    );
  }

  return strategy;
}

function generateExitStrategy({ marketData, technicalAnalysis, riskMetrics, investmentGoal, timeHorizon, userTier }) {
  const currentPrice = marketData.price;
  const support = technicalAnalysis?.support || currentPrice * 0.9;
  const resistance = technicalAnalysis?.resistance || currentPrice * 1.2;

  const strategy = {
    targets: [],
    stopLoss: {},
    instructions: []
  };

  // Calculate profit targets
  const riskRewardRatio = investmentGoal === 'aggressive' ? 3 : investmentGoal === 'moderate' ? 2 : 1.5;
  const stopLossLevel = support * 0.95;
  const riskAmount = currentPrice - stopLossLevel;
  
  // Multiple profit targets
  const targets = [
    {
      level: currentPrice + (riskAmount * riskRewardRatio * 0.5),
      allocation: 30,
      reasoning: 'First resistance level'
    },
    {
      level: currentPrice + (riskAmount * riskRewardRatio),
      allocation: 40,
      reasoning: 'Primary target (optimal risk/reward)'
    },
    {
      level: currentPrice + (riskAmount * riskRewardRatio * 1.5),
      allocation: 30,
      reasoning: 'Extended target for trend continuation'
    }
  ];

  strategy.targets = targets;
  strategy.stopLoss = {
    level: stopLossLevel,
    percentage: ((currentPrice - stopLossLevel) / currentPrice * 100).toFixed(1),
    trailing: userTier === 'pro'
  };

  strategy.instructions = [
    `🎯 **Profit Taking Strategy**`,
    `• Target 1: $${targets[0].level.toFixed(6)} (sell ${targets[0].allocation}%) - ${targets[0].reasoning}`,
    `• Target 2: $${targets[1].level.toFixed(6)} (sell ${targets[1].allocation}%) - ${targets[1].reasoning}`,
    `• Target 3: $${targets[2].level.toFixed(6)} (sell ${targets[2].allocation}%) - ${targets[2].reasoning}`,
    ``,
    `🛡️ **Risk Management**`,
    `• Stop Loss: $${stopLossLevel.toFixed(6)} (${strategy.stopLoss.percentage}% risk)`,
    userTier === 'pro' ? 
      `• Trailing stop: Activate at 15% profit, trail 8% below high` :
      `• Fixed stop loss - upgrade to Pro for trailing stops`,
    `• Risk/Reward Ratio: 1:${riskRewardRatio}`
  ];

  if (timeHorizon === 'long_term') {
    strategy.instructions.push(
      ``,
      `📈 **Long-term Considerations**`,
      `• Consider holding 20-30% for extended gains`,
      `• Reevaluate targets if major resistance breaks`,
      `• Monthly reviews recommended for position management`
    );
  }

  return strategy;
}

function generateRiskManagement({ positionSize, riskTolerance, riskMetrics, userTier }) {
  const riskManagement = {
    maxRisk: riskTolerance === 'low' ? 0.02 : riskTolerance === 'moderate' ? 0.05 : 0.08,
    diversificationAdvice: [],
    monitoringPlan: [],
    contingencyPlan: []
  };

  riskManagement.diversificationAdvice = [
    `💼 **Portfolio Diversification**`,
    `• Limit single position to ${positionSize.percentage}% of portfolio`,
    `• Maintain exposure across 8-12 different cryptocurrencies`,
    `• Consider sector diversification (DeFi, Layer 1s, Gaming, etc.)`,
    `• Keep 20-30% in major coins (BTC, ETH) for stability`
  ];

  riskManagement.monitoringPlan = [
    `📊 **Monitoring Plan**`,
    `• Daily price alerts at key support/resistance levels`,
    `• Weekly portfolio rebalancing if position exceeds ${positionSize.percentage + 2}%`,
    `• Monitor correlation with BTC and overall market sentiment`,
    `• Track volume and liquidity for exit planning`
  ];

  riskManagement.contingencyPlan = [
    `🚨 **Contingency Planning**`,
    `• If stop loss hit: Wait for re-entry signal before buying back`,
    `• If major market crash (>20%): Consider doubling down at 50% lower prices`,
    `• If regulatory issues: Have fiat exit strategy ready`,
    `• If technical breakdown: Close position and reassess`
  ];

  if (userTier === 'pro') {
    riskManagement.advanced = {
      correlationAnalysis: 'Monitor portfolio correlation matrix weekly',
      volatilityTargeting: 'Adjust position sizes to maintain 15% portfolio volatility',
      hedgingOptions: 'Consider BTC shorts as hedge during uncertain periods',
      rebalancingSignals: 'Automated alerts when allocations drift >25% from targets'
    };
  }

  return riskManagement;
}

// Pro-tier advanced functions
function generatePortfolioOptimization(params) {
  const { crypto, marketData, portfolioSize, riskTolerance } = params;
  return {
    allocation: `${crypto}: ${Math.min(10, portfolioSize / marketData.price * 0.05).toFixed(2)}%`,
    rebalanceFrequency: 'Weekly',
    correlationRisk: 'Monitor BTC correlation',
    diversificationScore: 75
  };
}

function generateAutomationSuggestions(params) {
  const { marketData, technicalAnalysis, riskTolerance } = params;
  return {
    dcaSchedule: riskTolerance === 'low' ? 'Weekly' : 'Bi-weekly',
    stopLossAutomation: `Set trailing stop at ${technicalAnalysis?.support || marketData.price * 0.9}`,
    takeProfitLadder: 'Scale out 25% at each resistance level',
    rebalanceThreshold: '15% portfolio drift'
  };
}

function generateAdvancedRiskMetrics(params) {
  const { marketData, riskMetrics } = params;
  return {
    sharpeRatio: (marketData.price_change_percentage_7d || 0) / (riskMetrics.volatility * 100),
    maxDrawdown: `${Math.abs(marketData.price_change_percentage_7d || 0)}%`,
    valueAtRisk: `${(marketData.price * riskMetrics.volatility * 1.96).toFixed(2)}`,
    expectedReturn: `${(marketData.price_change_percentage_24h || 0) * 365}% annualized`
  };
}