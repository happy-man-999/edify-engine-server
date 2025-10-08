import { Router } from 'express';
import SolanaService from '../services/solanaService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import DigitalOceanSpacesService from '../services/digitalOceanSpacesService.js';
import LogService from '../services/logService.js';
import emailService from '../services/emailService.js';
import settingsRefreshService from '../services/settingsRefreshService.js';
import webhookService from '../services/webhookService.js';
import Settings from '../models/Settings.js';
import jwt from 'jsonwebtoken';
import Item from '../models/Item.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const transactionService = new TransactionService();
const dropletService = new DropletService();
const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN, process.env.DIGITAL_OCEAN_SSH_KEY_ID);

const router = Router();

// Test endpoint to verify route is accessible
router.get('/test', (req, res) => {
  res.json({ message: 'Solana route is working', timestamp: new Date().toISOString() });
});

// Get SOL price from Binance US API
router.get('/sol-price', async (req, res) => {
  try {
    const response = await fetch('https://api.binance.us/api/v3/ticker/price?symbol=SOLUSDT');
    
    if (!response.ok) {
      throw new Error('Failed to fetch SOL price from Binance US');
    }
    
    const data = await response.json();
    
    if (!data.price) {
      throw new Error('Invalid response format from Binance US');
    }
    
    res.json({
      success: true,
      price: parseFloat(data.price),
      currency: 'USD',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch SOL price',
      message: error.message
    });
  }
});

router.post('/payment-success', async (req, res) => {
  try {
    const { signature, metadata } = req.body;
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

    const cartItemsString = metadata?.cartItems;
    const itemNamesString = metadata?.itemNames;

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

    // Determine if this is a new-world creation, item purchase, or cart purchase
    const isNewWorld = txInfo.itemId === 'new-world';
    const isCartPurchase = txInfo.itemId === 'cart-purchase';
    const isItemPurchase = txInfo.itemId && !isNewWorld && !isCartPurchase && txInfo.itemId !== 'basic-plan' && txInfo.itemId !== 'premium-plan';

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
        item: isItemPurchase ? txInfo.itemId : null,
        itemType: isNewWorld ? 'new-world' : 
                 isItemPurchase ? 'item-purchase' :
                 isCartPurchase ? 'cart-purchase' : 'other',
        cartItems
      });
    } catch (error) {
      console.error('Error saving transaction to database:', error.message);
      return res.status(500).json({ error: 'Failed to save transaction' });
    }

    // Handle new-world creation (clone droplet) - return immediately and process in background
    if (isNewWorld) {
      try {
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
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }

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
      try {
        // For actual item purchases, use the standard logPurchase method
        await LogService.logPurchase(txInfo.userId, txInfo.itemId, transaction._id, {
          itemName: txInfo.itemName || 'Unknown Item',
          amount: txInfo.amount,
          paymentMethod: 'solana',
          signature: signature,
          currency: 'SOL'
        });
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }

      // Send admin notification email
      try {
        const user = await import('../models/User.js').then(m => m.default.findById(txInfo.userId));
        if (user) {
          await emailService.sendAdminPaymentNotification({
            amount: txInfo.amount,
            currency: 'SOL',
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            itemName: txInfo.itemName || 'Unknown Item',
            paymentMethod: 'Solana',
            transactionId: signature
          });
        }
      } catch (emailError) {
        console.error('Error sending admin payment notification:', emailError);
      }

      let item;
      try {
        item = await Item.findById(txInfo.itemId);
      } catch (error) {
        console.error('Error finding item:', error);
      }

      if (item) {
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

          return res.status(200).json({ 
            success: true, 
            message: 'Item purchase transaction processed successfully',
            itemType: 'item-purchase',
            itemId: txInfo.itemId,
            itemName: txInfo.itemName,
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
    } else if (isCartPurchase) {
      try {
        // For actual item purchases, use the standard logPurchase method
        await LogService.logPurchase(txInfo.userId, txInfo.itemId, transaction._id, {
          itemName: itemNames.join(', ') || 'Cart Items',
          amount: txInfo.amount,
          paymentMethod: 'solana',
          signature: signature,
          currency: 'SOL'
        });
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }

      // Send admin notification email
      try {
        const user = await import('../models/User.js').then(m => m.default.findById(txInfo.userId));
        if (user) {
          await emailService.sendAdminPaymentNotification({
            amount: txInfo.amount,
            currency: 'SOL',
            userName: `${user.firstName} ${user.lastName}`,
            userEmail: user.email,
            itemName: itemNames.join(', ') || 'Cart Items',
            paymentMethod: 'Solana',
            transactionId: signature
          });
        }
      } catch (emailError) {
        console.error('Error sending admin payment notification:', emailError);
      }

      return res.status(200).json({
        success: true, 
        message: 'Cart purchase transaction processed successfully',
        itemType: 'cart-purchase',
        cartItems,
        totalItems: cartItems.length
      });
    } else {
      try {
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
      } catch (logError) {
        console.error('Error logging purchase:', logError);
      }

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
    
    // Validate droplet name format (DigitalOcean requirements)
    const dropletName = signature.slice(0, 6).toLowerCase();
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
        subdomain: dropletName
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
    } catch (error) {
      console.error('Error assigning subdomain:', error.message);
      throw new Error('Failed to assign subdomain');
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
      throw new Error('Failed to start droplet setup workflow');
    }

    console.log(`Background processing completed for new world creation: ${signature}`);
    
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
      signature,
      dropletId,
      domain: `${dropletName}.${settings.defaultDnsDomain}`,
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
    webhookService.emitWebhookEvent(userId, 'new-world-creation-failed', {
      signature,
      error: error.message,
      status: 'failed'
    });
  }
}


export default router;