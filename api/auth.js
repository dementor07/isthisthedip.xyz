const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('./config');

class AuthService {
  static async hashPassword(password) {
    return bcrypt.hash(password, 12);
  }

  static async comparePasswords(password, hash) {
    return bcrypt.compare(password, hash);
  }

  static generateToken(userId, email) {
    return jwt.sign(
      { userId, email },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, config.JWT_SECRET);
    } catch (error) {
      return null;
    }
  }

  static async register(db, email, password) {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Check if user already exists
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Hash password and create user
    const passwordHash = await this.hashPassword(password);
    const result = await db.createUser(email, passwordHash);
    
    // Generate token
    const token = this.generateToken(result.id, email);
    
    return {
      userId: result.id,
      email,
      token,
      tier: 'free'
    };
  }

  static async login(db, email, password) {
    // Find user
    const user = await db.getUserByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Verify password
    const isValid = await this.comparePasswords(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Check subscription status
    let tier = user.subscription_tier;
    if (user.subscription_expires && new Date(user.subscription_expires) < new Date()) {
      tier = 'free';
      await db.run('UPDATE users SET subscription_tier = ? WHERE id = ?', ['free', user.id]);
    }

    // Generate token
    const token = this.generateToken(user.id, user.email);
    
    return {
      userId: user.id,
      email: user.email,
      token,
      tier,
      subscriptionExpires: user.subscription_expires
    };
  }

  static authenticateToken(req, res, next) {
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied - no token provided' });
    }

    const decoded = AuthService.verifyToken(token);
    if (!decoded) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = decoded;
    next();
  }

  static optionalAuth(req, res, next) {
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = AuthService.verifyToken(token);
      if (decoded) {
        req.user = decoded;
      }
    }
    
    next();
  }

  static async checkUserTier(db, userId) {
    if (!userId) return 'free';
    
    const user = await db.getUserById(userId);
    if (!user) return 'free';
    
    // Check if subscription is still valid
    if (user.subscription_expires && new Date(user.subscription_expires) < new Date()) {
      await db.run('UPDATE users SET subscription_tier = ? WHERE id = ?', ['free', user.id]);
      return 'free';
    }
    
    return user.subscription_tier || 'free';
  }

  static async checkDailyLimit(db, userId, userTier, ipAddress) {
    if (userTier !== 'free') {
      return { allowed: true, remaining: 'unlimited' };
    }

    if (!userId) {
      // IP-based limiting for anonymous users
      return await this.checkIPBasedLimit(db, ipAddress);
    }

    const user = await db.getUserById(userId);
    
    // If user not found, fall back to IP-based limiting
    if (!user) {
      return await this.checkIPBasedLimit(db, ipAddress);
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    let searches = 0;
    if (user.last_search_date === today) {
      searches = user.daily_searches || 0;
    }

    const remaining = Math.max(0, config.RATE_LIMITS.FREE_DAILY_SEARCHES - searches);
    
    return {
      allowed: remaining > 0,
      remaining,
      resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
  }

  static async checkIPBasedLimit(db, ipAddress) {
    const today = new Date().toISOString().split('T')[0];
    
    // Check IP-based searches for today
    const ipSearches = await db.all(
      'SELECT COUNT(*) as count FROM search_logs WHERE ip_address = ? AND date(timestamp) = ?',
      [ipAddress, today]
    );
    
    const searchCount = ipSearches[0]?.count || 0;
    const remaining = Math.max(0, config.RATE_LIMITS.FREE_DAILY_SEARCHES - searchCount);
    
    return {
      allowed: remaining > 0,
      remaining,
      resetTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      message: remaining === 0 ? 'Sign up for unlimited searches' : null
    };
  }
}

module.exports = AuthService;