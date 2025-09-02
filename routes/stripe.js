import express from 'express';
import SignupProgress from '../models/SignupProgress.js';
import { authenticateToken } from '../middleware/auth.js';
import LogService from '../services/logService.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import Settings from '../models/Settings.js';
import jwt from 'jsonwebtoken';
import stripeService from '../services/stripeService.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

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
    const { amount, currency = 'usd', success_url, cancel_url, itemName, itemId } = req.body;

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

    let priceId = process.env.STRIPE_BASIC_PRICE_ID; // Default to basic plan
    if (itemId === 'premium-plan') {
      priceId = process.env.STRIPE_PREMIUM_PRICE_ID;
    }
    else if (itemId === 'custom-domain') {
      priceId = process.env.STRIPE_CUSTOM_DOMAIN_PRICE_ID;
    }

    // Create a Checkout Session with metadata
    const session = await stripe.checkout.sessions.create({
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

    // Get Stripe instance (will auto-refresh if settings changed)
    const stripe = await stripeService.getStripe();

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
    const customDomain = sessionMetadata?.customDomain;
    const dropletId = sessionMetadata?.dropletId;
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
                 itemId === 'basic-plan' ? 'basic-plan' : 
                 itemId === 'premium-plan' ? 'premium-plan' : 
                 itemId && itemId !== 'unknown' ? 'item-purchase' : 'other'
      });
    } catch (error) {
      console.error('Error creating transaction:', error);
      return res.status(500).json({ error: 'Failed to create transaction record' });
    }

    // Handle different payment types based on itemId
    if (itemId === 'basic-plan' || itemId === 'premium-plan') {
      // Give membership
      await User.findOneAndUpdate(
        { _id: req.user._id },
        { 
          role: 'user', 
          plan: itemId === 'basic-plan' ? 'basic' : 'premium' 
        }
      );
      
      // Handle plan signup payment
      const progress = await SignupProgress.findOne({ userId: req.user._id });
      const planName = itemId === 'basic-plan' ? 'Basic' : 'Premium';
      
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
        
        res.json({ 
          success: true, 
          message: `${planName} plan payment completed and signup progress updated`,
          itemType: itemId,
          itemName: itemName
        });
      } else {
        res.status(404).json({ error: 'No signup progress found' });
      }
    } else if (itemId === 'new-world') {
      // Handle new world creation payment - return immediately and process in background
      
      // Check if user already has 3 worlds before starting background processing
      const userDropletCount = await dropletService.countUserDroplets(req.user._id);
      if (userDropletCount >= 3) {
        return res.status(400).json({ 
          error: 'World creation limit reached',
          message: 'You have already reached the maximum limit of 3 worlds. Please delete an existing world before creating a new one.',
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
      
      // Start background processing
      processNewWorldCreation(sessionId, req.user._id, transaction._id, amount, currency, itemName, settings);
      
      res.json({ 
        success: true, 
        message: 'Payment confirmed! Your new world is being created in the background.',
        itemType: 'new-world',
        itemName: itemName,
        processing: true,
        transactionId: transaction._id
      });
    } else if (itemId === 'custom-domain') {
      // Handle custom domain purchase
      try {        
        if (!customDomain) {
          return res.status(400).json({ error: 'Custom domain is required for custom-domain purchase' });
        }
        
        // Start background processing for custom domain setup
        digitalOceanService.processCustomDomainSetup(sessionId, req.user._id, customDomain, dropletId, dropletService, emitWebhookEvent)
          .then((result) => {
            console.log(`Custom domain setup completed for ${customDomain}:`, result.message);
          })
          .catch((error) => {
            console.error(`Custom domain setup failed for ${customDomain}:`, error.message);
            // Log the error but don't fail the response
            LogService.logError({
              message: 'Custom domain setup failed',
              error: error.message,
              context: 'custom_domain_setup',
              userId: req.user._id
            }).catch(logError => console.error('Error logging custom domain setup error:', logError));
          });
        
        res.json({ 
          success: true, 
          message: 'Custom domain purchase completed! Setup is being processed in the background.',
          itemType: 'custom-domain',
          itemName: 'Custom Domain',
          customDomain: customDomain,
          processing: true,
          transactionId: transaction._id
        });
        
      } catch (error) {
        console.error('Error processing custom domain purchase:', error);
        res.status(500).json({ error: 'Failed to process custom domain purchase' });
      }
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

// Background processing function for new world creation
async function processNewWorldCreation(sessionId, userId, transactionId, amount, currency, itemName, settings) {
  try {
    console.log(`Starting background processing for new world creation: ${sessionId}`);
    
    // Check if user already has 3 worlds
    const userDropletCount = await dropletService.countUserDroplets(userId);
    if (userDropletCount >= 3) {
      throw new Error('User already has the maximum allowed number of worlds (3)');
    }
    
    let dropletId, dropletName = sessionId.slice(-6).toLowerCase();
    
    // Create droplet
    const result = await digitalOceanService.createNewDroplet({
      name: dropletName,
      image: settings.defaultSnapshotId
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
      
      // Run the complete setup workflow in background
      digitalOceanService.completeDropletSetup(dropletId, dropletName)
        .then((result) => {
          if (result.success) {
            console.log(`Complete droplet setup workflow completed successfully for droplet ${dropletId}`);
          } else {
            console.log(`Complete droplet setup workflow completed with warnings for droplet ${dropletId}: ${result.message}`);
          }
        })
        .catch((setupError) => {
          console.error(`Complete droplet setup workflow failed for droplet ${dropletId}:`, setupError.message);
          // Log the setup error but don't fail the entire process
          LogService.logError({
            message: 'Complete droplet setup workflow failed',
            error: setupError.message,
            context: 'droplet_complete_setup',
            userId: userId
          }).catch(logError => console.error('Error logging setup error:', logError));
        });
        
    } catch (error) {
      console.error('Error starting droplet setup workflow:', error.message);
      throw error;
    }
    
    console.log(`Background processing completed for new world creation: ${sessionId}`);
    
    // Emit webhook event for frontend
    emitWebhookEvent(userId, 'new-world-created', {
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
    emitWebhookEvent(userId, 'new-world-creation-failed', {
      sessionId,
      error: error.message,
      status: 'failed'
    });
  }
}




// Webhook event emitter for frontend
const webhookClients = new Map();

function emitWebhookEvent(userId, eventType, data) {
  const client = webhookClients.get(userId);
  if (client) {
    client.write(`data: ${JSON.stringify({ type: eventType, data })}\n\n`);
  }
}

// SSE endpoint for frontend webhooks
router.get('/webhook-stream/:userId', async (req, res) => {
  const { userId } = req.params;
  const { token } = req.query;
  
  // Verify token from query parameter
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  // For development, accept any token
  if (process.env.NODE_ENV === 'development') {
    // Accept any token in development
  } else {
    // In production, verify the JWT token properly
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized access to webhook stream' });
      }
    } catch (jwtError) {
      return res.status(403).json({ error: 'Invalid authorization token' });
    }
  }
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Store client connection
  webhookClients.set(userId, res);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', data: { message: 'Webhook stream connected' } })}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    webhookClients.delete(userId);
    console.log(`Webhook client disconnected for user: ${userId}`);
  });
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping', data: { timestamp: Date.now() } })}\n\n`);
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

export default router; 