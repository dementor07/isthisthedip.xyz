# Database Integration Setup Guide

## Prerequisites

✅ **Current Status**: Database integration code is complete and ready to deploy!

## Required Environment Variables

Add these to your Vercel project settings:

### 1. **Database Configuration**
```
POSTGRES_URL=postgresql://username:password@host:port/database
```
*This will be automatically set when you add Vercel PostgreSQL*

### 2. **Authentication**
```
JWT_SECRET=your-super-secure-jwt-secret-minimum-32-characters
NODE_ENV=production
```

### 3. **API Keys** (for future real crypto data)
```
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key
HUGGING_FACE_API_TOKEN=your_hugging_face_token
NEWS_API_KEY=your_news_api_key
```

## Deployment Steps

### Step 1: Add PostgreSQL Database to Vercel

1. Go to your Vercel project dashboard
2. Navigate to the "Storage" tab
3. Click "Create Database" → "PostgreSQL"
4. Choose your plan (Hobby is free)
5. This automatically sets the `POSTGRES_URL` environment variable

### Step 2: Set Environment Variables

In your Vercel project settings → Environment Variables, add:

```bash
JWT_SECRET=crypto_dip_analyzer_super_secure_jwt_secret_2025_isthisthedip_xyz_production
NODE_ENV=production
```

### Step 3: Deploy

```bash
git add .
git commit -m "Add database integration with PostgreSQL support"
git push origin main
```

Vercel will automatically deploy your changes.

## What's Been Implemented

✅ **Complete Database Integration**:
- PostgreSQL connection with connection pooling
- Automatic table creation on first run
- User authentication with JWT tokens
- Password hashing with bcrypt
- Search history tracking
- Dashboard statistics
- Leaderboard functionality

✅ **Updated API Endpoints**:
- `/api/auth/login` - Real user authentication
- `/api/auth/register` - User registration with validation
- `/api/auth/me` - Current user info with JWT verification
- `/api/auth/logout` - Secure logout
- `/api/analyze` - Crypto analysis with user tracking
- `/api/dashboard` - Real user dashboard data
- `/api/leaderboard` - Database-driven leaderboard

✅ **Security Features**:
- HTTP-only JWT cookies
- Password hashing with bcrypt (12 rounds)
- SQL injection protection with parameterized queries
- Rate limiting for free users (10 searches/day)
- Proper CORS configuration

## Testing the Integration

Once deployed, you can:

1. **Register a new account** at `/signup`
2. **Login** at `/login`
3. **Use the analyzer** - searches will be saved to database
4. **View dashboard** - see real statistics from database
5. **Check leaderboard** - populated from actual analyses

## Database Tables Created

The system automatically creates these tables:

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  tier VARCHAR(20) DEFAULT 'free',
  daily_searches INTEGER DEFAULT 0,
  total_searches INTEGER DEFAULT 0,
  last_search_date DATE,
  subscription_expires TIMESTAMP,
  stripe_customer_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Analyses Table
```sql
CREATE TABLE analyses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  crypto_symbol VARCHAR(10) NOT NULL,
  crypto_name VARCHAR(100),
  score INTEGER NOT NULL,
  signal VARCHAR(20) NOT NULL,
  confidence VARCHAR(20),
  price_data JSONB,
  analysis_data JSONB,
  ip_address INET,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Next Steps

After database integration is working:

1. **Add Real Crypto APIs** - Replace mock data with actual CoinGecko, Alpha Vantage data
2. **Implement Stripe** - Add payment processing for subscriptions
3. **Email Notifications** - Add email alerts for premium users
4. **Advanced Analytics** - More detailed analysis algorithms

## Troubleshooting

### Common Issues:

1. **"Cannot find module 'pg'"**
   - Solution: Dependencies are already in package.json, Vercel will install automatically

2. **Database connection errors**
   - Check that `POSTGRES_URL` is set correctly in Vercel environment variables
   - Ensure the database is created and accessible

3. **JWT errors**
   - Verify `JWT_SECRET` is set and at least 32 characters long

4. **Authentication not working**
   - Check browser cookies are enabled
   - Verify the domain matches between frontend and API

## Success Indicators

✅ **Database Working**: Users can register and login
✅ **Analytics Tracking**: Searches appear in dashboard and leaderboard
✅ **Rate Limiting**: Free users limited to 10 searches/day
✅ **JWT Authentication**: Login state persists across page refreshes

Your site now has a complete, production-ready database backend! 🚀