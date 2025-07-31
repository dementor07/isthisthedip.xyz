// Database adapter that works with both SQLite (local) and PostgreSQL (production)
const path = require('path');

class DatabaseAdapter {
    constructor() {
        this.db = null;
        this.isPostgres = process.env.POSTGRES_URL && process.env.NODE_ENV === 'production';
    }

    async connect() {
        if (this.isPostgres) {
            const PostgresDatabase = require('./postgres-db');
            this.db = new PostgresDatabase();
            await this.db.initialize();
            console.log('✅ Connected to PostgreSQL database');
        } else {
            const Database = require('./database');
            this.db = new Database();
            await this.db.connect();
            console.log('✅ Connected to SQLite database');
        }
    }

    // User operations - unified interface
    async createUser(email, passwordHash) {
        if (this.isPostgres) {
            return await this.db.createUser(email, passwordHash);
        } else {
            return await this.db.createUser(email, passwordHash);
        }
    }

    async getUserByEmail(email) {
        if (this.isPostgres) {
            return await this.db.getUserByEmail(email);
        } else {
            return await this.db.getUserByEmail(email);
        }
    }

    async getUserById(id) {
        if (this.isPostgres) {
            return await this.db.getUserById(id);
        } else {
            return await this.db.getUserById(id);
        }
    }

    async updateUserSearches(userId, increment = 1) {
        if (this.isPostgres) {
            return await this.db.updateUserSearches(userId, increment);
        } else {
            return await this.db.incrementUserSearches(userId);
        }
    }

    async updateUserTier(userId, tier, subscriptionExpires = null) {
        if (this.isPostgres) {
            return await this.db.updateUserTier(userId, tier, subscriptionExpires);
        } else {
            return await this.db.updateUserTier(userId, tier, subscriptionExpires);
        }
    }

    // Analysis operations
    async saveAnalysis(data) {
        if (this.isPostgres) {
            return await this.db.saveAnalysis(data);
        } else {
            return await this.db.saveAnalysis(
                data.user_id,
                data.crypto_symbol,
                data.crypto_name,
                data.score,
                data.signal,
                data.confidence,
                JSON.stringify(data.price_data),
                JSON.stringify(data.analysis_data),
                data.ip_address
            );
        }
    }

    async getRecentAnalyses(userId, limit = 10) {
        if (this.isPostgres) {
            return await this.db.getRecentAnalyses(userId, limit);
        } else {
            return await this.db.getRecentAnalyses(userId, limit);
        }
    }

    async getLeaderboard(timeframe = '24h', limit = 50) {
        if (this.isPostgres) {
            return await this.db.getLeaderboard(timeframe, limit);
        } else {
            return await this.db.getLeaderboard(timeframe, limit);
        }
    }

    async getDashboardStats(userId) {
        if (this.isPostgres) {
            return await this.db.getDashboardStats(userId);
        } else {
            return await this.db.getDashboardStats(userId);
        }
    }

    async getIPAnalysisCount(ipAddress) {
        if (this.isPostgres) {
            const result = await this.db.query(
                "SELECT COUNT(*) as count FROM analyses WHERE ip_address = $1 AND DATE(timestamp) = CURRENT_DATE",
                [ipAddress]
            );
            return parseInt(result.rows[0].count);
        } else {
            return await this.db.getIPAnalysisCount(ipAddress);
        }
    }

    async close() {
        if (this.db && this.db.close) {
            await this.db.close();
        }
    }
}

module.exports = DatabaseAdapter;