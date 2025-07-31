class AuthManager {
  constructor() {
    this.user = null;
    this.init();
  }

  async init() {
    await this.checkAuthStatus();
    this.updateUI();
  }

  async checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.authenticated) {
          this.user = data.user;
          return true;
        }
      }
      
      this.user = null;
      return false;
    } catch (error) {
      console.error('Auth check failed:', error);
      this.user = null;
      return false;
    }
  }

  async login(email, password) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      
      if (response.ok) {
        this.user = data.user;
        this.updateUI();
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async register(email, password) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      
      if (response.ok) {
        this.user = data.user;
        this.updateUI();
        return { success: true, user: data.user };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Registration failed:', error);
      return { success: false, error: 'Network error' };
    }
  }

  async logout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      
      this.user = null;
      this.updateUI();
      
      // Redirect to home page
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  updateUI() {
    // Update auth buttons
    const loginBtns = document.querySelectorAll('.auth-login');
    const signupBtns = document.querySelectorAll('.auth-signup');
    const logoutBtns = document.querySelectorAll('.auth-logout');
    const userEmails = document.querySelectorAll('.user-email');
    const tierBadges = document.querySelectorAll('.user-tier');

    if (this.user) {
      // User is logged in
      loginBtns.forEach(btn => btn.style.display = 'none');
      signupBtns.forEach(btn => btn.style.display = 'none');
      logoutBtns.forEach(btn => btn.style.display = 'block');
      userEmails.forEach(el => el.textContent = this.user.email);
      tierBadges.forEach(el => {
        el.textContent = this.user.tier.toUpperCase();
        el.className = `user-tier px-2 py-1 rounded text-xs font-bold ${
          this.user.tier === 'pro' ? 'bg-purple-600' :
          this.user.tier === 'premium' ? 'bg-blue-600' : 'bg-gray-600'
        }`;
      });
    } else {
      // User is not logged in
      loginBtns.forEach(btn => btn.style.display = 'block');
      signupBtns.forEach(btn => btn.style.display = 'block');
      logoutBtns.forEach(btn => btn.style.display = 'none');
      userEmails.forEach(el => el.textContent = '');
      tierBadges.forEach(el => el.textContent = '');
    }

    // Update premium features visibility
    this.updatePremiumFeatures();
  }

  updatePremiumFeatures() {
    const premiumFeatures = document.querySelectorAll('.premium-feature');
    const proFeatures = document.querySelectorAll('.pro-feature');
    const upgradePrompts = document.querySelectorAll('.upgrade-prompt');

    const tier = this.user?.tier || 'free';

    premiumFeatures.forEach(el => {
      el.style.display = ['premium', 'pro'].includes(tier) ? 'block' : 'none';
    });

    proFeatures.forEach(el => {
      el.style.display = tier === 'pro' ? 'block' : 'none';
    });

    upgradePrompts.forEach(el => {
      el.style.display = tier === 'free' ? 'block' : 'none';
    });
  }

  isAuthenticated() {
    return !!this.user;
  }

  getTier() {
    return this.user?.tier || 'free';
  }

  getDailySearches() {
    return this.user?.dailySearches || 0;
  }

  canSearch() {
    const tier = this.getTier();
    if (tier !== 'free') return true;
    
    return this.getDailySearches() < 10;
  }

  getSearchesRemaining() {
    const tier = this.getTier();
    if (tier !== 'free') return 'unlimited';
    
    return Math.max(0, 10 - this.getDailySearches());
  }

  // Utility method to handle auth-required actions
  requireAuth(action) {
    if (!this.isAuthenticated()) {
      this.showLoginModal();
      return false;
    }
    return true;
  }

  showLoginModal() {
    // Show login modal or redirect to login page
    if (typeof showModal === 'function') {
      showModal('login');
    } else {
      window.location.href = '/login';
    }
  }

  showUpgradeModal() {
    if (typeof showModal === 'function') {
      showModal('upgrade');
    } else {
      window.location.href = '/pricing';
    }
  }

  // Event listeners for auth buttons
  attachEventListeners() {
    // Logout buttons
    document.addEventListener('click', (e) => {
      if (e.target.matches('.auth-logout')) {
        e.preventDefault();
        this.logout();
      }
    });

    // Login/signup redirects
    document.addEventListener('click', (e) => {
      if (e.target.matches('.auth-login')) {
        e.preventDefault();
        window.location.href = '/login';
      }
      
      if (e.target.matches('.auth-signup')) {
        e.preventDefault();
        window.location.href = '/signup';
      }
    });

    // Upgrade buttons
    document.addEventListener('click', (e) => {
      if (e.target.matches('.upgrade-btn')) {
        e.preventDefault();
        window.location.href = '/pricing';
      }
    });
  }
}

// Initialize auth manager
const authManager = new AuthManager();

// Attach event listeners when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    authManager.attachEventListeners();
  });
} else {
  authManager.attachEventListeners();
}

// Export for use in other scripts
window.authManager = authManager;