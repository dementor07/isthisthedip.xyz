const sqlite3 = require('sqlite3').verbose();
const config = require('./config');
const path = require('path');

class Database {
  constructor() {
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.DATABASE_PATH, (err) => {
        if (err) {
          console.error('Database connection error:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.initTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async initTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        subscription_tier TEXT DEFAULT 'free',
        subscription_expires DATETIME,
        daily_searches INTEGER DEFAULT 0,
        last_search_date DATE,
        watchlist TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        is_admin INTEGER DEFAULT 0
      )`,
      
      `CREATE TABLE IF NOT EXISTS search_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        crypto_symbol TEXT,
        score INTEGER,
        confidence TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        ip_address TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username TEXT NOT NULL,
        user_tier TEXT DEFAULT 'free',
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted INTEGER DEFAULT 0,
        deleted_by INTEGER,
        parent_id INTEGER,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (deleted_by) REFERENCES users (id),
        FOREIGN KEY (parent_id) REFERENCES chat_messages (id)
      )`,
      
      `CREATE TABLE IF NOT EXISTS api_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE UNIQUE,
        alpha_vantage_calls INTEGER DEFAULT 0,
        hugging_face_calls INTEGER DEFAULT 0,
        news_api_calls INTEGER DEFAULT 0,
        coingecko_calls INTEGER DEFAULT 0
      )`,
      
      `CREATE TABLE IF NOT EXISTS user_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        crypto_symbol TEXT,
        threshold_score INTEGER,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`,
      
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE INDEX IF NOT EXISTS idx_search_logs_user ON search_logs(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage(date)`,
      `CREATE INDEX IF NOT EXISTS idx_user_alerts_user ON user_alerts(user_id)`
    ];

    for (const sql of tables) {
      await this.run(sql);
    }
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // User methods
  async createUser(email, passwordHash) {
    return this.run(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)',
      [email, passwordHash]
    );
  }

  async getUserByEmail(email) {
    return this.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  async getUserById(id) {
    return this.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  async updateUserSubscription(userId, tier, expires, stripeCustomerId, stripeSubscriptionId) {
    return this.run(
      'UPDATE users SET subscription_tier = ?, subscription_expires = ?, stripe_customer_id = ?, stripe_subscription_id = ? WHERE id = ?',
      [tier, expires, stripeCustomerId, stripeSubscriptionId, userId]
    );
  }

  async incrementUserSearches(userId) {
    if (!userId) {
      return; // Skip for anonymous users
    }
    
    const today = new Date().toISOString().split('T')[0];
    const user = await this.getUserById(userId);
    
    if (!user) {
      return; // User not found, nothing to increment
    }
    
    if (user.last_search_date === today) {
      return this.run(
        'UPDATE users SET daily_searches = daily_searches + 1 WHERE id = ?',
        [userId]
      );
    } else {
      return this.run(
        'UPDATE users SET daily_searches = 1, last_search_date = ? WHERE id = ?',
        [today, userId]
      );
    }
  }

  // Search logs
  async logSearch(userId, cryptoSymbol, score, confidence, ipAddress) {
    return this.run(
      'INSERT INTO search_logs (user_id, crypto_symbol, score, confidence, ip_address) VALUES (?, ?, ?, ?, ?)',
      [userId, cryptoSymbol, score, confidence, ipAddress]
    );
  }

  // API usage tracking
  async incrementAPIUsage(apiName) {
    const today = new Date().toISOString().split('T')[0];
    
    // Whitelist allowed API names to prevent SQL injection
    const allowedAPIs = ['alpha_vantage', 'hugging_face', 'news_api', 'coingecko'];
    if (!allowedAPIs.includes(apiName)) {
      throw new Error(`Invalid API name: ${apiName}`);
    }
    
    const column = `${apiName}_calls`;
    
    const existing = await this.get('SELECT * FROM api_usage WHERE date = ?', [today]);
    
    if (existing) {
      // Use parameterized query with column name validation
      if (apiName === 'alpha_vantage') {
        return this.run('UPDATE api_usage SET alpha_vantage_calls = alpha_vantage_calls + 1 WHERE date = ?', [today]);
      } else if (apiName === 'hugging_face') {
        return this.run('UPDATE api_usage SET hugging_face_calls = hugging_face_calls + 1 WHERE date = ?', [today]);
      } else if (apiName === 'news_api') {
        return this.run('UPDATE api_usage SET news_api_calls = news_api_calls + 1 WHERE date = ?', [today]);
      } else if (apiName === 'coingecko') {
        return this.run('UPDATE api_usage SET coingecko_calls = coingecko_calls + 1 WHERE date = ?', [today]);
      }
    } else {
      // Use parameterized query for INSERT as well
      if (apiName === 'alpha_vantage') {
        return this.run('INSERT INTO api_usage (date, alpha_vantage_calls) VALUES (?, 1)', [today]);
      } else if (apiName === 'hugging_face') {
        return this.run('INSERT INTO api_usage (date, hugging_face_calls) VALUES (?, 1)', [today]);
      } else if (apiName === 'news_api') {
        return this.run('INSERT INTO api_usage (date, news_api_calls) VALUES (?, 1)', [today]);
      } else if (apiName === 'coingecko') {
        return this.run('INSERT INTO api_usage (date, coingecko_calls) VALUES (?, 1)', [today]);
      }
    }
  }

  async getAPIUsage(date) {
    const usage = await this.get('SELECT * FROM api_usage WHERE date = ?', [date]);
    return usage || {
      alpha_vantage_calls: 0,
      hugging_face_calls: 0,
      news_api_calls: 0,
      coingecko_calls: 0
    };
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Initialize database if run directly
if (require.main === module) {
  const db = new Database();
  db.connect()
    .then(() => {
      console.log('Database initialized successfully');
      db.close();
    })
    .catch(err => {
      console.error('Database initialization failed:', err);
      process.exit(1);
    });
}

module.exports = Database;