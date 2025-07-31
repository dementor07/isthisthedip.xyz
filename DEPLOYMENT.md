# 🚀 Deployment Guide - isthisthedip.xyz

Professional crypto analysis platform with real-time streaming capabilities.

## 📋 Pre-Deployment Checklist

### Required API Keys
- [ ] **Alpha Vantage API Key** - For professional technical indicators
- [ ] **HuggingFace API Token** - For AI sentiment analysis  
- [ ] **News API Key** - For cryptocurrency news sentiment
- [ ] **Stripe Keys** - For payment processing (Premium/Pro subscriptions)

### Infrastructure Requirements
- [ ] **Server**: 2+ CPU cores, 4GB+ RAM, 20GB+ SSD
- [ ] **Node.js**: Version 18+ 
- [ ] **Domain**: SSL certificate for HTTPS
- [ ] **Email**: SMTP for user notifications (optional)

## 🐳 Docker Deployment (Recommended)

### 1. Clone and Setup
```bash
git clone https://github.com/yourusername/isthisthedip.xyz.git
cd isthisthedip.xyz
```

### 2. Configure Environment
```bash
cp .env.production .env
nano .env  # Edit with your production values
```

### 3. Deploy with Docker Compose
```bash
# Create logs directory
mkdir -p logs ssl

# Start services
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f app
```

### 4. SSL Setup
```bash
# Place your SSL certificates in ./ssl/
# - fullchain.pem
# - privkey.pem

# Restart nginx to load SSL
docker-compose restart nginx
```

## 🖥️ VPS Deployment

### 1. Server Setup (Ubuntu/Debian)
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx -y

# Install SQLite
sudo apt install sqlite3 -y
```

### 2. Application Deployment
```bash
# Clone repository
git clone https://github.com/yourusername/isthisthedip.xyz.git /var/www/isthisthedip.xyz
cd /var/www/isthisthedip.xyz

# Install dependencies
npm install --production

# Setup environment
cp .env.production .env
nano .env  # Configure your production values

# Initialize database
npm run init-db

# Start with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

### 3. Nginx Configuration
```bash
# Copy nginx config
sudo cp nginx.conf /etc/nginx/sites-available/isthisthedip.xyz
sudo ln -s /etc/nginx/sites-available/isthisthedip.xyz /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 4. SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get certificate
sudo certbot --nginx -d isthisthedip.xyz -d www.isthisthedip.xyz

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 🔧 Environment Variables

### Required Production Variables
```env
# Server
NODE_ENV=production
PORT=3000
JWT_SECRET=your_super_secure_jwt_secret_change_this

# Domain
DOMAIN=isthisthedip.xyz
ALLOWED_ORIGINS=https://isthisthedip.xyz,https://www.isthisthedip.xyz

# API Keys (REQUIRED)
ALPHA_VANTAGE_API_KEY=your_key_here
HUGGING_FACE_API_TOKEN=your_token_here  
NEWS_API_KEY=your_key_here

# Stripe (for payments)
STRIPE_SECRET_KEY=sk_live_your_key
STRIPE_WEBHOOK_SECRET=whsec_your_secret
STRIPE_PRICE_PREMIUM=price_premium_id
STRIPE_PRICE_PRO=price_pro_id

# Database
DATABASE_PATH=./production_database.sqlite
```

## 📊 Monitoring & Health Checks

### Health Check Endpoint
```bash
curl https://isthisthedip.xyz/api/health
# Expected: {"status":"OK","timestamp":"..."}
```

### PM2 Monitoring
```bash
pm2 status
pm2 logs isthisthedip-api
pm2 restart isthisthedip-api
```

### System Resources
```bash
# Check memory usage
free -h

# Check disk space
df -h

# Check CPU usage
top

# Check nginx status
sudo systemctl status nginx
```

## 🔄 Updates & Maintenance

### Deploying Updates
```bash
cd /var/www/isthisthedip.xyz
git pull origin main
npm install --production
pm2 reload isthisthedip-api
```

### Database Backup
```bash
# Backup database
cp database.sqlite database_backup_$(date +%Y%m%d_%H%M%S).sqlite

# Or automated daily backup
crontab -e
# Add: 0 2 * * * cp /var/www/isthisthedip.xyz/database.sqlite /backups/db_$(date +\%Y\%m\%d).sqlite
```

### Log Management
```bash
# PM2 log rotation
pm2 install pm2-logrotate

# Clear old logs
pm2 flush
```

## 🚨 Troubleshooting

### Common Issues

**Real-time features not working:**
```bash
# Check WebSocket connections
pm2 logs isthisthedip-api | grep "WebSocket"
# Check if port 3000 is accessible
telnet localhost 3000
```

**High memory usage:**
```bash
# Check memory usage
pm2 show isthisthedip-api
# Restart if needed
pm2 restart isthisthedip-api
```

**API rate limits exceeded:**
```bash
# Check API usage in logs
pm2 logs isthisthedip-api | grep "API CALL"
# Monitor cache hit rates
curl https://isthisthedip.xyz/api/cache-stats
```

## 🔐 Security Checklist

- [ ] SSL certificate installed and auto-renewing
- [ ] JWT secret is strong and unique
- [ ] API keys are not exposed in client-side code
- [ ] Rate limiting enabled
- [ ] Helmet security headers active
- [ ] Database file permissions restricted
- [ ] Regular security updates scheduled
- [ ] Backup strategy implemented

## 📈 Performance Optimization

### Production Settings
- [ ] NODE_ENV=production set
- [ ] PM2 cluster mode enabled
- [ ] Nginx gzip compression active
- [ ] Static file caching configured
- [ ] Database indexed properly
- [ ] Memory limits set for PM2

### Scaling Considerations
- [ ] Load balancer for multiple servers
- [ ] Database optimization for high traffic
- [ ] CDN for static assets
- [ ] Redis for session storage (if needed)
- [ ] Monitoring and alerting setup

## 🆘 Support

For deployment issues:
1. Check logs: `pm2 logs isthisthedip-api`
2. Verify environment variables: `pm2 env 0`
3. Test API endpoints: `curl https://isthisthedip.xyz/api/health`
4. Check system resources: `htop` or `top`

## 🎯 Success Metrics

After deployment, verify these features work:
- [ ] Basic crypto analysis (free tier)
- [ ] Real-time price streaming (premium tier)  
- [ ] 1-second charts and technical analysis (pro tier)
- [ ] Sentiment analysis with news integration
- [ ] Payment processing and tier upgrades
- [ ] All API endpoints responding correctly

---

**🚀 Ready to Deploy!** 

Your professional crypto analysis platform with real-time 1-second charts is production-ready!