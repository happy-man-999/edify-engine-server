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
import dotenv from 'dotenv';

dotenv.config();

const dropletService = new DropletService();

const router = express.Router();

// Get droplets for the current authenticated user
router.get('/droplets', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get user's droplets with basic information - return all droplets, not just recent ones
    const droplets = await Droplet.find({ user: userId })
      .select('dropletId name status subdomain createdAt memory vcpus disk priceMonthly')
      .sort({ createdAt: -1 }); // Sort by creation date, newest first
    
    // Format the response
    const formattedDroplets = droplets.map(droplet => ({
      id: droplet._id,
      dropletId: droplet.dropletId,
      name: droplet.name,
      status: droplet.status,
      subdomain: droplet.subdomain,
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

// Sync droplet status from DigitalOcean (only for owned droplets)
router.post('/droplets/:dropletId/sync', authenticateToken, async (req, res) => {
  try {
    const { dropletId } = req.params;
    const userId = req.user._id;
    
    // Verify the droplet belongs to the authenticated user
    const droplet = await Droplet.findOne({ 
      dropletId: parseInt(dropletId), 
      user: userId 
    });
    
    if (!droplet) {
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

export default router; 