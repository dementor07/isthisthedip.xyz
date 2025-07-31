const stripe = require('stripe');
const config = require('./config');

class PaymentService {
  constructor() {
    this.stripe = config.STRIPE.SECRET_KEY ? stripe(config.STRIPE.SECRET_KEY) : null;
  }

  async createCustomer(email, name) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.customers.create({
      email,
      name,
      metadata: {
        source: 'isthisthedip'
      }
    });
  }

  async createSubscription(customerId, priceId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });
  }

  async createCheckoutSession(priceId, customerId, successUrl, cancelUrl) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      subscription_data: {
        trial_period_days: 7, // 7-day free trial
      },
      allow_promotion_codes: true,
    });
  }

  async cancelSubscription(subscriptionId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });
  }

  async reactivateSubscription(subscriptionId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    });
  }

  async getSubscription(subscriptionId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.subscriptions.retrieve(subscriptionId);
  }

  async handleWebhook(body, signature) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    const event = this.stripe.webhooks.constructEvent(
      body,
      signature,
      config.STRIPE.WEBHOOK_SECRET
    );

    return event;
  }

  async processWebhookEvent(event, db) {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdate(event.data.object, db);
        break;
        
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancellation(event.data.object, db);
        break;
        
      case 'invoice.payment_succeeded':
        await this.handlePaymentSuccess(event.data.object, db);
        break;
        
      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object, db);
        break;
        
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  async handleSubscriptionUpdate(subscription, db) {
    const customerId = subscription.customer;
    const subscriptionId = subscription.id;
    const status = subscription.status;
    const currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    
    // Determine tier based on price ID
    let tier = 'free';
    if (subscription.items?.data?.[0]?.price?.id === config.STRIPE.PRICES.PREMIUM) {
      tier = 'premium';
    } else if (subscription.items?.data?.[0]?.price?.id === config.STRIPE.PRICES.PRO) {
      tier = 'pro';
    }
    
    // Update user in database
    await db.run(`
      UPDATE users 
      SET subscription_tier = ?, subscription_expires = ?, stripe_subscription_id = ?
      WHERE stripe_customer_id = ?
    `, [
      status === 'active' ? tier : 'free',
      status === 'active' ? currentPeriodEnd.toISOString() : null,
      subscriptionId,
      customerId
    ]);
  }

  async handleSubscriptionCancellation(subscription, db) {
    const customerId = subscription.customer;
    
    await db.run(`
      UPDATE users 
      SET subscription_tier = 'free', subscription_expires = NULL, stripe_subscription_id = NULL
      WHERE stripe_customer_id = ?
    `, [customerId]);
  }

  async handlePaymentSuccess(invoice, db) {
    // Payment succeeded - subscription remains active
    console.log(`Payment succeeded for customer: ${invoice.customer}`);
  }

  async handlePaymentFailure(invoice, db) {
    // Payment failed - handle gracefully
    console.log(`Payment failed for customer: ${invoice.customer}`);
    
    // Could send email notification, update user status, etc.
  }

  getPriceId(tier) {
    switch (tier) {
      case 'premium':
        return config.STRIPE.PRICES.PREMIUM;
      case 'pro':
        return config.STRIPE.PRICES.PRO;
      default:
        throw new Error('Invalid subscription tier');
    }
  }

  getTierFromPriceId(priceId) {
    if (priceId === config.STRIPE.PRICES.PREMIUM) return 'premium';
    if (priceId === config.STRIPE.PRICES.PRO) return 'pro';
    return 'free';
  }

  calculateTrialEnd() {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 7);
    return Math.floor(trialEnd.getTime() / 1000);
  }

  formatPrice(amountInCents) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amountInCents / 100);
  }

  // Create portal session for customers to manage their subscription
  async createPortalSession(customerId, returnUrl) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // Create a setup intent for future payments
  async createSetupIntent(customerId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }

  // Retrieve customer payment methods
  async getPaymentMethods(customerId) {
    if (!this.stripe) throw new Error('Stripe not configured');
    
    return await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
  }
}

module.exports = PaymentService;