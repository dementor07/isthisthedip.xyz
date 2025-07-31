const { Pool } = require('pg');

class PostgresDatabase {
    constructor() {
        // Use Vercel Postgres environment variables
        this.pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }

    async initialize() {
        try {
            // Create tables if they don't exist
            await this.createTables();
            console.log('✅ PostgreSQL database initialized');
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    async createTables() {
        const queries = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
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
            )`,
            
            // Analyses table
            `CREATE TABLE IF NOT EXISTS analyses (
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
            )`,
            
            // Sessions table for JWT blacklist
            `CREATE TABLE IF NOT EXISTS sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                token_hash VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            
            // Indexes for performance
            `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
            `CREATE INDEX IF NOT EXISTS idx_analyses_symbol ON analyses(crypto_symbol)`,
            `CREATE INDEX IF NOT EXISTS idx_analyses_timestamp ON analyses(timestamp DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_analyses_score ON analyses(score DESC)`,
            `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash)`,
            `CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`
        ];

        for (const query of queries) {
            await this.pool.query(query);
        }
    }

    async query(text, params) {
        const client = await this.pool.connect();
        try {
            const result = await client.query(text, params);
            return result;
        } finally {
            client.release();
        }
    }

    async close() {
        await this.pool.end();
    }

    // User operations
    async createUser(email, passwordHash) {
        const result = await this.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
            [email, passwordHash]
        );
        return result.rows[0];
    }

    async getUserByEmail(email) {
        const result = await this.query(
            'SELECT * FROM users WHERE email = $1',
            [email]
        );
        return result.rows[0];
    }

    async getUserById(id) {
        const result = await this.query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0];
    }

    async updateUserSearches(userId, increment = 1) {
        const today = new Date().toISOString().split('T')[0];
        
        // Get current user data
        const user = await this.getUserById(userId);
        if (!user) return;

        const isNewDay = !user.last_search_date || user.last_search_date.toISOString().split('T')[0] !== today;
        const dailySearches = isNewDay ? increment : (user.daily_searches || 0) + increment;

        await this.query(
            `UPDATE users 
             SET daily_searches = $1, 
                 total_searches = COALESCE(total_searches, 0) + $2,
                 last_search_date = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [dailySearches, increment, today, userId]
        );
    }

    async updateUserTier(userId, tier, subscriptionExpires = null) {
        await this.query(
            'UPDATE users SET tier = $1, subscription_expires = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [tier, subscriptionExpires, userId]
        );
    }

    // Analysis operations
    async saveAnalysis(data) {
        const result = await this.query(
            `INSERT INTO analyses 
             (user_id, crypto_symbol, crypto_name, score, signal, confidence, price_data, analysis_data, ip_address) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
             RETURNING *`,
            [
                data.user_id,
                data.crypto_symbol,
                data.crypto_name,
                data.score,
                data.signal,
                data.confidence,
                JSON.stringify(data.price_data),
                JSON.stringify(data.analysis_data),
                data.ip_address
            ]
        );
        return result.rows[0];
    }

    async getRecentAnalyses(userId, limit = 10) {
        const result = await this.query(
            'SELECT * FROM analyses WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
            [userId, limit]
        );
        return result.rows;
    }

    async getLeaderboard(timeframe = '24h', limit = 50) {
        let timeCondition = '';
        switch (timeframe) {
            case '7d':
                timeCondition = "AND timestamp >= NOW() - INTERVAL '7 days'";
                break;
            case '30d':
                timeCondition = "AND timestamp >= NOW() - INTERVAL '30 days'";
                break;
            default: // 24h
                timeCondition = "AND timestamp >= NOW() - INTERVAL '24 hours'";
        }

        const result = await this.query(
            `SELECT 
                crypto_symbol,
                crypto_name,
                AVG(score) as score,
                COUNT(*) as search_count,
                MAX(timestamp) as last_analyzed,
                CASE 
                    WHEN AVG(score) >= 70 THEN 'BUY'
                    WHEN AVG(score) >= 40 THEN 'MAYBE' 
                    ELSE 'WAIT'
                END as signal,
                CASE 
                    WHEN COUNT(*) >= 10 THEN 'High'
                    WHEN COUNT(*) >= 5 THEN 'Medium'
                    ELSE 'Low'
                END as confidence
             FROM analyses 
             WHERE 1=1 ${timeCondition}
             GROUP BY crypto_symbol, crypto_name
             ORDER BY AVG(score) DESC, COUNT(*) DESC
             LIMIT $1`,
            [limit]
        );

        return result.rows.map((row, index) => ({
            rank: index + 1,
            symbol: row.crypto_symbol,
            name: row.crypto_name,
            score: Math.round(row.score),
            signal: row.signal,
            confidence: row.confidence,
            searchCount: row.search_count,
            lastAnalyzed: row.last_analyzed
        }));
    }

    async getDashboardStats(userId) {
        const results = await Promise.all([
            this.query('SELECT COUNT(*) as total FROM analyses WHERE user_id = $1', [userId]),
            this.query('SELECT COUNT(*) as today FROM analyses WHERE user_id = $1 AND DATE(timestamp) = CURRENT_DATE', [userId]),
            this.query('SELECT COUNT(*) as successful FROM analyses WHERE user_id = $1 AND score >= 70', [userId])
        ]);

        return {
            totalAnalyses: parseInt(results[0].rows[0].total),
            dailySearches: parseInt(results[1].rows[0].today),
            successfulPredictions: parseInt(results[2].rows[0].successful),
            moneySaved: parseInt(results[2].rows[0].successful) * 150 // Estimated savings
        };
    }
}

module.exports = PostgresDatabase;