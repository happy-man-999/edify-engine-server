import express from 'express';
import SignupProgress from '../models/SignupProgress.js';
import { authenticateToken } from '../middleware/auth.js';
import LogService from '../services/logService.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import DigitalOceanSpacesService from '../services/digitalOceanSpacesService.js';
import webhookService from '../services/webhookService.js';
import emailService from '../services/emailService.js';
import Settings from '../models/Settings.js';
import Snapshot from '../models/Snapshot.js';
import stripeService from '../services/stripeService.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import dotenv from 'dotenv';
import Item from '../models/Item.js';
import { getWorldLimit, hasReachedWorldLimit } from '../utils/planUtils.js';
import jwt from 'jsonwebtoken';

dotenv.config();

const router = express.Router();
const transactionService = new TransactionService();
const dropletService = new DropletService();
const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN, process.env.DIGITAL_OCEAN_SSH_KEY_ID);

// Test endpoint to verify the route is working
router.get('/test', async (req, res) => {
  try {
    const stripe = await stripeService.getStripe();
    const mode = await stripeService.getCurrentMode();
    
    res.json({ 
      message: 'Stripe route is working',
      timestamp: new Date().toISOString(),
      stripeConfigured: !!stripe,
      mode: mode
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error checking Stripe status',
      error: error.message 
    });
  }
});

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd' } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Get Stripe instance (will auto-refresh if settings changed)
    const stripe = await stripeService.getStripe();

    // If Stripe is not configured, return a mock response for development
    if (!stripe) {
      return res.json({
        clientSecret: 'mock_client_secret_for_development',
      });
    }

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment intent' });
  }
});

// Create Stripe Checkout session
router.post('/create-checkout-session', async (req, res) => {
  try {   
    const { amount, currency = 'usd', success_url, cancel_url, itemName, itemId, metadata } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Get Stripe instance (will auto-refresh if settings changed)
    const stripe = await stripeService.getStripe();

    // Note: amount should be in cents (e.g., 2999 for $29.99)
    console.log('Stripe instance status:', { hasStripe: !!stripe });

    // If Stripe is not configured, return a mock response for development
    if (!stripe) {
      return res.json({
        sessionId: 'mock_session_id_for_development',
      });
    }

    // Create a Checkout Session with metadata
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: itemName || 'Edify Engine Item',
              description: `Purchase: ${itemName || 'Item'} (ID: ${itemId || 'unknown'})`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success_url || `${req.headers.origin}/signup-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.headers.origin}/signup`,
      metadata: {
        itemName: itemName || 'Edify Engine',
        itemId: itemId || 'unknown',
        ...metadata
      }
    });

    res.json({
      sessionId: session.id,
    });
  } catch (error) {
    console.error('=== Stripe Checkout Session Error ===');
    console.error('Error creating checkout session:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Create Stripe Checkout session
router.post('/create-subscription-session', async (req, res) => {
  try {   
    const { success_url, cancel_url, itemName, itemId, metadata } = req.body;

    // Get Stripe instance (will auto-refresh if settings changed)
    const stripe = await stripeService.getStripe();

    // Note: amount should be in cents (e.g., 2999 for $29.99)
    console.log('Stripe instance status:', { hasStripe: !!stripe });

    // If Stripe is not configured, return a mock response for development
    if (!stripe) {
      return res.json({
        sessionId: 'mock_session_id_for_development',
      });
    }

    // Determine price ID based on plan and billing period
    const billingPeriod = metadata?.billingPeriod || 'annual';
    const isDiscounted = metadata?.discounted === true;
    let priceId = process.env.STRIPE_START_ANNUAL_PRICE_ID; // Default to start annual
    
    if (itemId === 'start-plan') {
      if (isDiscounted && billingPeriod === 'annual') {
        // Use discounted price ID for discounted annual starter plan
        priceId = process.env.STRIPE_DISCOUNTED_ANNULAR_PRICE_ID || process.env.STRIPE_START_ANNUAL_PRICE_ID;
      } else {
        priceId = billingPeriod === 'annual' 
          ? process.env.STRIPE_START_ANNUAL_PRICE_ID 
          : process.env.STRIPE_START_MONTHLY_PRICE_ID;
      }
    } else if (itemId === 'growth-plan') {
      priceId = billingPeriod === 'annual'
        ? process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID
        : process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID;
    } else if (itemId === 'studio-plan') {
      priceId = billingPeriod === 'annual'
        ? process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID
        : process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID;
    } else if (itemId === 'enterprise-plan') {
      // Enterprise uses custom pricing, handled separately
      priceId = process.env.STRIPE_ENTERPRISE_PRICE_ID;
    } else if (itemId === 'custom-domain') {
      priceId = process.env.STRIPE_CUSTOM_DOMAIN_PRICE_ID;
    } else if (itemId === 'basic-plan') {
      // Legacy support for basic plan
      priceId = process.env.STRIPE_BASIC_PRICE_ID || process.env.STRIPE_START_ANNUAL_PRICE_ID;
    } else if (itemId === 'premium-plan') {
      // Legacy support for premium plan
      priceId = process.env.STRIPE_PREMIUM_PRICE_ID || process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID;
    }

    // Check if this is a plan purchase
    const isPlanPurchase = itemId && (
      itemId === 'start-plan' || 
      itemId === 'growth-plan' || 
      itemId === 'studio-plan' || 
      itemId === 'enterprise-plan' || 
      itemId === 'basic-plan' || 
      itemId === 'premium-plan'
    );

    // Check if user is authenticated and has existing subscription (for upgrades)
    let user = null;
    let existingSubscription = null;
    let customerId = null;
    
    try {
      // Try to get user from token (optional - for upgrades)
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        user = await User.findById(decoded.userId);
        
        console.log('User subscription check:', {
          userId: user?._id,
          hasSubscriptionId: !!user?.stripeSubscriptionId,
          subscriptionId: user?.stripeSubscriptionId,
          isPlanPurchase,
          itemId
        });
        
        if (user && isPlanPurchase) {
          // Try to find existing subscription - either from database or by searching Stripe
          let subscriptionToUpdate = null;
          
          // First, try to use stored subscription ID
          if (user.stripeSubscriptionId) {
            try {
              subscriptionToUpdate = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
              customerId = user.stripeCustomerId || subscriptionToUpdate.customer;
              
              console.log('Existing subscription found in database:', {
                subscriptionId: subscriptionToUpdate.id,
                status: subscriptionToUpdate.status
              });
            } catch (retrieveError) {
              console.log('Stored subscription ID not found in Stripe, searching by customer:', retrieveError.message);
              // Subscription ID might be invalid, try to find by customer
            }
          }
          
          // If no subscription found from stored ID, try to find by customer ID
          if (!subscriptionToUpdate && user.stripeCustomerId) {
            try {
              const subscriptions = await stripe.subscriptions.list({
                customer: user.stripeCustomerId,
                status: 'all',
                limit: 10
              });
              
              // Find the most recent active subscription
              subscriptionToUpdate = subscriptions.data.find(sub => 
                sub.status === 'active' || sub.status === 'trialing'
              ) || subscriptions.data[0]; // Fallback to most recent if no active
              
              if (subscriptionToUpdate) {
                customerId = user.stripeCustomerId;
                console.log('Found subscription by searching Stripe:', {
                  subscriptionId: subscriptionToUpdate.id,
                  status: subscriptionToUpdate.status
                });
                
                // Update user record with found subscription ID
                await User.findByIdAndUpdate(user._id, {
                  stripeSubscriptionId: subscriptionToUpdate.id,
                  stripeCustomerId: customerId
                });
              }
            } catch (searchError) {
              console.error('Error searching for subscriptions:', searchError);
            }
          }
          
          // If we found a subscription, update it
          if (subscriptionToUpdate) {
            existingSubscription = subscriptionToUpdate;
            
            console.log('Existing subscription found:', {
              subscriptionId: existingSubscription.id,
              status: existingSubscription.status,
              currentPriceId: existingSubscription.items.data[0]?.price?.id,
              newPriceId: priceId
            });
            
            // Check if subscription is active
            if (existingSubscription.status === 'active' || existingSubscription.status === 'trialing') {
              try {
                // Determine if this is an upgrade or downgrade by comparing prices
                const currentPriceId = existingSubscription.items.data[0].price.id;
                const currentPrice = await stripe.prices.retrieve(currentPriceId);
                const newPrice = await stripe.prices.retrieve(priceId);
                const isDowngrade = newPrice.unit_amount < currentPrice.unit_amount;
                
                // If this is a downgrade, validate world limits before proceeding
                if (isDowngrade && isPlanPurchase && itemId) {
                  const planMapping = {
                    'start-plan': { name: 'Starter', value: 'starter' },
                    'growth-plan': { name: 'Growth', value: 'growth' },
                    'studio-plan': { name: 'Studio', value: 'studio' },
                    'enterprise-plan': { name: 'Enterprise', value: 'enterprise' },
                    'basic-plan': { name: 'Basic', value: 'basic' },
                    'premium-plan': { name: 'Premium', value: 'premium' }
                  };
                  
                  const planInfo = planMapping[itemId] || { name: 'Plan', value: 'starter' };
                  const targetPlan = planInfo.value;
                  
                  // Check if user's current world count exceeds the target plan's limit
                  const userWorldCount = await dropletService.countUserDroplets(user._id);
                  const targetPlanLimit = getWorldLimit(targetPlan);
                  
                  if (targetPlanLimit !== null && userWorldCount > targetPlanLimit) {
                    return res.status(400).json({ 
                      error: `Cannot downgrade to ${planInfo.name} plan. You currently have ${userWorldCount} world${userWorldCount > 1 ? 's' : ''}, but the ${planInfo.name} plan allows a maximum of ${targetPlanLimit} world${targetPlanLimit > 1 ? 's' : ''}. Please delete ${userWorldCount - targetPlanLimit} world${userWorldCount - targetPlanLimit > 1 ? 's' : ''} before downgrading.`,
                      limitExceeded: true,
                      currentWorldCount: userWorldCount,
                      targetPlanLimit: targetPlanLimit,
                      targetPlanName: planInfo.name
                    });
                  }
                }
                
                // Update the subscription with new plan
                // For upgrades: charge immediately with proration
                // For downgrades: create prorations (credit) that apply to next invoice
                const updatedSubscription = await stripe.subscriptions.update(
                  existingSubscription.id,
                  {
                    items: [{
                      id: existingSubscription.items.data[0].id,
                      price: priceId,
                    }],
                    proration_behavior: isDowngrade 
                      ? 'create_prorations' // For downgrades: credit unused time to next invoice
                      : 'always_invoice',  // For upgrades: charge immediately with proration
                    metadata: {
                      itemName: itemName || 'Edify Engine',
                      itemId: itemId || 'unknown',
                      ...metadata,
                    }
                  }
                );
                
                console.log('Subscription updated successfully:', {
                  oldSubscriptionId: existingSubscription.id,
                  newSubscriptionId: updatedSubscription.id,
                  itemId,
                  isDowngrade
                });
                
                // Return subscription update info instead of checkout session
                return res.json({
                  sessionId: updatedSubscription.id,
                  subscriptionId: updatedSubscription.id,
                  customerId: customerId,
                  isUpdate: true,
                  message: 'Subscription updated successfully'
                });
              } catch (updateError) {
                console.error('Error updating subscription:', updateError);
                console.error('Subscription error details:', {
                  subscriptionId: existingSubscription.id,
                  error: updateError.message,
                  stack: updateError.stack
                });
                // If subscription update fails, fall through to create new checkout
                // This handles cases where subscription might be cancelled or invalid
              }
            } else {
              console.log('Subscription is not active, status:', existingSubscription.status);
            }
          }
        } else if (user && user.stripeCustomerId && isPlanPurchase) {
          // User has customer ID but no active subscription - use existing customer
          customerId = user.stripeCustomerId;
        } else {
          console.log('No existing subscription to update:', {
            hasUser: !!user,
            hasSubscriptionId: user?.stripeSubscriptionId,
            isPlanPurchase
          });
        }
      }
    } catch (authError) {
      // Not authenticated or invalid token - proceed with new checkout
      console.log('User not authenticated or token invalid, creating new checkout');
    }

    // Create a Checkout Session with metadata
    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: success_url || `${req.headers.origin}/signup-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancel_url || `${req.headers.origin}/signup`,
      metadata: {
        itemName: itemName || 'Edify Engine',
        itemId: itemId || 'unknown',
        ...metadata,
      }
    };

    // If user has existing customer ID, use it (for upgrades from non-subscription to subscription)
    if (customerId) {
      sessionConfig.customer = customerId;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({
      sessionId: session.id,
      isUpdate: false
    });
  } catch (error) {
    console.error('=== Stripe Checkout Session Error ===');
    console.error('Error creating checkout session:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Handle subscription downgrades (no payment required, just update subscription)
router.post('/downgrade-subscription', authenticateToken, async (req, res) => {
  try {
    const { itemId, billingPeriod } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ error: 'Item ID is required' });
    }

    const stripe = await stripeService.getStripe();
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    // Get user's subscription
    const user = await User.findById(req.user._id);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    // Retrieve current subscription
    let subscription;
    try {
      subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    } catch (error) {
      return res.status(404).json({ error: 'Subscription not found or invalid' });
    }

    // Check if subscription is active
    if (subscription.status !== 'active' && subscription.status !== 'trialing') {
      return res.status(400).json({ error: 'Subscription is not active' });
    }

    // Determine new price ID
    let priceId = process.env.STRIPE_START_ANNUAL_PRICE_ID;
    
    if (itemId === 'start-plan') {
      priceId = billingPeriod === 'annual' 
        ? process.env.STRIPE_START_ANNUAL_PRICE_ID 
        : process.env.STRIPE_START_MONTHLY_PRICE_ID;
    } else if (itemId === 'growth-plan') {
      priceId = billingPeriod === 'annual'
        ? process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID
        : process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID;
    } else if (itemId === 'studio-plan') {
      priceId = billingPeriod === 'annual'
        ? process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID
        : process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID;
    }

    // Verify this is actually a downgrade by comparing prices
    const currentPriceId = subscription.items.data[0].price.id;
    const currentPrice = await stripe.prices.retrieve(currentPriceId);
    const newPrice = await stripe.prices.retrieve(priceId);
    
    if (newPrice.unit_amount >= currentPrice.unit_amount) {
      return res.status(400).json({ error: 'This is not a downgrade. Use upgrade endpoint instead.' });
    }

    // Map target plan to check world limits
    const planMapping = {
      'start-plan': { name: 'Starter', value: 'starter' },
      'growth-plan': { name: 'Growth', value: 'growth' },
      'studio-plan': { name: 'Studio', value: 'studio' },
    };
    
    const planInfo = planMapping[itemId] || { name: 'Plan', value: 'starter' };
    const targetPlan = planInfo.value;
    
    // Check if user's current world count exceeds the target plan's limit
    const userWorldCount = await dropletService.countUserDroplets(req.user._id);
    const targetPlanLimit = getWorldLimit(targetPlan);
    
    if (targetPlanLimit !== null && userWorldCount > targetPlanLimit) {
      return res.status(400).json({ 
        error: `Cannot downgrade to ${planInfo.name} plan. You currently have ${userWorldCount} world${userWorldCount > 1 ? 's' : ''}, but the ${planInfo.name} plan allows a maximum of ${targetPlanLimit} world${targetPlanLimit > 1 ? 's' : ''}. Please delete ${userWorldCount - targetPlanLimit} world${userWorldCount - targetPlanLimit > 1 ? 's' : ''} before downgrading.`,
        limitExceeded: true,
        currentWorldCount: userWorldCount,
        targetPlanLimit: targetPlanLimit,
        targetPlanName: planInfo.name
      });
    }

    // Update subscription with downgrade (creates credits for unused time)
    const updatedSubscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      {
        items: [{
          id: subscription.items.data[0].id,
          price: priceId,
        }],
        proration_behavior: 'create_prorations', // Creates credits for unused time
      }
    );
    
    await User.findByIdAndUpdate(req.user._id, {
      plan: planInfo.value,
      stripeSubscriptionId: updatedSubscription.id
    });

    res.json({
      success: true,
      subscriptionId: updatedSubscription.id,
      message: 'Subscription downgraded successfully. Credit for unused time will be applied to your next invoice.',
      plan: planInfo.value
    });
  } catch (error) {
    console.error('Error downgrading subscription:', error);
    res.status(500).json({ error: 'Failed to downgrade subscription' });
  }
});

// Handle direct subscription updates (when subscription is updated via API, not checkout)
router.post('/update-subscription', authenticateToken, async (req, res) => {
  try {
    const { subscriptionId, itemId } = req.body;
    
    if (!subscriptionId || !itemId) {
      return res.status(400).json({ error: 'Subscription ID and item ID are required' });
    }

    const stripe = await stripeService.getStripe();
    if (!stripe) {
      return res.status(500).json({ error: 'Stripe is not configured' });
    }

    // Get user's subscription
    const user = await User.findById(req.user._id);
    if (!user || user.stripeSubscriptionId !== subscriptionId) {
      return res.status(403).json({ error: 'Subscription not found or access denied' });
    }

    // Retrieve current subscription
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Determine new price ID
    const billingPeriod = req.body.billingPeriod || 'annual';
    let priceId = process.env.STRIPE_START_ANNUAL_PRICE_ID;
    
    if (itemId === 'start-plan') {
      priceId = billingPeriod === 'annual' 
        ? process.env.STRIPE_START_ANNUAL_PRICE_ID 
        : process.env.STRIPE_START_MONTHLY_PRICE_ID;
    } else if (itemId === 'growth-plan') {
      priceId = billingPeriod === 'annual'
        ? process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID
        : process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID;
    } else if (itemId === 'studio-plan') {
      priceId = billingPeriod === 'annual'
        ? process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID
        : process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID;
    }

    // Update subscription
    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      {
        items: [{
          id: subscription.items.data[0].id,
          price: priceId,
        }],
        proration_behavior: 'always_invoice',
      }
    );

    // Map plan and update user
    const planMapping = {
      'start-plan': { name: 'Starter', value: 'starter' },
      'growth-plan': { name: 'Growth', value: 'growth' },
      'studio-plan': { name: 'Studio', value: 'studio' },
    };
    
    const planInfo = planMapping[itemId] || { name: 'Plan', value: 'starter' };
    
    await User.findByIdAndUpdate(req.user._id, {
      plan: planInfo.value,
      stripeSubscriptionId: updatedSubscription.id
    });

    res.json({
      success: true,
      subscriptionId: updatedSubscription.id,
      message: 'Subscription updated successfully'
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
});

// Webhook endpoint for handling Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Get Stripe instance (will auto-refresh if settings changed)
  const stripe = await stripeService.getStripe();
  
  // If Stripe is not configured, return success for development
  if (!stripe) {
    return res.json({ received: true });
  }

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      // Log successful payment
      try {
        await LogService.logWebhook({
          type: 'payment_intent.succeeded',
          source: 'stripe',
          payload: paymentIntent,
          status: 'completed'
        });
      } catch (logError) {
        console.error('Error logging webhook:', logError);
      }
      // Here you would typically update your database to mark the user as paid
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      // Log failed payment
      try {
        await LogService.logWebhook({
          type: 'payment_intent.payment_failed',
          source: 'stripe',
          payload: failedPayment,
          status: 'failed'
        });
      } catch (logError) {
        console.error('Error logging webhook:', logError);
      }
      break;
    case 'customer.subscription.created':
      const subscription = event.data.object;
      console.log('Subscription created:', subscription.id);
      
      // Update user with subscription and customer IDs
      try {
        const customerId = typeof subscription.customer === 'string' 
          ? subscription.customer 
          : subscription.customer.id;
        
        await User.findOneAndUpdate(
          { stripeCustomerId: customerId },
          {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customerId
          }
        );
      } catch (userError) {
        console.error('Error updating user with subscription:', userError);
      }
      
      // Handle new subscription creation
      try {
        await LogService.logWebhook({
          type: 'customer.subscription.created',
          source: 'stripe',
          payload: subscription,
          status: 'completed'
        });
      } catch (logError) {
        console.error('Error logging webhook:', logError);
      }
      break;
    case 'customer.subscription.updated':
      const updatedSubscription = event.data.object;
      console.log('Subscription updated:', updatedSubscription.id);
      
      // Update user subscription info and plan if subscription is active
      try {
        const customerId = typeof updatedSubscription.customer === 'string' 
          ? updatedSubscription.customer 
          : updatedSubscription.customer.id;
        
        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          const updateData = {
            stripeSubscriptionId: updatedSubscription.id
          };
          
          // If subscription is active, extract plan from subscription items and update user plan
          if (updatedSubscription.status === 'active' || updatedSubscription.status === 'trialing') {
            // Get the price ID from the subscription's first item
            const priceId = updatedSubscription.items?.data?.[0]?.price?.id;
            
            if (priceId) {
              // Map price ID to plan value
              const priceToPlanMap = {
                [process.env.STRIPE_START_MONTHLY_PRICE_ID]: 'starter',
                [process.env.STRIPE_START_ANNUAL_PRICE_ID]: 'starter',
                [process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID]: 'growth',
                [process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID]: 'growth',
                [process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID]: 'studio',
                [process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID]: 'studio',
                [process.env.STRIPE_ENTERPRISE_PRICE_ID]: 'enterprise',
                [process.env.STRIPE_BASIC_PRICE_ID]: 'starter', // Legacy
                [process.env.STRIPE_PREMIUM_PRICE_ID]: 'growth' // Legacy
              };
              
              const planValue = priceToPlanMap[priceId];
              
              if (planValue) {
                updateData.plan = planValue;
                console.log(`Updating user ${user._id} plan to ${planValue} based on price ID ${priceId}`);
              } else {
                console.warn(`Unknown price ID ${priceId} in subscription update, keeping current plan`);
              }
            } else {
              console.warn('No price ID found in subscription items');
            }
          }
          
          await User.findByIdAndUpdate(user._id, updateData);
          console.log(`Updated user ${user._id} subscription info and plan`);
        } else {
          console.warn(`User not found for customer ID ${customerId}`);
        }
      } catch (userError) {
        console.error('Error updating user subscription:', userError);
      }
      
      try {
        await LogService.logWebhook({
          type: 'customer.subscription.updated',
          source: 'stripe',
          payload: updatedSubscription,
          status: 'completed'
        });
      } catch (logError) {
        console.error('Error logging webhook:', logError);
      }
      break;
    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object;
      console.log('Subscription deleted:', deletedSubscription.id);
      
      // Clear subscription ID from user when subscription is cancelled
      try {
        await User.findOneAndUpdate(
          { stripeSubscriptionId: deletedSubscription.id },
          {
            $unset: { stripeSubscriptionId: '' }
            // Note: We don't change the plan here - user might still have access until period ends
            // You might want to add logic to downgrade plan or mark as cancelled
          }
        );
      } catch (userError) {
        console.error('Error clearing user subscription:', userError);
      }
      
      try {
        await LogService.logWebhook({
          type: 'customer.subscription.deleted',
          source: 'stripe',
          payload: deletedSubscription,
          status: 'completed'
        });
      } catch (logError) {
        console.error('Error logging webhook:', logError);
      }
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
      // Log unhandled event
      try {
        await LogService.logWebhook({
          type: event.type,
          source: 'stripe',
          payload: event.data.object,
          status: 'unhandled'
        });
      } catch (logError) {
        console.error('Error logging webhook:', logError);
      }
  }

  res.json({ received: true });
});

// Payment success webhook
const tempHeap = {};
router.post('/payment-success', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    if (process.env.NODE_ENV === 'development') {
      if (tempHeap[sessionId]) {
        return res.status(200).json({ success: true });
      }
      tempHeap[sessionId] = true;
    }

    // Get Stripe instance (will auto-refresh if settings changed)
    const stripe = await stripeService.getStripe();

    // Retrieve the session from Stripe
    let session;
    let subscription = null;
    let customerId = null;
    let isDirectSubscriptionUpdate = false;
    
    try {
      if (stripe) {
        // First, try to retrieve as a checkout session
        try {
          session = await stripe.checkout.sessions.retrieve(sessionId, {
            expand: ['subscription', 'customer']
          });
          
          // Get subscription and customer IDs if this is a subscription
          if (session.subscription) {
            subscription = typeof session.subscription === 'string' 
              ? await stripe.subscriptions.retrieve(session.subscription)
              : session.subscription;
            customerId = subscription.customer;
          } else if (session.customer) {
            customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
          }
        } catch (sessionError) {
          // If it's not a checkout session, try as a subscription ID (for direct updates)
          try {
            subscription = await stripe.subscriptions.retrieve(sessionId);
            customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
            isDirectSubscriptionUpdate = true;
            
            // Create a mock session object from subscription for compatibility
            session = {
              metadata: subscription.metadata || {},
              amount_total: subscription.items.data[0]?.price?.unit_amount || 0,
              currency: subscription.currency || 'usd',
              subscription: subscription
            };
          } catch (subError) {
            console.error('Error retrieving Stripe session or subscription:', sessionError, subError);
            return res.status(500).json({ error: 'Failed to retrieve payment session or subscription' });
          }
        }
      } else {
        // Mock session for development
        session = {
          metadata: { itemName: 'Mock Item', itemId: 'mock-id' },
          amount_total: 2999,
          currency: 'usd'
        };
      }
    } catch (error) {
      console.error('Error retrieving Stripe session:', error);
      return res.status(500).json({ error: 'Failed to retrieve payment session' });
    }

    const sessionMetadata = session.metadata;
    const itemId = sessionMetadata?.itemId;
    
    // Check for duplicate transaction - use combined signature for subscription updates
    const isPlanPurchase = itemId === 'start-plan' || itemId === 'growth-plan' || itemId === 'studio-plan' || itemId === 'enterprise-plan' || itemId === 'basic-plan' || itemId === 'premium-plan';
    
    // For subscription updates with timestamps, check if any transaction exists with sessionId-itemId pattern
    if (isDirectSubscriptionUpdate && isPlanPurchase && itemId) {
      // Check if any transaction exists with this sessionId-itemId pattern (ignoring timestamp)
      const existingTransaction = await Transaction.findOne({
        signature: { $regex: `^${sessionId}-${itemId}-` }
      });
      if (existingTransaction) {
        return res.status(400).json({ error: 'Transaction already processed' });
      }
    } else {
      // For regular transactions, check exact signature match
      const processedTransaction = await transactionService.getTransactionBySignature(sessionId);
      if (processedTransaction) {
        return res.status(400).json({ error: 'Transaction already processed' });
      }
    }
    const itemName = sessionMetadata?.itemName;
    const dropletId = sessionMetadata?.dropletId;
    const snapshotId = sessionMetadata?.snapshotId;
    const cartItemsString = sessionMetadata?.cartItems;
    const itemNamesString = sessionMetadata?.itemNames;
    
    // Parse cartItems from JSON string if it exists
    let cartItems = null;
    if (cartItemsString) {
      try {
        cartItems = JSON.parse(cartItemsString);
      } catch (error) {
        console.error('Error parsing cartItems from metadata:', error);
        cartItems = null;
      }
    }

    let itemNames = null;
    if (itemNamesString) {
      try {
        itemNames = JSON.parse(itemNamesString);
      } catch (error) {
        console.error('Error parsing itemNames from metadata:', error);
        itemNames = null;
      }
    }
    // For direct subscription updates, get amount from subscription's latest invoice or current period
    let amount = 0;
    if (isDirectSubscriptionUpdate && subscription) {
      // For subscription updates, amount is prorated by Stripe
      // We can get it from the latest invoice or use 0 since it's already charged
      try {
        const invoices = await stripe.invoices.list({
          subscription: subscription.id,
          limit: 1
        });
        if (invoices.data.length > 0 && invoices.data[0].amount_due) {
          amount = invoices.data[0].amount_due / 100;
        }
      } catch (invoiceError) {
        // If we can't get invoice, use 0 - the subscription is already updated
        amount = 0;
      }
    } else {
      amount = session.amount_total / 100; // Convert from cents to dollars
    }
    
    const currency = session.currency?.toUpperCase() || 'USD';

    const isNewWorld = itemId === 'new-world';
    const isCartPurchase = itemId === 'cart-purchase';
    const isCustomDomain = itemId === 'custom-domain';
    // isPlanPurchase already declared above
    const isItemPurchase = itemId && !isNewWorld && !isCartPurchase && !isCustomDomain && !isPlanPurchase;
    
    // Create transaction record first (skip for direct subscription updates if already exists)
    let transaction;
    if (!isDirectSubscriptionUpdate) {
      try {
        transaction = await transactionService.createTransaction({
          signature: sessionId,
          user: req.user._id,
          amount: amount,
          paymentMethod: 'stripe',
          status: 'success',
          date: new Date(),
          item: isItemPurchase ? itemId : null,
          itemType: itemId === 'new-world' ? 'new-world' : 
                   isPlanPurchase ? (itemId.endsWith('-plan') ? itemId : 'other') :
                   itemId === 'cart-purchase' ? 'cart-purchase' :
                   itemId === 'custom-domain' ? 'custom-domain' :
                   itemId && itemId !== 'unknown' ? 'item-purchase' : 'other',
          cartItems
        });
      } catch (error) {
        console.error('Error creating transaction:', error);
        // Don't fail if transaction already exists
        if (!error.message.includes('duplicate') && !error.message.includes('already exists')) {
          return res.status(500).json({ error: 'Failed to create transaction record' });
        }
      }
    } else {
      // For direct subscription updates, create signature as sessionId + plan name + date/time
      let subscriptionUpdateSignature = sessionId;
      if (isPlanPurchase && itemId) {
        // Add timestamp to ensure uniqueness for multiple updates
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: YYYY-MM-DDTHH-MM-SS
        subscriptionUpdateSignature = `${sessionId}-${itemId}-${timestamp}`;
      }
      
      // Check if transaction already exists with this signature
      try {
        transaction = await transactionService.getTransactionBySignature(subscriptionUpdateSignature);
        if (!transaction && amount > 0) {
          // Create transaction for the subscription update
          transaction = await transactionService.createTransaction({
            signature: subscriptionUpdateSignature,
            user: req.user._id,
            amount: amount,
            paymentMethod: 'stripe',
            status: 'success',
            date: new Date(),
            item: null,
            itemType: isPlanPurchase ? (itemId.endsWith('-plan') ? itemId : 'other') : 'other',
            cartItems: null
          });
        }
      } catch (error) {
        console.error('Error creating transaction for subscription update:', error);
        // Continue even if transaction creation fails
      }
    }

    // Handle different payment types based on itemId
    if (isPlanPurchase) {
      // Map plan IDs to plan names and values
      const planMapping = {
        'start-plan': { name: 'Starter', value: 'starter' },
        'growth-plan': { name: 'Growth', value: 'growth' },
        'studio-plan': { name: 'Studio', value: 'studio' },
        'enterprise-plan': { name: 'Enterprise', value: 'enterprise' },
        'basic-plan': { name: 'Basic', value: 'basic' },
        'premium-plan': { name: 'Premium', value: 'premium' }
      };
      
      const planInfo = planMapping[itemId] || { name: 'Plan', value: 'starter' };
      
      // Get user's current plan to determine if this is an upgrade or downgrade
      const currentUser = await User.findById(req.user._id);
      const currentPlan = currentUser?.plan || 'free';
      const newPlan = planInfo.value;
      
      // Determine if this is an upgrade or downgrade
      const planHierarchy = { 'free': 0, 'starter': 1, 'growth': 2, 'studio': 3, 'enterprise': 4 };
      const currentPlanLevel = planHierarchy[currentPlan] || 0;
      const newPlanLevel = planHierarchy[newPlan] || 0;
      const isUpgrade = newPlanLevel > currentPlanLevel;
      const isDowngrade = newPlanLevel < currentPlanLevel;
      const isSamePlan = newPlanLevel === currentPlanLevel;
      
      // Prepare user update object
      const userUpdate = {
        role: 'user',
        plan: planInfo.value
      };
      
      // Store Stripe customer and subscription IDs if available
      if (customerId) {
        userUpdate.stripeCustomerId = typeof customerId === 'string' ? customerId : customerId.id;
      }
      if (subscription && subscription.id) {
        userUpdate.stripeSubscriptionId = subscription.id;
      }
      
      // Give membership and store subscription info
      const updatedUser = await User.findOneAndUpdate(
        { _id: req.user._id },
        userUpdate,
        { new: true }
      );
      
      console.log(`Updated user ${req.user._id} plan from ${currentPlan} to ${newPlan} (${planInfo.name})`);
      
      // Handle plan signup payment
      const progress = await SignupProgress.findOne({ userId: req.user._id });
      const planName = planInfo.name;
      
      if (progress) {
        progress.payment = {
          isCompleted: true,
          stripeSessionId: sessionId,
          amount: amount,
          completedAt: new Date()
        };
        progress.isCompleted = true;
        progress.completedAt = new Date();
        await progress.save();
        
        // Log successful plan payment
        try {
          await LogService.logPurchase(req.user._id, null, transaction._id, {
            itemName: `Edify Engine ${planName} Plan`,
            amount: amount,
            paymentMethod: 'stripe',
            signature: sessionId,
            currency: currency
          });
        } catch (logError) {
          console.error('Error logging purchase:', logError);
        }
        
        // Send admin notification email
        try {
          await emailService.sendAdminPaymentNotification({
            amount: amount,
            currency: currency,
            userName: `${req.user.firstName} ${req.user.lastName}`,
            userEmail: req.user.email,
            itemName: `Edify Engine ${planName} Plan`,
            paymentMethod: 'Stripe',
            transactionId: sessionId
          });
        } catch (emailError) {
          console.error('Error sending admin payment notification:', emailError);
        }
        
        res.json({ 
          success: true, 
          message: `${planName} plan payment completed and signup progress updated`,
          itemType: itemId,
          itemName: itemName,
          isUpgrade,
          isDowngrade,
          isSamePlan,
          previousPlan: currentPlan,
          newPlan: newPlan,
          planName: planName,
          isDirectSubscriptionUpdate
        });
      } else {
        // For subscription updates (not signup), still return success
        res.json({ 
          success: true, 
          message: `${planName} plan ${isUpgrade ? 'upgraded' : isDowngrade ? 'downgraded' : 'updated'} successfully`,
          itemType: itemId,
          itemName: itemName,
          isUpgrade,
          isDowngrade,
          isSamePlan,
          previousPlan: currentPlan,
          newPlan: newPlan,
          planName: planName,
          isDirectSubscriptionUpdate
        });
      }
    } else if (isNewWorld) {
      // Handle new world creation payment - return immediately and process in background
      
      // Check if user has reached their world limit based on their plan
      const userDropletCount = await dropletService.countUserDroplets(req.user._id);
      const worldLimit = getWorldLimit(req.user.plan);
      
      if (hasReachedWorldLimit(req.user.plan, userDropletCount)) {
        const limitText = worldLimit === null ? 'unlimited' : worldLimit;
        return res.status(400).json({ 
          error: 'World creation limit reached',
          message: `You have already reached the maximum limit of ${limitText} world${worldLimit !== 1 ? 's' : ''}. Please delete an existing world before creating a new one.`,
          itemType: 'new-world',
          limitReached: true
        });
      }
      
      const settings = await Settings.getSettings();
      
      // Log new world creation payment
      try {
        await LogService.createLog({
          level: 'success',
          type: 'purchase',
          message: `User purchased new world creation`,
          details: {
            itemName: 'New World Creation',
            amount: amount,
            paymentMethod: 'stripe',
            signature: sessionId
          },
          status: 'completed',
          userId: req.user._id,
          transactionId: transaction._id,
          metadata: {
            currency: currency,
            itemType: 'new-world'
          }
        });
      } catch (logError) {
        console.error('Error logging new world creation:', logError);
      }
      
      // Send admin notification email
      try {
        await emailService.sendAdminPaymentNotification({
          amount: amount,
          currency: currency,
          userName: `${req.user.firstName} ${req.user.lastName}`,
          userEmail: req.user.email,
          itemName: 'New World Creation',
          paymentMethod: 'Stripe',
          transactionId: sessionId
        });
      } catch (emailError) {
        console.error('Error sending admin payment notification:', emailError);
      }
      
      // Start background processing
      processNewWorldCreation(sessionId, req.user._id, transaction._id, amount, currency, itemName, settings, snapshotId);
      
      res.json({ 
        success: true, 
        message: 'Payment confirmed! Your new world is being created in the background.',
        itemType: 'new-world',
        itemName: itemName,
        processing: true,
        transactionId: transaction._id
      });
    } else if (isCustomDomain) {
      let droplet, updatedDroplet;

      try {
        droplet = await dropletService.getDropletById(dropletId);
      } catch (error) {
        console.error('Error finding droplet:', error);
      }
        
      if (!droplet) {
        return res.status(404).json({ 
          success: false,
          message: 'Droplet not found or you do not have permission to modify it' 
        });
      }

      try {
        await LogService.logPurchase(req.user._id, null, transaction._id, {
          itemName: 'Custom Domain',
          amount: amount,
          paymentMethod: 'stripe',
          signature: sessionId,
          currency: currency
        });
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }
      
      // Send admin notification email
      try {
        await emailService.sendAdminPaymentNotification({
          amount: amount,
          currency: currency,
          userName: `${req.user.firstName} ${req.user.lastName}`,
          userEmail: req.user.email,
          itemName: 'Custom Domain',
          paymentMethod: 'Stripe',
          transactionId: sessionId
        });
      } catch (emailError) {
        console.error('Error sending admin payment notification:', emailError);
      }
      
      try {
        updatedDroplet = await dropletService.updateDropletByDropletId(dropletId, { customDomainPaid: true });
      } catch (error) {
        console.error('Error updating droplet:', error);
      }

      res.json({ 
        success: true, 
        message: 'Payment confirmed! Your new world is being created in the background.',
        itemType: 'custom-domain',
        itemName: itemName,
        processing: true,
        transactionId: transaction._id,
        droplet: {
          dropletId: updatedDroplet.dropletId,
          name: updatedDroplet.name,
          customDomainPaid: updatedDroplet.customDomainPaid,
          customDomainTransaction: updatedDroplet.customDomainTransaction
        }
      });
    } else if (isCartPurchase) {
      try {
        await LogService.logPurchase(req.user._id, null, transaction._id, {
          itemName: itemNames.join(', ') || 'Cart Items',
          amount: amount,
          paymentMethod: 'stripe',
          signature: sessionId,
          currency: currency
        });
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }

      // Send admin notification email
      try {
        await emailService.sendAdminPaymentNotification({
          amount: amount,
          currency: currency,
          userName: `${req.user.firstName} ${req.user.lastName}`,
          userEmail: req.user.email,
          itemName: itemNames.join(', ') || 'Cart Items',
          paymentMethod: 'Stripe',
          transactionId: sessionId
        });
      } catch (emailError) {
        console.error('Error sending admin payment notification:', emailError);
      }

      // Credit 80% to each creator for cart items
      if (cartItems && cartItems.length > 0) {
        try {
          const items = await Item.find({ _id: { $in: cartItems } }).populate('creator.id');
          const creatorCredits = {};
          const creatorItems = {}; // Track items per creator for notifications
          
          for (const item of items) {
            if (item.creator && item.creator.id) {
              const itemPrice = item.priceUSD || 0;
              const creatorEarnings = itemPrice * 0.8;
              // Extract creator ID - handle both populated objects and ObjectIds
              // If populated, item.creator.id is a User document with _id property
              // If not populated, item.creator.id is an ObjectId
              const creatorId = (item.creator.id._id || item.creator.id).toString();
              
              if (!creatorCredits[creatorId]) {
                creatorCredits[creatorId] = 0;
                creatorItems[creatorId] = [];
              }
              creatorCredits[creatorId] += creatorEarnings;
              creatorItems[creatorId].push(item);
            }
          }
          
          // Update each creator's balance and send notifications
          for (const [creatorId, earnings] of Object.entries(creatorCredits)) {
            await User.findByIdAndUpdate(
              creatorId,
              { $inc: { balance: earnings } }
            );
            console.log(`Credited $${earnings} to creator ${creatorId} for cart purchase`);
            
            // Send notification email to item owner
            try {
              const creator = await User.findById(creatorId).select('email firstName lastName');
              if (creator && creator.email && creatorItems[creatorId] && creatorItems[creatorId].length > 0) {
                // For cart purchases, notify about all items purchased from this creator
                const itemsList = creatorItems[creatorId].map(i => i.title).join(', ');
                await emailService.sendItemOwnerPurchaseNotification({
                  itemTitle: creatorItems[creatorId].length === 1 
                    ? creatorItems[creatorId][0].title 
                    : `${creatorItems[creatorId].length} items from your store`,
                  itemType: 'cart',
                  amount: earnings / 0.8, // Total purchase amount (earnings / 0.8)
                  currency: currency || 'USD',
                  earnings: earnings,
                  paymentMethod: 'Stripe',
                  buyerName: `${req.user.firstName} ${req.user.lastName}`,
                  buyerEmail: req.user.email,
                  ownerEmail: creator.email,
                  transactionId: sessionId,
                  itemsList: itemsList
                });
              }
            } catch (emailError) {
              console.error('Error sending item owner purchase notification:', emailError);
              // Don't fail the transaction if email fails
            }
          }
        } catch (creditError) {
          console.error('Error crediting creator accounts for cart purchase:', creditError);
          // Don't fail the transaction if credit fails
        }
      }

      res.json({ 
        success: true, 
        message: 'Cart purchase payment completed',
        itemType: 'cart-purchase',
        cartItems,
        totalItems: cartItems.length
      });
    } else if (isItemPurchase) {
      // Log successful item purchase
      try {
        await LogService.logPurchase(req.user._id, itemId, transaction._id, {
          itemName: itemName || 'Store Item',
          amount: amount,
          paymentMethod: 'stripe',
          signature: sessionId,
          currency: currency
        });
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }

      // Send admin notification email
      try {
        await emailService.sendAdminPaymentNotification({
          amount: amount,
          currency: currency,
          userName: `${req.user.firstName} ${req.user.lastName}`,
          userEmail: req.user.email,
          itemName: itemName || 'Store Item',
          paymentMethod: 'Stripe',
          transactionId: sessionId
        });
      } catch (emailError) {
        console.error('Error sending admin payment notification:', emailError);
      }

      let item;
      try {
        item = await Item.findById(itemId).populate('creator.id');
      } catch (error) {
        console.error('Error finding item:', error);
      }

      if (item) {
        // Credit 80% of purchase price to creator's account
        if (item.creator && item.creator.id) {
          try {
            const creatorEarnings = amount * 0.8;
            // Extract creator ID - handle both populated objects and ObjectIds
            const creatorId = (item.creator.id._id || item.creator.id).toString();
            await User.findByIdAndUpdate(
              creatorId,
              { $inc: { balance: creatorEarnings } }
            );
            console.log(`Credited $${creatorEarnings} to creator ${creatorId} for item purchase`);
            
            // Send notification email to item owner
            try {
              const creator = await User.findById(creatorId).select('email firstName lastName');
              if (creator && creator.email) {
                await emailService.sendItemOwnerPurchaseNotification({
                  itemTitle: item.title || itemName || 'Store Item',
                  itemType: item.type || 'item',
                  amount: amount,
                  currency: currency || 'USD',
                  earnings: creatorEarnings,
                  paymentMethod: 'Stripe',
                  buyerName: `${req.user.firstName} ${req.user.lastName}`,
                  buyerEmail: req.user.email,
                  ownerEmail: creator.email,
                  transactionId: sessionId
                });
              }
            } catch (emailError) {
              console.error('Error sending item owner purchase notification:', emailError);
              // Don't fail the transaction if email fails
            }
          } catch (creditError) {
            console.error('Error crediting creator account:', creditError);
            // Don't fail the transaction if credit fails
          }
        }

        try {
          let key;
          if (item.downloadAssets.includes(process.env.DO_SPACES_ITEMS_BUCKET_URL)) {
            // Extract key from full URL
            const urlParts = item.downloadAssets.split(`${process.env.DO_SPACES_ITEMS_BUCKET_URL}/`);
            key = urlParts[1];
          } else {
            // Assume it's already a key
            key = item.downloadAssets;
          }
          const downloadUrl = await DigitalOceanSpacesService.getSignedUrl(key, 60);

          res.json({ 
            success: true, 
            message: 'Item purchase payment completed',
            itemType: 'item-purchase',
            itemId: itemId,
            itemName: itemName,
            downloadUrl
          });
        } catch (error) {
          console.error('Error getting signed url:', error);
          res.status(500).json({ error: 'Failed to get signed url' });
        }
      }
      else {
        res.status(400).json({ error: 'Item not found' });
      }
    } else {
      // Unknown item type
      console.log(`Unknown payment type for user ${req.user._id}, sessionId: ${sessionId}, amount: ${amount}`);
      res.status(400).json({ error: 'Unknown payment type' });
    }
  } catch (error) {
    console.error('Payment success error:', error);
    res.status(500).json({ error: 'Failed to update payment status' });
  }
});

// Background processing function for new world creation
async function processNewWorldCreation(sessionId, userId, transactionId, amount, currency, itemName, settings, snapshotId = null) {
  try {
    console.log(`Starting background processing for new world creation: ${sessionId}`);
    
    // Check if user already has 3 worlds
    const userDropletCount = await dropletService.countUserDroplets(userId);
    if (userDropletCount >= 3) {
      throw new Error('User already has the maximum allowed number of worlds (3)');
    }
    
    let dropletId, dropletName = sessionId.slice(-6).toLowerCase();
    
    // Use provided snapshotId or default to settings.defaultSnapshotId
    const imageToUse = snapshotId || settings.defaultSnapshotId;
    console.log(`Creating droplet with snapshot ID: ${imageToUse} (${snapshotId ? 'user selected' : 'default'})`);
    
    // Get source domain from snapshot if using a user snapshot
    let sourceDomain = null;
    if (snapshotId) {
      try {
        const snapshot = await Snapshot.findOne({ snapshotId: snapshotId });
        if (snapshot && snapshot.sourceDomain) {
          sourceDomain = snapshot.sourceDomain;
          console.log(`Retrieved source domain from snapshot: ${sourceDomain}`);
        }
      } catch (error) {
        console.warn(`Failed to get source domain from snapshot: ${error.message}`);
      }
    }
    
    // Create droplet
    const result = await digitalOceanService.createNewDroplet({
      name: dropletName,
      image: imageToUse
    });

    if (!result.droplet || !result.droplet.id) {
      throw new Error('Failed to create droplet');
    }
    dropletId = result.droplet.id;

    // Save droplet information to database
    let droplet;
    try {
      droplet = await dropletService.createDroplet({
        dropletId: result.droplet.id,
        name: result.droplet.name,
        sizeSlug: result.droplet.size_slug,
        regionSlug: result.droplet.region.slug,
        status: result.droplet.status,
        createdAt: new Date(result.droplet.created_at),
        user: userId,
        transaction: transactionId,
        memory: result.droplet.memory,
        vcpus: result.droplet.vcpus,
        disk: result.droplet.disk,
        priceMonthly: result.droplet.size.price_monthly,
        tags: result.droplet.tags || [],
        subdomain: dropletName
      });
    } catch (error) {
      console.error('Error saving droplet to database:', error.message);
    }

    // Assign subdomain
    await digitalOceanService.assignSubdomain(dropletId, settings.defaultDnsDomain, dropletName);
    
    // Log subdomain assignment
    try {
      await LogService.logSubdomainAssigned(userId, {
        subdomain: dropletName,
        dropletId: dropletId
      });
    } catch (logError) {
      console.error('Error logging subdomain assignment:', logError);
    }

    // Power on droplet and complete setup workflow
    try {
      console.log(`Starting complete droplet setup workflow for ${dropletId}`);
      
      // Wait for setup to complete
      const result = await digitalOceanService.completeDropletSetup(dropletId, dropletName, sourceDomain);
      
      if (result.success) {
        console.log(`Complete droplet setup workflow completed successfully for droplet ${dropletId}`);
      } else {
        console.log(`Complete droplet setup workflow completed with warnings for droplet ${dropletId}: ${result.message}`);
      }
        
    } catch (setupError) {
      console.error(`Complete droplet setup workflow failed for droplet ${dropletId}:`, setupError.message);
      // Log the setup error but don't fail the entire process
      LogService.logError({
        message: 'Complete droplet setup workflow failed',
        error: setupError.message,
        context: 'droplet_complete_setup',
        userId: userId
      }).catch(logError => console.error('Error logging setup error:', logError));
    }
    
    console.log(`Background processing completed for new world creation: ${sessionId}`);
    
    // Send completion email to user
    try {
      const user = await User.findById(userId);
      if (user) {
        await emailService.sendDropletCreatedNotification(user.email, {
          dropletName: dropletName,
          domain: `${dropletName}.${settings.defaultDnsDomain}`,
          firstName: user.firstName
        });
      }
    } catch (emailError) {
      console.error('Error sending droplet created notification:', emailError);
    }
    
    // Emit webhook event for frontend
    webhookService.emitWebhookEvent(userId, 'new-world-created', {
      sessionId,
      dropletId,
      domain: `${dropletName}.${settings.defaultDnsDomain}`,
      status: 'completed'
    });
    
  } catch (error) {
    console.error('Background processing error for new world creation:', error);
    
    // Log error
    try {
      await LogService.logError({
        message: 'Failed to create droplet in background',
        error: error.message,
        context: 'background_droplet_creation',
        userId: userId
      });
    } catch (logError) {
      console.error('Error logging error:', logError);
    }
    
    // Emit webhook event for frontend with error
    webhookService.emitWebhookEvent(userId, 'new-world-creation-failed', {
      sessionId,
      error: error.message,
      status: 'failed'
    });
  }
}





export default router; 