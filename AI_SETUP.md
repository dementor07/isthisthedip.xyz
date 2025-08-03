# AI Trading Advisor - Multi-AI Environment Setup

## AI Provider Hierarchy (Smart Fallback System)

The system tries AI providers in this order, automatically falling back if one fails:

**1. Groq (FREE/FAST) → 2. Gemini (FREE) → 3. GPT-4 (PAID) → 4. Algorithmic Fallback**

## API Keys for Maximum AI Functionality

### 🚀 **Groq (Recommended - FREE & FAST)**
```bash
GROQ_API_KEY=gsk_your-groq-api-key-here
```
- **Cost**: FREE (14,400 requests/day, 30/minute)
- **Model**: Llama 3.1 8B Instant (lightning fast)
- **Get API Key**: https://console.groq.com/keys
- **Usage**: Primary AI analysis - 10x faster than GPT-4
- **Paid Option**: $0.05 per 1M tokens (extremely cheap)

### 🆓 **Google Gemini (FREE Backup)**
```bash
GEMINI_API_KEY=your-gemini-api-key-here
```
- **Cost**: FREE (15 requests/minute, 1500/day)
- **Model**: Gemini 1.5 Flash
- **Get API Key**: https://aistudio.google.com/app/apikey
- **Usage**: Backup AI analysis when Groq unavailable
- **Paid Option**: $0.35 per 1M tokens (cheap)

### 💰 **OpenAI GPT-4 (Premium Option)**
```bash
OPENAI_API_KEY=sk-your-openai-api-key-here
```
- **Cost**: ~$0.05-0.10 per analysis
- **Model**: GPT-4 (highest quality reasoning)
- **Get API Key**: https://platform.openai.com/api-keys
- **Usage**: Fallback when free options fail
- **Note**: Most expensive but highest quality

### 🤗 **HuggingFace (Already Configured)**
```bash
HUGGINGFACE_API_TOKEN=hf_your-token-here
```
- **Cost**: FREE (multiple models available)
- **Models**: FinBERT, BERT Sentiment, DialoGPT
- **Get Token**: https://huggingface.co/settings/tokens
- **Usage**: Sentiment analysis + additional AI insights

### 📰 **NewsAPI (Already Configured)**
```bash
NEWSAPI_KEY=your-newsapi-key-here
```
- **Cost**: FREE (1000 requests/day)
- **Get API Key**: https://newsapi.org/
- **Usage**: Recent crypto news for sentiment analysis

## AI Features by Subscription Tier

### Premium Users
- ✅ Basic AI Trading Advisor access
- ✅ GPT-4 market analysis and explanations
- ✅ Enhanced sentiment analysis with FinBERT
- ✅ Custom model opinions and insights

### Pro Users
- ✅ All Premium features
- ✅ Advanced AI automation suggestions
- ✅ Portfolio optimization recommendations
- ✅ Priority AI processing
- ✅ Kelly Criterion position sizing

## Technical Implementation

The AI system combines **FOUR sources** with smart fallback hierarchy:

1. **Primary AI (Groq/Gemini/GPT-4)**: Professional market reasoning and explanations
2. **FinBERT Sentiment**: Financial-specific sentiment from recent news  
3. **HuggingFace Models**: Multiple AI models for diverse insights
4. **Custom Model**: Proprietary pattern recognition and risk analysis

### Smart Fallback System:
- **Step 1**: Try Groq (free, lightning fast)
- **Step 2**: If Groq fails → try Gemini (free, reliable)  
- **Step 3**: If Gemini fails → try GPT-4 (paid, highest quality)
- **Step 4**: If all AI fails → sophisticated algorithmic analysis

### Cost Optimization:
- **FREE TIER**: Groq + Gemini + HuggingFace = ~14,000+ daily analyses
- **CHEAP TIER**: Add paid Groq at $0.05 per 1M tokens  
- **PREMIUM TIER**: Add GPT-4 for ultimate quality

## Recommended Setup for Maximum Value

**✅ READY FOR DEPLOYMENT:**
```bash
GROQ_API_KEY=gsk_your-groq-key-here        # 14,400 free requests/day ✅ CONFIGURED
GEMINI_API_KEY=AIza-your-gemini-key-here   # 1,500 free requests/day ✅ CONFIGURED  
HUGGINGFACE_API_TOKEN=hf_xxx               # Unlimited free ✅ ALREADY CONFIGURED
NEWSAPI_KEY=xxx                            # 1000 requests/day ✅ ALREADY CONFIGURED  
```

This gives you **15,900+ free AI analyses per day** with professional quality!

## Testing AI Features

1. **Local Development**: Set environment variables in `.env.local`
2. **Production**: Configure in Vercel dashboard under Environment Variables
3. **Fallback Testing**: Remove API keys to test algorithmic fallbacks

The system will automatically detect available APIs and gracefully degrade functionality while maintaining core trading advice capabilities.