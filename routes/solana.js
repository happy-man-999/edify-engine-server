import { Router } from 'express';
import SolanaService from '../services/solanaService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import LogService from '../services/logService.js';
import Settings from '../models/Settings.js';

const transactionService = new TransactionService();
const dropletService = new DropletService();

const router = Router();

// Test endpoint to verify route is accessible
router.get('/test', (req, res) => {
  res.json({ message: 'Solana route is working', timestamp: new Date().toISOString() });
});

router.post('/payment-success', async (req, res) => {
  const { signature } = req.body;
  if (signature) {
    const processedTransaction = await transactionService.getTransactionBySignature(signature)
    if (processedTransaction) {
      return res.status(400).json({ message: 'Transaction already processed' });
    }

    let txInfo;
    try {
      const solanaService = new SolanaService();
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
    const isItemPurchase = txInfo.itemId && txInfo.itemId !== 'new-world' && txInfo.itemId !== 'premium-plan';

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
                 isItemPurchase ? 'item-purchase' : 'other'
      });
      
      // Log purchase
      try {
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
    } catch (error) {
      console.error('Error saving transaction to database:', error.message);
      return res.status(500).json({ error: 'Failed to save transaction' });
    }

    // Handle new-world creation (clone droplet)
    if (isNewWorld) {
      let dropletId;
      
      try {
        // Get settings from MongoDB
        const settings = await Settings.getSettings();
        console.log('Settings retrieved:', { 
          defaultSnapshotId: settings.defaultSnapshotId, 
          defaultDnsDomain: settings.defaultDnsDomain 
        });
        
        // Validate snapshot ID
        if (!settings.defaultSnapshotId || isNaN(settings.defaultSnapshotId) || settings.defaultSnapshotId <= 0) {
          console.error('Invalid snapshot ID in settings:', settings.defaultSnapshotId);
          return res.status(500).json({ error: 'Invalid snapshot configuration' });
        }
        
        // Check if DigitalOcean token is available
        if (!process.env.DIGITAL_OCEAN_TOKEN) {
          console.error('DigitalOcean token not found in environment variables');
          return res.status(500).json({ error: 'DigitalOcean service not configured' });
        }
        
        const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN);
        
        // Log droplet creation attempt
        console.log('Attempting to create droplet with config:', {
          name: signature.slice(0, 6),
          image: settings.defaultSnapshotId,
          token: process.env.DIGITAL_OCEAN_TOKEN ? '***' : 'missing'
        });
        
        // Validate droplet name format (DigitalOcean requirements)
        const dropletName = signature.slice(0, 6);
        if (!dropletName || dropletName.length < 3) {
          console.error('Invalid droplet name generated:', dropletName);
          return res.status(500).json({ error: 'Invalid droplet name format' });
        }
        
        const result = await digitalOceanService.createNewDroplet({
          name: dropletName,
          image: settings.defaultSnapshotId
        });

        console.log('Droplet creation result:', result);

        if (!result.droplet || !result.droplet.id) {
          console.error('Droplet creation failed - no droplet ID returned:', result);
          return res.status(500).json({ error: 'Failed to create droplet' });
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
            user: txInfo.userId,
            transaction: transaction._id, // Save reference to the transaction
            memory: result.droplet.memory,
            vcpus: result.droplet.vcpus,
            disk: result.droplet.disk,
            priceMonthly: result.droplet.size.price_monthly,
            tags: result.droplet.tags || []
          });
          
          // Log droplet creation
          try {
            await LogService.logDropletCreated(txInfo.userId, result.droplet.id, {
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
            await LogService.logSubdomainAssigned(txInfo.userId, {
              subdomain: "new."+signature.slice(0, 6),
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

        return res.status(200).json({ 
          message: 'New world transaction processed successfully and droplet created',
          itemType: 'new-world',
          dropletId: dropletId,
          domain: `new.${signature.slice(0, 6)}.${settings.defaultDnsDomain}`
        });
      } catch (error) {
        console.error('Error creating droplet:', error.message);
        
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
            message: 'Failed to create droplet',
            error: error.message,
            context: 'droplet_creation',
            userId: txInfo.userId
          });
        } catch (logError) {
          console.error('Error logging error:', logError);
        }
        return res.status(500).json({ error: 'Failed to create droplet' });
      }
    } else if (isItemPurchase) {
      // Handle item purchase - no droplet creation needed
      return res.status(200).json({ 
        message: 'Item purchase transaction processed successfully',
        itemType: 'item-purchase',
        itemId: txInfo.itemId
      });
    } else {
      // Handle premium plan or other types
      return res.status(200).json({ 
        message: 'Transaction processed successfully',
        itemType: 'other'
      });
    }
  } else {
    return res.status(400).json({ error: 'Signature is required' });
  }
});

export default router;