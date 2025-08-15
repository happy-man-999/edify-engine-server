import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import SignupProgress from '../models/SignupProgress.js';
import { authenticateToken } from '../middleware/auth.js';
import LogService from '../services/logService.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import Settings from '../models/Settings.js';

dotenv.config();

const router = express.Router();
const transactionService = new TransactionService();
const dropletService = new DropletService();

let stripe = null;
let lastStripeKey = null;

// Initialize Stripe with settings from MongoDB
const initializeStripe = async () => {
  try {
    const settings = await Settings.getSettings();
    
    // Check if we should use test mode based on settings
    const isTestMode = settings.isTestMode || settings.stripeMode === 'test';
    
    if (settings.stripeSecretKey && settings.stripeSecretKey !== lastStripeKey) {
      let secretKey = settings.stripeSecretKey;
      
      // If test mode is enabled, ensure we're using test keys
      if (isTestMode) {
        if (secretKey.startsWith('sk_live_')) {
          // Convert live key to test key format
          secretKey = secretKey.replace('sk_live_', 'sk_test_');
        }
        // If it's already a test key, use it as is
      } else {
        // Live mode - ensure we're using live keys
        if (secretKey.startsWith('sk_test_')) {
          // Convert test key to live key format
          secretKey = secretKey.replace('sk_test_', 'sk_live_');
        }
        // If it's already a live key, use it as is
      }
      
      stripe = new Stripe(secretKey);
      lastStripeKey = secretKey;
      
      console.log(`Stripe initialized in ${isTestMode ? 'TEST' : 'LIVE'} mode`);
      console.log(`Using key: ${secretKey.substring(0, 10)}...`);
    } else if (!settings.stripeSecretKey) {
      console.log('Stripe secret key not found in settings. Payment functionality will be disabled.');
    }
  } catch (error) {
    console.error('Error initializing Stripe from settings:', error);
  }
};

// Check and refresh Stripe instance if needed
const ensureStripeInitialized = async () => {
  try {    
    // Test database connection first
    try {
      const settings = await Settings.getSettings();
      
      // Check if we need to refresh based on test mode or key changes
      const isTestMode = settings.isTestMode || settings.stripeMode === 'test';
      const currentTestMode = lastStripeKey ? lastStripeKey.startsWith('sk_test_') : false;
      
      if (settings.stripeSecretKey !== lastStripeKey || isTestMode !== currentTestMode) {
        console.log('Stripe settings changed, refreshing instance...');
        await initializeStripe();
      }
    } catch (dbError) {
      console.error('Database error when fetching settings:', dbError);
      // If database fails, we can't initialize Stripe, but don't crash the route
    }
  } catch (error) {
    console.error('Error ensuring Stripe is initialized:', error);
    // Don't throw the error, just log it and continue
    // This allows the route to fall back to mock mode
  }
};

// Initialize Stripe on module load
initializeStripe();

// Test endpoint to verify the route is working
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Stripe route is working',
    timestamp: new Date().toISOString(),
    stripeConfigured: !!stripe
  });
});

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd' } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Ensure Stripe is initialized with latest settings
    await ensureStripeInitialized();

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
    const { amount, currency = 'usd', success_url, cancel_url, itemName, itemId } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // Ensure Stripe is initialized with latest settings
    try {
      await ensureStripeInitialized();
    } catch (stripeInitError) {
      console.error('Error ensuring Stripe initialization:', stripeInitError);
    }

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
        itemId: itemId || 'unknown'
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

// Webhook endpoint for handling Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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

    const processedTransaction = await transactionService.getTransactionBySignature(sessionId)
    if (processedTransaction) {
      return res.status(400).json({ error: 'Transaction already processed' });
    }

    if (process.env.NODE_ENV === 'development') {
      if (tempHeap[sessionId]) {
        return res.status(200).json({ success: true });
      }
      tempHeap[sessionId] = true;
    }

    // Ensure Stripe is initialized with latest settings
    await ensureStripeInitialized();

    // Retrieve the session from Stripe
    let session;
    try {
      if (stripe) {
        session = await stripe.checkout.sessions.retrieve(sessionId);
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
    const itemName = sessionMetadata?.itemName;
    const amount = session.amount_total / 100; // Convert from cents to dollars
    const currency = session.currency?.toUpperCase() || 'USD';
    
    // Create transaction record first
    let transaction;
    try {
      transaction = await transactionService.createTransaction({
        signature: sessionId,
        user: req.user._id,
        amount: amount,
        paymentMethod: 'stripe',
        status: 'success',
        date: new Date(),
        item: null, // Will be set based on item type
        itemType: itemId === 'new-world' ? 'new-world' : 
                 itemId === 'premium-plan' ? 'premium-plan' : 
                 itemId && itemId !== 'unknown' ? 'item-purchase' : 'other'
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      return res.status(500).json({ error: 'Failed to create transaction record' });
    }

    // Handle different payment types based on itemId
    if (itemId === 'premium-plan') {
      // Handle premium plan signup payment
      const progress = await SignupProgress.findOne({ userId: req.user._id });
      
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
        
        // Log successful premium plan payment
        try {
          await LogService.logPurchase(req.user._id, null, transaction._id, {
            itemName: 'Edify Engine Premium Plan',
            amount: amount,
            paymentMethod: 'stripe',
            signature: sessionId,
            currency: currency
          });
        } catch (logError) {
          console.error('Error logging purchase:', logError);
        }
        
        res.json({ 
          success: true, 
          message: 'Premium plan payment completed and signup progress updated',
          itemType: 'premium-plan',
          itemName: itemName
        });
      } else {
        res.status(404).json({ error: 'No signup progress found' });
      }
    } else if (itemId === 'new-world') {
      // Handle new world creation payment - similar to Solana route      
      let dropletId;
      // Get settings from MongoDB
      const settings = await Settings.getSettings();

      try {
        
        const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
        const result = await digitalOceanService.createNewDroplet({
          name: sessionId.slice(-6),
          image: settings.defaultSnapshotId
        });

        if (!result.droplet || !result.droplet.id) {
          return res.status(500).json({ error: 'Failed to create droplet' });
        }
        dropletId = result.droplet.id;

        // Save droplet information to database
        let droplet;
        try {
          const subdomain = "new."+sessionId.slice(-6);
          droplet = await dropletService.createDroplet({
            dropletId: result.droplet.id,
            name: result.droplet.name,
            sizeSlug: result.droplet.size_slug,
            regionSlug: result.droplet.region.slug,
            status: result.droplet.status,
            createdAt: new Date(result.droplet.created_at),
            user: req.user._id,
            transaction: transaction._id,
            memory: result.droplet.memory,
            vcpus: result.droplet.vcpus,
            disk: result.droplet.disk,
            priceMonthly: result.droplet.size.price_monthly,
            tags: result.droplet.tags || [],
            subdomain: subdomain
          });
        } catch (error) {
          console.error('Error saving droplet to database:', error.message);
          // Don't fail the entire process if droplet save fails
        }

        // Assign subdomain
        try {
          await digitalOceanService.assignSubdomain(dropletId, settings.defaultDnsDomain, "new."+sessionId.slice(-6));
          
          // Log subdomain assignment
          try {
            await LogService.logSubdomainAssigned(req.user._id, {
              subdomain: "new."+sessionId.slice(-6),
              dropletId: dropletId
            });
          } catch (logError) {
            console.error('Error logging subdomain assignment:', logError);
          }
        } catch (error) {
          console.error('Error assigning subdomain:', error.message);
          return res.status(500).json({ error: 'Failed to assign subdomain' });
        }

        // Power on droplet
        try {
          await digitalOceanService.powerOnDroplet(dropletId);
        } catch (error) {
          console.error('Error running droplet:', error.message);
          return res.status(500).json({ error: 'Failed to run droplet' });
        }
        
      } catch (error) {
        console.error('Error creating droplet:', error.message);
        // Log error
        try {
          await LogService.logError({
            message: 'Failed to create droplet',
            error: error.message,
            context: 'droplet_creation',
            userId: req.user._id
          });
        } catch (logError) {
          console.error('Error logging error:', logError);
        }
        return res.status(500).json({ error: 'Failed to create droplet' });
      }
      
      // Log successful new world payment
      try {
        await LogService.logPurchase(req.user._id, null, transaction._id, {
          itemName: 'New World Creation',
          amount: amount,
          paymentMethod: 'stripe',
          signature: sessionId,
          currency: currency
        });
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }
      
      res.json({ 
        success: true, 
        message: 'New world creation payment completed and droplet created',
        itemType: 'new-world',
        itemName: itemName,
        dropletId: dropletId,
        domain: `new.${sessionId.slice(-6)}.${settings.defaultDnsDomain}`
      });
    } else if (itemId && itemId !== 'unknown') {
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
      
      res.json({ 
        success: true, 
        message: 'Item purchase payment completed',
        itemType: 'item-purchase',
        itemId: itemId,
        itemName: itemName
      });
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

export default router; 