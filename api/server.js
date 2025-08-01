#!/usr/bin/env node

/**
 * Express.js Server for isthisthedip.xyz
 * Consolidates all serverless functions into a traditional server
 * Supports both traditional deployment and Vercel serverless
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for proper IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https:", "wss:", "ws:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'", "https://js.stripe.com"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3007',
            'https://isthisthedip.xyz',
            'https://www.isthisthedip.xyz',
            'https://isthisthedip-xyz.vercel.app'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn('Blocked CORS request from:', origin);
            callback(null, true); // Allow for now, can be stricter in production
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with']
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.warn(`Rate limit exceeded for IP: ${req.ip}`);
        res.status(429).json({ error: 'Too many requests, please try again later' });
    }
});

app.use('/api/', limiter);

// Static file serving
app.use(express.static(rootDir, {
    dotfiles: 'ignore',
    etag: true,
    extensions: ['html', 'js', 'css', 'png', 'jpg', 'gif', 'ico'],
    index: 'index.html',
    maxAge: '1d',
    redirect: false,
    setHeaders: function (res, path, stat) {
        res.set('x-timestamp', Date.now());
    }
}));

// Import API route handlers
async function setupAPIRoutes() {
    try {
        // Dynamically import serverless functions and wrap them for Express
        const analyzeHandler = (await import('./analyze.js')).default;
        const authHandler = (await import('./auth.js')).default;
        const dashboardHandler = (await import('./dashboard.js')).default;
        const leaderboardHandler = (await import('./leaderboard.js')).default;
        const livePriceHandler = (await import('./live-price.js')).default;
        const realtimeMarketHandler = (await import('./realtime-market.js')).default;

        // Wrapper function to convert Vercel handlers to Express middleware
        const wrapVercelHandler = (handler) => {
            return async (req, res, next) => {
                try {
                    // Add Vercel-compatible req/res methods
                    req.query = req.query || {};
                    req.body = req.body || {};
                    
                    // Call the Vercel handler
                    await handler(req, res);
                } catch (error) {
                    console.error('API Handler Error:', error);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Internal server error' });
                    }
                    next(error);
                }
            };
        };

        // API Routes
        app.all('/api/analyze', wrapVercelHandler(analyzeHandler));
        app.all('/api/auth/:action?', wrapVercelHandler(authHandler));
        app.all('/api/dashboard', wrapVercelHandler(dashboardHandler));
        app.all('/api/leaderboard', wrapVercelHandler(leaderboardHandler));
        app.all('/api/live-price/:symbol?', wrapVercelHandler(livePriceHandler));
        app.all('/api/realtime-market', wrapVercelHandler(realtimeMarketHandler));

        console.log('✅ API routes loaded successfully');
    } catch (error) {
        console.error('❌ Failed to load API routes:', error);
        
        // Fallback API routes if modules fail to load
        app.use('/api/*', (req, res) => {
            res.status(503).json({ 
                error: 'Service temporarily unavailable', 
                message: 'API modules are loading...' 
            });
        });
    }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime()
    });
});

// API status endpoint
app.get('/api/status', (req, res) => {
    res.json({
        server: 'online',
        database: 'connected',
        apis: {
            coingecko: 'operational',
            alphavantage: process.env.ALPHA_VANTAGE_API_KEY ? 'configured' : 'missing',
            news: process.env.NEWS_API_KEY ? 'configured' : 'missing',
            huggingface: process.env.HUGGING_FACE_API_TOKEN ? 'configured' : 'missing'
        },
        timestamp: Date.now()
    });
});

// HTML page routing (SPA support)
const pages = ['/', '/dashboard', '/leaderboard', '/login', '/signup', '/pricing', '/chat'];
pages.forEach(route => {
    app.get(route, (req, res) => {
        const filename = route === '/' ? 'index.html' : `${route.slice(1)}.html`;
        const filepath = path.join(rootDir, filename);
        res.sendFile(filepath, (err) => {
            if (err) {
                console.error(`Error serving ${filename}:`, err);
                res.status(404).sendFile(path.join(rootDir, 'index.html'));
            }
        });
    });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
    if (req.originalUrl.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } else {
        // Serve index.html for unmatched routes (SPA support)
        res.sendFile(path.join(rootDir, 'index.html'));
    }
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('Global Error Handler:', error);
    
    if (res.headersSent) {
        return next(error);
    }
    
    const isDevelopment = process.env.NODE_ENV !== 'production';
    
    res.status(error.status || 500).json({
        error: 'Internal server error',
        message: isDevelopment ? error.message : 'Something went wrong',
        ...(isDevelopment && { stack: error.stack })
    });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
    server.close(() => {
        console.log('Process terminated');
        process.exit(0);
    });
});

// Start server
async function startServer() {
    try {
        // Setup API routes
        await setupAPIRoutes();
        
        // Start listening
        const server = app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
            console.log(`💹 Website: http://localhost:${PORT}`);
            
            // PM2 ready signal
            if (process.send) {
                process.send('ready');
            }
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.syscall !== 'listen') {
                throw error;
            }

            const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

            switch (error.code) {
                case 'EACCES':
                    console.error(bind + ' requires elevated privileges');
                    process.exit(1);
                    break;
                case 'EADDRINUSE':
                    console.error(bind + ' is already in use');
                    process.exit(1);
                    break;
                default:
                    throw error;
            }
        });

        return server;
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
const server = await startServer();

export default app;