import { Router } from 'express';
import SolanaService from '../services/solanaService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import LogService from '../services/logService.js';
import Settings from '../models/Settings.js';
import jwt from 'jsonwebtoken';
import settingsRefreshService from '../services/settingsRefreshService.js';

const transactionService = new TransactionService();
const dropletService = new DropletService();

const router = Router();

// Test endpoint to verify route is accessible
router.get('/test', (req, res) => {
  res.json({ message: 'Solana route is working', timestamp: new Date().toISOString() });
});

router.post('/payment-success', async (req, res) => {
  try {
    const { signature } = req.body;
    if (!signature) {
      return res.status(400).json({ error: 'Signature is required' });
    }

    const processedTransaction = await transactionService.getTransactionBySignature(signature)
    if (processedTransaction) {
      return res.status(400).json({ message: 'Transaction already processed' });
    }

    let txInfo;
    try {
      const solanaService = new SolanaService();
      // Register this service instance for auto-refresh
      settingsRefreshService.registerSolanaService(`payment-${Date.now()}`, solanaService);
      txInfo = await solanaService.getTransactionInfo(signature);
    } catch (error) {
      console.error('Error fetching transaction info:', error.message);
      // Log error
      try {
        await LogService.logError({
          message: 'Failed to fetch transaction info',
          error: error.message,
          context: 'solana_transaction_processing',
          userId: null
        });
      } catch (logError) {
        console.error('Error logging error:', logError);
      }
      return res.status(500).json({ error: 'Failed to fetch transaction info' });
    }

    // Determine if this is a new-world creation or item purchase
    const isNewWorld = txInfo.itemId === 'new-world';
    const isItemPurchase = txInfo.itemId && !isNewWorld && txInfo.itemId !== 'basic-plan' && txInfo.itemId !== 'advanced-plan';

    // Validate required data
    if (!txInfo.userId) {
      console.error('Missing userId from transaction info');
      return res.status(500).json({ error: 'Invalid transaction data - missing userId' });
    }

    if (!txInfo.amount || txInfo.amount <= 0) {
      console.error('Invalid amount from transaction info:', txInfo.amount);
      return res.status(500).json({ error: 'Invalid transaction data - invalid amount' });
    }

    // Save transaction to MongoDB using transaction service
    let transaction;
    try {
      transaction = await transactionService.createTransaction({
        signature: signature,
        user: txInfo.userId,
        amount: txInfo.amount,
        paymentMethod: 'solana',
        status: 'success',
        date: new Date(),
        item: isItemPurchase ? txInfo.itemId : null, // null for new-world, itemId for purchases
        itemType: isNewWorld ? 'new-world' : 
                 isItemPurchase ? 'item-purchase' : 'other'
      });
      
      // Log purchase - handle special cases for new-world and other non-item purchases
      try {
        if (isNewWorld) {
          // For new-world creation, log without itemId since it's not a store item
          await LogService.createLog({
            level: 'success',
            type: 'purchase',
            message: `User purchased new world creation`,
            details: {
              itemName: 'New World Creation',
              amount: txInfo.amount,
              paymentMethod: 'solana',
              signature: signature
            },
            status: 'completed',
            userId: txInfo.userId,
            transactionId: transaction._id,
            metadata: {
              currency: 'SOL',
              itemType: 'new-world'
            }
          });
        } else if (isItemPurchase) {
          // For actual item purchases, use the standard logPurchase method
          await LogService.logPurchase(txInfo.userId, txInfo.itemId, transaction._id, {
            itemName: txInfo.itemName || 'Unknown Item',
            amount: txInfo.amount,
            paymentMethod: 'solana',
            signature: signature,
            currency: 'SOL'
          });
        } else {
          // For other types (like plans)
          await LogService.createLog({
            level: 'success',
            type: 'purchase',
            message: `User completed transaction: ${txInfo.itemName || 'Unknown'}`,
            details: {
              itemName: txInfo.itemName || 'Unknown Item',
              amount: txInfo.amount,
              paymentMethod: 'solana',
              signature: signature
            },
            status: 'completed',
            userId: txInfo.userId,
            transactionId: transaction._id,
            metadata: {
              currency: 'SOL',
              itemType: txInfo.itemId || 'other'
            }
          });
        }
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }
    } catch (error) {
      console.error('Error saving transaction to database:', error.message);
      return res.status(500).json({ error: 'Failed to save transaction' });
    }

    // Handle new-world creation (clone droplet) - return immediately and process in background
    if (isNewWorld) {
      // Check if user already has 3 worlds before starting background processing
      const userDropletCount = await dropletService.countUserDroplets(txInfo.userId);
      if (userDropletCount >= 3) {
        return res.status(400).json({ 
          error: 'World creation limit reached',
          message: 'You have already reached the maximum limit of 3 worlds. Please delete an existing world before creating a new one.',
          itemType: 'new-world',
          limitReached: true
        });
      }
      
      // Start background processing
      processNewWorldCreation(signature, txInfo.userId, transaction._id, txInfo.amount, txInfo.itemName);
      
      return res.status(200).json({ 
        message: 'Payment confirmed! Your new world is being created in the background.',
        itemType: 'new-world',
        processing: true,
        transactionId: transaction._id
      });
    } else if (isItemPurchase) {
      // Handle item purchase - no droplet creation needed
      return res.status(200).json({ 
        message: 'Item purchase transaction processed successfully',
        itemType: 'item-purchase',
        itemId: txInfo.itemId
      });
    } else {
      // Handle plan or other types
      return res.status(200).json({ 
        message: 'Transaction processed successfully',
        itemType: 'other'
      });
    }
  } catch (error) {
    console.error('Unexpected error in Solana payment success:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Background processing function for new world creation
async function processNewWorldCreation(signature, userId, transactionId, amount, itemName) {
  try {
    console.log(`Starting background processing for new world creation: ${signature}`);
    
    // Check if user already has 3 worlds
    const userDropletCount = await dropletService.countUserDroplets(userId);
    if (userDropletCount >= 3) {
      throw new Error('User already has the maximum allowed number of worlds (3)');
    }
    
    let dropletId;
    
    // Get settings from MongoDB
    const settings = await Settings.getSettings();
    
    // Validate snapshot ID
    if (!settings.defaultSnapshotId || isNaN(settings.defaultSnapshotId) || settings.defaultSnapshotId <= 0) {
      throw new Error('Invalid snapshot configuration');
    }
    
    // Check if DigitalOcean token is available
    if (!process.env.DIGITAL_OCEAN_TOKEN) {
      throw new Error('DigitalOcean service not configured');
    }
    
    const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
    
    // Validate droplet name format (DigitalOcean requirements)
    const dropletName = signature.slice(0, 6);
    if (!dropletName || dropletName.length < 3) {
      throw new Error('Invalid droplet name format');
    }
    
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
      const subdomain = "new."+signature.slice(0, 6);
      droplet = await dropletService.createDroplet({
        dropletId: result.droplet.id,
        name: result.droplet.name,
        sizeSlug: result.droplet.size_slug,
        regionSlug: result.droplet.region.slug,
        status: result.droplet.status,
        createdAt: new Date(result.droplet.created_at),
        user: userId,
        transaction: transactionId, // Save reference to the transaction
        memory: result.droplet.memory,
        vcpus: result.droplet.vcpus,
        disk: result.droplet.disk,
        priceMonthly: result.droplet.size.price_monthly,
        tags: result.droplet.tags || [],
        subdomain: subdomain
      });
      
      // Log droplet creation
      try {
        await LogService.logDropletCreated(userId, result.droplet.id, {
          name: result.droplet.name,
          sizeSlug: result.droplet.size_slug,
          regionSlug: result.droplet.region.slug,
          ipAddress: result.droplet.networks?.v4?.[0]?.ip_address,
          memory: result.droplet.memory,
          vcpus: result.droplet.vcpus,
          disk: result.droplet.disk
        });
      } catch (logError) {
        console.error('Error logging droplet creation:', logError);
      }
    } catch (error) {
      console.error('Error saving droplet to database:', error.message);
      // Don't fail the entire process if droplet save fails
    }

    // Assign subdomain
    try {
      await digitalOceanService.assignSubdomain(dropletId, settings.defaultDnsDomain, "new."+signature.slice(0, 6));
      
      // Log subdomain assignment
      try {
        await LogService.logSubdomainAssigned(userId, {
          subdomain: "new."+signature.slice(0, 6),
          dropletId: dropletId
        });
      } catch (logError) {
        console.error('Error logging subdomain assignment:', logError);
      }
    } catch (error) {
      console.error('Error assigning subdomain:', error.message);
      throw new Error('Failed to assign subdomain');
    }

    // Power on droplet
    try {
      await digitalOceanService.powerOnDroplet(dropletId);
    } catch (error) {
      console.error('Error running droplet:', error.message);
      throw new Error('Failed to run droplet');
    }

    console.log(`Background processing completed for new world creation: ${signature}`);
    
    // Emit webhook event for frontend
    emitWebhookEvent(userId, 'new-world-created', {
      signature,
      dropletId,
      domain: `new.${signature.slice(0, 6)}.${settings.defaultDnsDomain}`,
      status: 'completed'
    });
    
  } catch (error) {
    console.error('Background processing error for new world creation:', error);
    
    // Log specific DigitalOcean API errors
    if (error.response) {
      console.error('DigitalOcean API error details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
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
      signature,
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