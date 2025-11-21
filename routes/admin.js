import express from 'express';

import { requireAdmin } from '../middleware/admin.js';
import { authenticateToken } from '../middleware/auth.js';
import User from '../models/User.js';
import Item from '../models/Item.js';
import Settings from '../models/Settings.js';
import Action from '../models/Action.js';
import Droplet from '../models/Droplet.js';
import Transaction from '../models/Transaction.js';
import DemoEmail from '../models/DemoEmail.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import LogService from '../services/logService.js';
import emailService from '../services/emailService.js';
import settingsRefreshService from '../services/settingsRefreshService.js';
import stripeService from '../services/stripeService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import dotenv from 'dotenv';

dotenv.config();

const transactionService = new TransactionService();
const dropletService = new DropletService();
const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN, process.env.DIGITAL_OCEAN_SSH_KEY_ID);

const router = express.Router();

// Public endpoint for payment settings (no authentication required)
router.get('/payment-settings', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    // Only return payment-related settings for security
    res.json({
      settings: {
        defaultSnapshotId: settings.defaultSnapshotId,
        defaultDnsDomain: settings.defaultDnsDomain,
        stripeMode: settings.stripeMode,
        solanaMode: settings.solanaMode,
        isTestMode: settings.isTestMode,
        solanaWalletAddress: settings.solanaWalletAddress,
        stripePublicKey: settings.stripePublicKey,
        requiredWithdrawAmount: settings.requiredWithdrawAmount,
      }
    });
  } catch (error) {
    console.error('Error fetching payment settings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch payment settings',
      error: error.message 
    });
  }
});

// Apply admin middleware to all other routes
router.use(requireAdmin);

// Error handling middleware for admin routes
const handleAdminError = (error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }
  
  console.error('Admin route error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({ 
      message: 'Validation error',
      error: error.message 
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({ 
      message: 'Invalid data format',
      error: error.message 
    });
  }
  
  if (error.code === 'ERR_HTTP_HEADERS_SENT') {
    console.error('Headers already sent error - skipping response');
    return;
  }
  
  return res.status(500).json({ 
    message: 'Internal server error',
    error: error.message 
  });
};

// Apply error handling middleware to all admin routes
router.use(handleAdminError);

// Test route to verify admin access
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Admin access verified',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

// Get current settings (requires admin authentication)
router.get('/settings', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch settings',
      error: error.message 
    });
  }
});

// Get services status
router.get('/services-status', async (req, res) => {
  try {
    const servicesStatus = await settingsRefreshService.getServicesStatus();
    res.json({ 
      message: 'Services status retrieved successfully',
      servicesStatus: servicesStatus
    });
  } catch (error) {
    console.error('Error getting services status:', error);
    res.status(500).json({ 
      message: 'Failed to get services status',
      error: error.message 
    });
  }
});

// Test endpoint to verify current operational mode
router.get('/test-mode-status', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Get services status
    const servicesStatus = await settingsRefreshService.getServicesStatus();
    
    res.json({
      message: 'Current operational mode status',
      settings: {
        isTestMode: settings.isTestMode,
        stripeMode: settings.stripeMode,
        solanaMode: settings.solanaMode,
        effectiveStripeMode: settings.isTestMode ? 'test' : settings.stripeMode,
        effectiveSolanaMode: settings.isTestMode ? 'devnet' : settings.solanaMode
      },
      currentStatus: {
        servicesStatus: servicesStatus,
        timestamp: new Date().toISOString()
      },
      note: 'This endpoint shows the current operational mode and how it affects the services'
    });
  } catch (error) {
    console.error('Error getting test mode status:', error);
    res.status(500).json({ 
      message: 'Failed to get test mode status',
      error: error.message 
    });
  }
});

// Get all users with pagination and filtering
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = '',
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role && role !== 'all') {
      query.role = role;
    }

    // Handle status filtering
    if (status && status !== 'all') {
      switch (status) {
        case 'verified':
          query.isEmailVerified = true;
          query.isBlocked = { $ne: true };
          break;
        case 'unverified':
          query.isEmailVerified = false;
          query.isBlocked = { $ne: true };
          break;
        case 'blocked':
          query.isBlocked = true;
          break;
      }
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get total count
    const total = await User.countDocuments(query);
    
    // Get users
    const users = await User.find(query)
      .select('-password')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ 
      message: 'Failed to fetch users',
      error: error.message 
    });
  }
});

// Get single user by ID
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user',
      error: error.message 
    });
  }
});

// Create new user
router.post('/users', async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, isEmailVerified } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ 
        message: 'First name, last name, email, and password are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Check if email is already taken
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'Email is already taken' 
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Validate role
    if (role && !['user', 'contributor', 'admin'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be "user", "contributor", or "admin"' 
      });
    }

    // Create new user
    const newUser = new User({
      firstName,
      lastName,
      email,
      password,
      role: role || 'user',
      isEmailVerified: Boolean(isEmailVerified)
    });

    await newUser.save();

    // Log user creation
    try {
      await LogService.logUserCreated(req.user._id, {
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role
      });
    } catch (logError) {
      console.error('Error logging user creation:', logError);
    }

    // Return user without password
    const userResponse = newUser.toJSON();

    res.status(201).json({ 
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      message: 'Failed to create user',
      error: error.message 
    });
  }
});

// Update user role
router.put('/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role || !['lead', 'user', 'admin'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be "lead", "user", or "admin"' 
      });
    }

    // Prevent admin from removing their own admin role
    if (req.user._id.toString() === userId && role !== 'admin') {
      return res.status(400).json({ 
        message: 'Cannot remove your own admin role' 
      });
    }

    const oldUser = await User.findById(userId).select('-password');
    if (!oldUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    // Log role change
    try {
      await LogService.logUserRoleChanged(req.user._id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }, oldUser.role, user.role);
    } catch (logError) {
      console.error('Error logging role change:', logError);
    }

    res.json({ 
      message: 'User role updated successfully',
      user 
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ 
      message: 'Failed to update user role',
      error: error.message 
    });
  }
});

// Update user contributor status
router.put('/users/:userId/contributor', async (req, res) => {
  try {
    const { userId } = req.params;
    const { isContributor } = req.body;

    if (typeof isContributor !== 'boolean') {
      return res.status(400).json({ 
        message: 'Invalid isContributor value. Must be a boolean' 
      });
    }

    const oldUser = await User.findById(userId).select('-password');
    if (!oldUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { isContributor },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ 
      message: 'User contributor status updated successfully',
      user 
    });
  } catch (error) {
    console.error('Error updating user contributor status:', error);
    res.status(500).json({ 
      message: 'Failed to update user contributor status',
      error: error.message 
    });
  }
});

// Update user details
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, email, role, isEmailVerified } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ 
        message: 'First name, last name, and email are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        message: 'Invalid email format' 
      });
    }

    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email, 
      _id: { $ne: userId } 
    });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'Email is already taken by another user' 
      });
    }

    // Validate role
    if (role && !['user', 'contributor', 'admin'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be "user", "contributor", or "admin"' 
      });
    }

    // Prevent admin from removing their own admin role
    if (req.user._id.toString() === userId && role === 'user') {
      return res.status(400).json({ 
        message: 'Cannot remove your own admin role' 
      });
    }

    // Build update object
    const updates = {
      firstName,
      lastName,
      email,
      role: role || 'user',
      isEmailVerified: Boolean(isEmailVerified)
    };

    const oldUser = await User.findById(userId).select('-password');
    if (!oldUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    // Log user update
    try {
      const changes = {};
      if (oldUser.firstName !== user.firstName) changes.firstName = { old: oldUser.firstName, new: user.firstName };
      if (oldUser.lastName !== user.lastName) changes.lastName = { old: oldUser.lastName, new: user.lastName };
      if (oldUser.email !== user.email) changes.email = { old: oldUser.email, new: user.email };
      if (oldUser.role !== user.role) changes.role = { old: oldUser.role, new: user.role };
      if (oldUser.isEmailVerified !== user.isEmailVerified) changes.isEmailVerified = { old: oldUser.isEmailVerified, new: user.isEmailVerified };

      await LogService.logUserUpdated(req.user._id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }, changes);
    } catch (logError) {
      console.error('Error logging user update:', logError);
    }

    res.json({ 
      message: 'User updated successfully',
      user 
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      message: 'Failed to update user',
      error: error.message 
    });
  }
});

// Delete user
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Prevent admin from deleting themselves
    if (req.user._id.toString() === userId) {
      return res.status(400).json({ 
        message: 'Cannot delete your own account' 
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Log user deletion
    try {
      await LogService.logUserDeleted(req.user._id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      });
    } catch (logError) {
      console.error('Error logging user deletion:', logError);
    }

    await User.findByIdAndDelete(userId);

    res.json({ 
      message: 'User deleted successfully',
      deletedUser: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`
      }
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      message: 'Failed to delete user',
      error: error.message 
    });
  }
});

// Get user statistics
router.get('/users/stats/overview', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const regularUsers = await User.countDocuments({ role: 'user' });
    
    // Get users created in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.json({
      stats: {
        totalUsers,
        adminUsers,
        regularUsers,
        newUsers,
        activeUsers: totalUsers - newUsers // Simplified for demo
      }
    });
  } catch (error) {
    console.error('Error fetching user stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch user statistics',
      error: error.message 
    });
  }
});

// Get user's droplets
router.get('/users/:userId/droplets', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const droplets = await Droplet.find({ user: userId })
      .populate('user', 'firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      droplets: droplets.map(droplet => ({
        id: droplet.dropletId,
        name: droplet.name,
        status: droplet.status,
        createdAt: droplet.createdAt,
        ipAddress: droplet.ipAddress,
        sizeSlug: droplet.sizeSlug,
        regionSlug: droplet.regionSlug,
        priceMonthly: droplet.priceMonthly
      }))
    });
  } catch (error) {
    console.error('Error fetching user droplets:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user droplets' 
    });
  }
});

// Get user's purchased items (items from store/my-purchases)
router.get('/users/:userId/purchases', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
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
          
          if (cartItem) {
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
    
    res.json({
      success: true,
      purchases: uniquePurchases
    });
  } catch (error) {
    console.error('Error fetching user purchases:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user purchases' 
    });
  }
});

// Get all transactions with pagination and filtering
router.get('/transactions', async (req, res) => {
  try {
    const result = await transactionService.getTransactions(req.query);
    res.json(result);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transactions',
      error: error.message 
    });
  }
});

// Get transaction statistics
router.get('/transactions/stats', async (req, res) => {
  try {
    const stats = await transactionService.getTransactionStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch transaction statistics',
      error: error.message 
    });
  }
});

// Get single transaction by ID
router.get('/transactions/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await transactionService.getTransactionById(transactionId);
    const transformedTransaction = transactionService.transformTransactionForFrontend(transaction);

    res.json({ transaction: transformedTransaction });
  } catch (error) {
    console.error('Error fetching transaction:', error);
    if (error.message === 'Transaction not found') {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.status(500).json({ 
      message: 'Failed to fetch transaction',
      error: error.message 
    });
  }
});

// ===== DROPLET ROUTES =====

// Get all droplets with pagination and filtering
router.get('/droplets', async (req, res) => {
  try {
    const result = await dropletService.getDroplets(req.query);
    res.json(result);
  } catch (error) {
    console.error('Error fetching droplets:', error);
    res.status(500).json({ 
      message: 'Failed to fetch droplets',
      error: error.message 
    });
  }
});

// Get droplet statistics
router.get('/droplets/stats', async (req, res) => {
  try {
    const stats = await dropletService.getDropletStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching droplet stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch droplet statistics',
      error: error.message 
    });
  }
});

// Get single droplet by ID
router.get('/droplets/:dropletId', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    const droplet = await dropletService.getDropletById(dropletId);
    const transformedDroplet = dropletService.transformDropletForFrontend(droplet);

    res.json({ droplet: transformedDroplet });
  } catch (error) {
    console.error('Error fetching droplet:', error);
    if (error.message === 'Droplet not found') {
      return res.status(404).json({ message: 'Droplet not found' });
    }
    res.status(500).json({ 
      message: 'Failed to fetch droplet',
      error: error.message 
    });
  }
});

// Sync droplet status from DigitalOcean
router.post('/droplets/:dropletId/sync', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    const droplet = await dropletService.syncDropletStatus(dropletId);
    const transformedDroplet = dropletService.transformDropletForFrontend(droplet);

    res.json({ 
      message: 'Droplet status synced successfully',
      droplet: transformedDroplet 
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

// Terminate droplet
router.post('/droplets/:dropletId/terminate', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    const droplet = await dropletService.terminateDroplet(dropletId);
    const transformedDroplet = dropletService.transformDropletForFrontend(droplet);

    res.json({ 
      message: 'Droplet terminated successfully',
      droplet: transformedDroplet 
    });
  } catch (error) {
    console.error('Error terminating droplet:', error);
    if (error.message === 'Droplet not found') {
      return res.status(404).json({ message: 'Droplet not found' });
    }
    res.status(500).json({ 
      message: 'Failed to terminate droplet',
      error: error.message 
    });
  }
});

// Reprovision droplet
router.post('/droplets/:dropletId/reprovision', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    const droplet = await dropletService.reprovisionDroplet(dropletId);
    const transformedDroplet = dropletService.transformDropletForFrontend(droplet);

    res.json({ 
      message: 'Droplet reprovisioned successfully',
      droplet: transformedDroplet 
    });
  } catch (error) {
    console.error('Error reprovisioning droplet:', error);
    if (error.message === 'Droplet not found') {
      return res.status(404).json({ message: 'Droplet not found' });
    }
    res.status(500).json({ 
      message: 'Failed to reprovision droplet',
      error: error.message 
    });
  }
});

// Delete droplet
router.delete('/droplets/:dropletId', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    const result = await dropletService.deleteDroplet(dropletId);

    res.json({ 
      message: 'Droplet deleted successfully',
      result 
    });
  } catch (error) {
    console.error('Error deleting droplet:', error);
    if (error.message === 'Droplet not found') {
      return res.status(404).json({ message: 'Droplet not found' });
    }
    res.status(500).json({ 
      message: 'Failed to delete droplet',
      error: error.message 
    });
  }
});

// ===== LOGS ROUTES =====

// Get all logs with pagination and filtering
router.get('/logs', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      level = 'all',
      type = 'all',
      search = '',
      startDate = '',
      endDate = ''
    } = req.query;

    const { logs, total, pages } = await LogService.getLogsPaginated({
      page,
      limit,
      level,
      type,
      search,
      startDate,
      endDate
    });

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ 
      message: 'Failed to fetch logs',
      error: error.message 
    });
  }
});

// Get log statistics
router.get('/logs/stats', async (req, res) => {
  try {
    const stats = await LogService.getLogStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch log statistics',
      error: error.message 
    });
  }
});

// Get logs by type
router.get('/logs/type/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const { limit = 50 } = req.query;
    
    const logs = await LogService.getLogsByType(type, parseInt(limit));
    res.json({ logs });
  } catch (error) {
    console.error('Error fetching logs by type:', error);
    res.status(500).json({ 
      message: 'Failed to fetch logs by type',
      error: error.message 
    });
  }
});

// Get recent errors
router.get('/logs/errors', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const logs = await LogService.getRecentErrors(parseInt(limit));
    res.json({ logs });
  } catch (error) {
    console.error('Error fetching recent errors:', error);
    res.status(500).json({ 
      message: 'Failed to fetch recent errors',
      error: error.message 
    });
  }
});

// Export logs
router.get('/logs/export', async (req, res) => {
  try {
    const { format = 'json', startDate, endDate, level, type } = req.query;
    
    const filters = {
      level: level || 'all',
      type: type || 'all',
      startDate,
      endDate
    };

    const logs = await LogService.getLogs(filters);
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = 'Timestamp,Level,Type,Message,Status,User,Details\n';
      const csvRows = logs.map(log => {
        const user = log.userId ? `${log.userId.firstName} ${log.userId.lastName}` : 'N/A';
        const details = JSON.stringify(log.details).replace(/"/g, '""');
        return `"${log.timestamp}","${log.level}","${log.type}","${log.message}","${log.status}","${user}","${details}"`;
      }).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
      res.send(csvHeaders + csvRows);
    } else {
      // Return JSON
      res.json({ logs });
    }
  } catch (error) {
    console.error('Error exporting logs:', error);
    res.status(500).json({ 
      message: 'Failed to export logs',
      error: error.message 
    });
  }
});

// ===== SETTINGS ROUTES =====

// Update settings
router.put('/settings', async (req, res) => {
  try {
    const { 
      defaultSnapshotId, 
      defaultDnsDomain, 
      stripeMode, 
      solanaMode, 
      isTestMode,
      solanaWalletAddress,
      stripePublicKey,
      stripeSecretKey,
      requiredWithdrawAmount
    } = req.body;

    // Validate required fields
    if (defaultSnapshotId === undefined || defaultDnsDomain === undefined) {
      return res.status(400).json({ 
        message: 'Default snapshot ID and DNS domain are required' 
      });
    }

    // Validate snapshot ID is a number
    if (isNaN(defaultSnapshotId) || defaultSnapshotId <= 0) {
      return res.status(400).json({ 
        message: 'Default snapshot ID must be a positive number' 
      });
    }

    // Validate DNS domain format
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(defaultDnsDomain)) {
      return res.status(400).json({ 
        message: 'Invalid DNS domain format' 
      });
    }

    // Validate stripe mode
    if (stripeMode && !['test', 'live'].includes(stripeMode)) {
      return res.status(400).json({ 
        message: 'Invalid Stripe mode. Must be "test" or "live"' 
      });
    }

    // Validate Solana mode
    if (solanaMode && !['devnet', 'mainnet'].includes(solanaMode)) {
      return res.status(400).json({ 
        message: 'Invalid Solana mode. Must be "devnet" or "mainnet"' 
      });
    }

    // Validate Solana wallet address format (basic validation)
    if (solanaWalletAddress && solanaWalletAddress.length !== 44) {
      return res.status(400).json({ 
        message: 'Invalid Solana wallet address format. Must be 44 characters long.' 
      });
    }

    // Validate Stripe keys (basic validation)
    if (stripePublicKey && !stripePublicKey.startsWith('pk_')) {
      return res.status(400).json({ 
        message: 'Invalid Stripe public key format. Must start with "pk_".' 
      });
    }

    if (stripeSecretKey && !stripeSecretKey.startsWith('sk_')) {
      return res.status(400).json({ 
        message: 'Invalid Stripe secret key format. Must start with "sk_".' 
      });
    }

    // Validate required withdrawal amount
    if (requiredWithdrawAmount !== undefined) {
      if (isNaN(requiredWithdrawAmount) || requiredWithdrawAmount < 0) {
        return res.status(400).json({ 
          message: 'Required withdrawal amount must be a non-negative number' 
        });
      }
    }

    // Get current settings
    const currentSettings = await Settings.getSettings();
    
    // Build update object
    const updates = {
      defaultSnapshotId: parseInt(defaultSnapshotId),
      defaultDnsDomain,
      stripeMode: stripeMode || 'live',
      solanaMode: solanaMode || 'mainnet',
      isTestMode: Boolean(isTestMode),
      solanaWalletAddress: solanaWalletAddress || currentSettings.solanaWalletAddress,
      stripePublicKey: stripePublicKey || currentSettings.stripePublicKey,
      stripeSecretKey: stripeSecretKey || currentSettings.stripeSecretKey,
      requiredWithdrawAmount: requiredWithdrawAmount !== undefined ? parseFloat(requiredWithdrawAmount) : currentSettings.requiredWithdrawAmount
    };

    // Update settings
    const updatedSettings = await Settings.findByIdAndUpdate(
      currentSettings._id,
      updates,
      { new: true, runValidators: true }
    );

    // Log settings update
    try {
      const changes = {};
      if (currentSettings.defaultSnapshotId !== updatedSettings.defaultSnapshotId) {
        changes.defaultSnapshotId = { old: currentSettings.defaultSnapshotId, new: updatedSettings.defaultSnapshotId };
      }
      if (currentSettings.defaultDnsDomain !== updatedSettings.defaultDnsDomain) {
        changes.defaultDnsDomain = { old: currentSettings.defaultDnsDomain, new: updatedSettings.defaultDnsDomain };
      }
      if (currentSettings.stripeMode !== updatedSettings.stripeMode) {
        changes.stripeMode = { old: currentSettings.stripeMode, new: updatedSettings.stripeMode };
      }
      if (currentSettings.solanaMode !== updatedSettings.solanaMode) {
        changes.solanaMode = { old: currentSettings.solanaMode, new: updatedSettings.solanaMode };
      }
      if (currentSettings.isTestMode !== updatedSettings.isTestMode) {
        changes.isTestMode = { old: currentSettings.isTestMode, new: updatedSettings.isTestMode };
      }
      if (currentSettings.solanaWalletAddress !== updatedSettings.solanaWalletAddress) {
        changes.solanaWalletAddress = { old: currentSettings.solanaWalletAddress, new: updatedSettings.solanaWalletAddress };
      }
      if (currentSettings.stripePublicKey !== updatedSettings.stripePublicKey) {
        changes.stripePublicKey = { old: currentSettings.stripePublicKey, new: updatedSettings.stripePublicKey };
      }
      if (currentSettings.stripeSecretKey !== updatedSettings.stripeSecretKey) {
        changes.stripeSecretKey = { old: currentSettings.stripeSecretKey, new: updatedSettings.stripeSecretKey };
      }
      if (currentSettings.requiredWithdrawAmount !== updatedSettings.requiredWithdrawAmount) {
        changes.requiredWithdrawAmount = { old: currentSettings.requiredWithdrawAmount, new: updatedSettings.requiredWithdrawAmount };
      }

      await LogService.logSettingsUpdated(req.user._id, changes);
    } catch (logError) {
      console.error('Error logging settings update:', logError);
    }

    // Refresh all services with new settings
    try {
      console.log('Refreshing all services with new settings...');
      await settingsRefreshService.refreshAllServices();
      console.log('Services refreshed successfully');
    } catch (refreshError) {
      console.error('Error refreshing services:', refreshError);
      // Don't fail the request if service refresh fails
    }

    res.json({ 
      message: 'Settings updated successfully',
      settings: updatedSettings 
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ 
      message: 'Failed to update settings',
      error: error.message 
    });
  }
});

// Refresh Stripe instance (for when settings are updated)
router.post('/refresh-stripe', async (req, res) => {
  try {
    await stripeService.refreshStripe();
    res.json({ 
      message: 'Stripe service refreshed successfully'
    });
  } catch (error) {
    console.error('Error refreshing Stripe service:', error);
    res.status(500).json({ 
      message: 'Failed to refresh Stripe service',
      error: error.message 
    });
  }
});

// Refresh all services (for when settings are updated)
router.post('/refresh-services', async (req, res) => {
  try {
    // Get current settings to log what we're refreshing
    const settings = await Settings.getSettings();
    
    console.log('Refreshing all services with new settings:', {
      isTestMode: settings.isTestMode,
      stripeMode: settings.stripeMode,
      solanaMode: settings.solanaMode
    });

    // Refresh all services
    await settingsRefreshService.refreshAllServices();
    
    // Get updated status
    const servicesStatus = await settingsRefreshService.getServicesStatus();
    
    res.json({ 
      message: 'All services refreshed successfully',
      settings: {
        isTestMode: settings.isTestMode,
        stripeMode: settings.stripeMode,
        solanaMode: settings.solanaMode
      },
      servicesStatus: servicesStatus
    });
  } catch (error) {
    console.error('Error refreshing services:', error);
    res.status(500).json({ 
      message: 'Failed to refresh services',
      error: error.message 
    });
  }
});

// Update snapshot from sample droplet
router.post('/update-snapshot', async (req, res) => {
  try {    
    console.log('Starting snapshot update process...');
    
    // Create action record in database first
    const actionId = `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const action = await Action.createAction({
      actionId: actionId,
      type: 'snapshot_update',
      status: 'pending',
      userId: req.user._id,
      metadata: {
        actionType: 'snapshot_creation'
      },
      progressMessage: 'Snapshot update process initiated'
    });
    
    // Start background process (don't await - let it run in background)
    digitalOceanService.startSnapshotUpdateProcess(actionId, req.user._id);
    
    console.log(`Snapshot update initiated with action ID: ${actionId}`);
    
    // Log the snapshot update initiation
    try {
      await LogService.logSettingsUpdated(req.user._id, {
        snapshotUpdate: { 
          actionId: actionId, 
          status: 'initiated',
          message: 'Snapshot update process started'
        }
      });
    } catch (logError) {
      console.error('Error logging snapshot update initiation:', logError);
    }
    
    res.json({ 
      message: 'Snapshot update process initiated',
      actionId: actionId,
      status: 'pending'
    });
    
  } catch (error) {
    console.error('Error updating snapshot:', error);
    res.status(500).json({ 
      message: 'Failed to update snapshot',
      error: error.message 
    });
  }
});

// Sync Demo world environment with latest Hyperfy build
router.post('/update-demo-world', async (req, res) => {
  try {
    const demoWorldHost = 'demo.edifyengine.com';

    const actionId = `demo_world_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await Action.createAction({
      actionId,
      type: 'demo_world_update',
      status: 'pending',
      userId: req.user._id,
      metadata: {
        actionType: 'demo_world_update',
        demoWorldHost
      },
      progressMessage: 'Demo world update queued'
    });

    digitalOceanService.startDemoWorldUpdateProcess(actionId, req.user._id);

    try {
      await LogService.logSettingsUpdated(req.user._id, {
        demoWorldUpdate: {
          actionId,
          status: 'initiated',
          host: demoWorldHost,
          message: 'Demo world update process started'
        }
      });
    } catch (logError) {
      console.error('Error logging Demo world update initiation:', logError);
    }

    res.json({
      success: true,
      message: 'Demo world update process initiated',
      actionId,
      status: 'pending'
    });
  } catch (error) {
    console.error('Error initiating Demo world update:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate Demo world update'
    });
  }
});

// ==================== ITEMS MANAGEMENT ====================

// Get all items for admin management
router.get('/items', requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 50, search } = req.query;
    
    let query = {};
    
    // Filter by status if provided
    if (status && ['unapproved', 'approved', 'rejected'].includes(status)) {
      query.status = status;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'creator.name': { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (page - 1) * limit;
    
    const items = await Item.find(query)
      .populate('creator.id', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Item.countDocuments(query);
    
    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ 
      message: 'Failed to fetch items',
      error: error.message 
    });
  }
});

// Update item status (approve/reject)
router.patch('/items/:itemId/status', requireAdmin, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!['unapproved', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        message: 'Invalid status. Must be unapproved, approved, or rejected' 
      });
    }
    
    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const oldStatus = item.status;
    item.status = status;
    await item.save();
    
    // Log the status change
    try {
      await LogService.logAction({
        type: 'item_status_changed',
        message: `Item "${item.title}" status changed from ${oldStatus} to ${status}`,
        details: {
          itemId: item._id,
          itemTitle: item.title,
          oldStatus,
          newStatus: status,
          changedBy: req.user._id
        },
        userId: req.user._id,
        itemId: item._id
      });
    } catch (logError) {
      console.error('Error logging status change:', logError);
    }
    
    res.json({ 
      message: `Item ${status} successfully`,
      item: {
        _id: item._id,
        title: item.title,
        status: item.status,
        creator: item.creator
      }
    });
  } catch (error) {
    console.error('Error updating item status:', error);
    res.status(500).json({ 
      message: 'Failed to update item status',
      error: error.message 
    });
  }
});

// Get item statistics for admin dashboard
router.get('/items/stats', requireAdmin, async (req, res) => {
  try {
    const totalItems = await Item.countDocuments();
    const unapprovedItems = await Item.countDocuments({ status: 'unapproved' });
    const approvedItems = await Item.countDocuments({ status: 'approved' });
    const rejectedItems = await Item.countDocuments({ status: 'rejected' });
    
    // Recent items (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentItems = await Item.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });
    
    res.json({
      stats: {
        totalItems,
        unapprovedItems,
        approvedItems,
        rejectedItems,
        recentItems
      }
    });
  } catch (error) {
    console.error('Error fetching item stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch item statistics',
      error: error.message 
    });
  }
});

// Create droplet endpoint for admin
router.post('/droplets/create', async (req, res) => {
  try {
    const { userId } = req.body;

    // Validate input
    if (!userId) {
      return res.status(400).json({ 
        message: 'User ID is required' 
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        message: 'User not found' 
      });
    }

    // Get settings for default image
    const settings = await Settings.getSettings();

    // Generate unique 6-character droplet name (letters and numbers)
    const generateRandomName = () => {
      const characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
    };

    let dropletName;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 100;

    // Generate unique name
    while (!isUnique && attempts < maxAttempts) {
      dropletName = generateRandomName();
      const existingDroplet = await Droplet.findOne({ name: dropletName });
      if (!existingDroplet) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ 
        message: 'Failed to generate unique droplet name after multiple attempts' 
      });
    }

    // Log the droplet creation initiation
    try {
      await LogService.createLog({
        level: 'success',
        type: 'admin_action',
        message: `Admin initiated droplet creation for user ${user.email}`,
        details: {
          dropletName: dropletName,
          targetUser: {
            id: user._id,
            email: user.email,
            name: `${user.firstName} ${user.lastName}`
          }
        },
        status: 'processing',
        userId: req.user._id,
        metadata: {
          context: 'admin_droplet_creation'
        }
      });
    } catch (logError) {
      console.error('Error logging droplet creation initiation:', logError);
    }

    // Start background processing
    processAdminDropletCreation(dropletName, userId, req.user._id, user, settings);

    // Return immediately with success message
    res.status(201).json({
      success: true,
      message: `Droplet "${dropletName}" is being created in the background.`,
      processing: true,
      droplet: {
        name: dropletName,
        status: 'creating',
        user: {
          id: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`
        }
      }
    });

  } catch (error) {
    console.error('Error creating droplet:', error);
    
    // Log error
    try {
      await LogService.logError({
        message: 'Failed to create droplet via admin',
        error: error.message,
        context: 'admin_droplet_creation',
        userId: req.user._id
      });
    } catch (logError) {
      console.error('Error logging error:', logError);
    }
    
    res.status(500).json({ 
      message: 'Failed to create droplet',
      error: error.message 
    });
  }
});

// Background processing function for admin droplet creation
async function processAdminDropletCreation(dropletName, userId, adminId, user, settings) {
  try {
    console.log(`Starting background processing for admin droplet creation: ${dropletName}`);

    // Create droplet on DigitalOcean
    const result = await digitalOceanService.createNewDroplet({
      name: dropletName,
      image: settings.defaultSnapshotId
    });

    if (!result.droplet || !result.droplet.id) {
      throw new Error('Failed to create droplet on DigitalOcean');
    }

    const dropletId = result.droplet.id;

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

    // Log successful admin droplet creation
    try {
      await LogService.logDropletCreated(adminId, dropletId, {
        name: dropletName,
        sizeSlug: result.droplet.size_slug,
        regionSlug: result.droplet.region.slug,
        image: settings.defaultSnapshotId,
        memory: result.droplet.memory,
        vcpus: result.droplet.vcpus,
        disk: result.droplet.disk,
        targetUser: {
          id: user._id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`
        }
      });
    } catch (logError) {
      console.error('Error logging admin droplet creation:', logError);
    }

    // Power on droplet and complete setup workflow
    try {
      console.log(`Starting complete droplet setup workflow for ${dropletId}`);
      
      // Wait for setup to complete
      const result = await digitalOceanService.completeDropletSetup(dropletId, dropletName);
      
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
        context: 'admin_droplet_complete_setup',
        userId: adminId
      }).catch(logError => console.error('Error logging setup error:', logError));
    }
    
    console.log(`Background processing completed for admin droplet creation: ${dropletName}`);
    
    // Send completion email to user
    try {
      await emailService.sendDropletCreatedNotification(user.email, {
        dropletName: dropletName,
        domain: `${dropletName}.${settings.defaultDnsDomain}`,
        firstName: user.firstName
      });
    } catch (emailError) {
      console.error('Error sending droplet created notification:', emailError);
    }
    
  } catch (error) {
    console.error('Background processing error for admin droplet creation:', error);
    
    // Log error
    try {
      await LogService.logError({
        message: 'Failed to create droplet in background (admin)',
        error: error.message,
        context: 'background_admin_droplet_creation',
        userId: adminId,
        metadata: {
          dropletName: dropletName,
          targetUserId: userId
        }
      });
    } catch (logError) {
      console.error('Error logging error:', logError);
    }
  }
}

// Get demo emails
router.get('/demo-emails', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      source = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {};
    
    if (search) {
      query.$or = [
        { email: { $regex: search, $options: 'i' } },
        { ipAddress: { $regex: search, $options: 'i' } }
      ];
    }

    if (source && source !== 'all') {
      query.source = source;
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get total count
    const total = await DemoEmail.countDocuments(query);
    
    // Get demo emails
    const demoEmails = await DemoEmail.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      demoEmails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching demo emails:', error);
    res.status(500).json({ 
      message: 'Failed to fetch demo emails',
      error: error.message 
    });
  }
});

// Get demo emails statistics
router.get('/demo-emails/stats', async (req, res) => {
  try {
    const total = await DemoEmail.countDocuments();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayCount = await DemoEmail.countDocuments({
      createdAt: { $gte: today }
    });
    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    const weekCount = await DemoEmail.countDocuments({
      createdAt: { $gte: thisWeek }
    });
    const thisMonth = new Date();
    thisMonth.setMonth(thisMonth.getMonth() - 1);
    const monthCount = await DemoEmail.countDocuments({
      createdAt: { $gte: thisMonth }
    });

    res.json({
      stats: {
        total,
        today: todayCount,
        thisWeek: weekCount,
        thisMonth: monthCount
      }
    });
  } catch (error) {
    console.error('Error fetching demo emails stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch demo emails statistics',
      error: error.message 
    });
  }
});

export default router; 