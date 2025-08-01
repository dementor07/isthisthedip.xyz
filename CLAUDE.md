# CLAUDE.md - Development Session Summary

## Project Overview
**isthisthedip.xyz** - Comprehensive cryptocurrency dip analysis platform built with Node.js/Express backend, SQLite/PostgreSQL database, and mobile-responsive frontend.

## Key Features Implemented
- Real-time crypto analysis with scoring system (0-100)
- User authentication with JWT tokens and 3-tier subscription model (Free/Premium/Pro)
- Mobile-responsive navigation with hamburger menus on all pages
- Comprehensive leaderboard showing top cryptocurrency dip opportunities
- Dashboard with user analytics and quick analysis tools
- WebSocket real-time updates and technical indicators
- Stripe payment integration for subscriptions
- PostgreSQL support for production deployment

## Project Structure
```
isthisthedip.xyz/
├── api/                          # Backend serverless functions (Vercel)
│   ├── auth.js                  # Consolidated authentication API (login/register/me/logout/chat)
│   ├── analyze.js               # Main crypto analysis endpoint
│   ├── leaderboard.js           # Cryptocurrency rankings endpoint
│   ├── dashboard.js             # User dashboard analytics endpoint
│   └── prisma-utils.js          # Database utilities (PostgreSQL/SQLite)
├── js/                          # Frontend JavaScript modules  
│   ├── calculator.js            # Main crypto analysis interface
│   ├── auth.js                  # Frontend authentication handling
│   ├── realtime-service.js      # WebSocket real-time updates
│   └── pro-charts.js           # Advanced charting features
├── public/                      # Static files for Vercel deployment
│   ├── index.html               # Main landing page (mobile-responsive)
│   ├── dashboard.html           # User dashboard (mobile-responsive)
│   ├── leaderboard.html         # Crypto rankings page (mobile-responsive)
│   ├── chat.html                # Community chat page (mobile-responsive)
│   ├── login.html & signup.html # Authentication pages
│   ├── pricing.html             # Subscription tiers page
│   └── js/ (symlinked)          # Frontend JS modules
├── index.html                   # Root landing page (mobile-responsive)
├── dashboard.html               # Root user dashboard (mobile-responsive)
├── leaderboard.html            # Root crypto rankings page (mobile-responsive)
├── chat.html                   # Root community chat page (mobile-responsive)
├── login.html & signup.html     # Root authentication pages
├── pricing.html                 # Root subscription tiers page
├── package.json                 # Dependencies and scripts
├── vercel.json                  # Vercel deployment configuration
├── prisma/ (schema.prisma)      # Database schema and migrations
└── .env                         # Environment variables (API keys)
```

[... rest of the existing content remains unchanged ...]

## Memorized Tasks and Reminders
- To memorize