import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

let stripe = null;

try {
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  } else {
    console.log('Stripe secret key not found. Payment functionality will be disabled.');
  }
} catch (error) {
  console.log('Failed to initialize Stripe:', error.message);
}

// Create payment intent
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd' } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // If Stripe is not configured, return a mock response for development
    if (!stripe) {
      console.log('Stripe not configured, returning mock payment intent');
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
    const { amount, currency = 'usd', success_url, cancel_url } = req.body;

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    // If Stripe is not configured, return a mock response for development
    if (!stripe) {
      console.log('Stripe not configured, returning mock checkout session');
      return res.json({
        sessionId: 'mock_session_id_for_development',
      });
    }

    // Create a Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency,
            product_data: {
              name: 'Edify Engine Premium Plan',
              description: 'One month of unlimited access to our world engine',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: success_url || `${req.headers.origin}/signup-success`,
      cancel_url: cancel_url || `${req.headers.origin}/signup`,
    });

    res.json({
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Webhook endpoint for handling Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // If Stripe is not configured, return success for development
  if (!stripe) {
    console.log('Stripe not configured, webhook ignored');
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
      console.log('PaymentIntent was successful!', paymentIntent.id);
      // Here you would typically update your database to mark the user as paid
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Payment failed:', failedPayment.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

export default router; 