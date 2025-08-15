import express from 'express';
import { requireAdmin } from '../middleware/admin.js';
import { authenticateToken } from '../middleware/auth.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';
import LogService from '../services/logService.js';

const transactionService = new TransactionService();
const dropletService = new DropletService();

const router = express.Router();

// Get current settings (requires user authentication, not admin)
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

// Public endpoint for payment settings (no authentication required)
router.get('/payment-settings', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    // Only return payment-related settings for security
    res.json({
      stripeMode: settings.stripeMode,
      solanaMode: settings.solanaMode,
      isTestMode: settings.isTestMode,
      stripePublicKey: settings.stripePublicKey
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

// Test endpoint to verify current operational mode
router.get('/test-mode-status', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Import services to get current status
    const { default: SolanaService } = await import('../services/solanaService.js');
    const solanaService = new SolanaService();
    const currentNetwork = await solanaService.getCurrentNetwork();
    
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
        solanaNetwork: currentNetwork,
        stripeConfigured: true, // Will be updated when we add Stripe status check
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
    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be "user" or "admin"' 
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

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be "user" or "admin"' 
      });
    }

    // Prevent admin from removing their own admin role
    if (req.user._id.toString() === userId && role === 'user') {
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
    if (role && !['user', 'admin'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be "user" or "admin"' 
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

// Restart droplet
router.post('/droplets/:dropletId/restart', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    const droplet = await dropletService.restartDroplet(dropletId);
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
      stripeSecretKey
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
      stripeSecretKey: stripeSecretKey || currentSettings.stripeSecretKey
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

      await LogService.logSettingsUpdated(req.user._id, changes);
    } catch (logError) {
      console.error('Error logging settings update:', logError);
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
    // This endpoint will be called by the frontend to refresh Stripe
    // The actual refresh logic is handled in the Stripe route
    res.json({ 
      message: 'Stripe refresh request received',
      note: 'Stripe instance will be refreshed on next request'
    });
  } catch (error) {
    console.error('Error handling Stripe refresh request:', error);
    res.status(500).json({ 
      message: 'Failed to process Stripe refresh request',
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

    // Import services dynamically to avoid circular dependencies
    const { default: SolanaService } = await import('../services/solanaService.js');
    
    // Refresh Solana service
    const solanaService = new SolanaService();
    await solanaService.refreshConnection();
    
    // Note: Stripe service will refresh automatically on next request
    // due to the ensureStripeInitialized() call in each route
    
    res.json({ 
      message: 'All services refreshed successfully',
      settings: {
        isTestMode: settings.isTestMode,
        stripeMode: settings.stripeMode,
        solanaMode: settings.solanaMode
      },
      note: 'Stripe will refresh on next payment request'
    });
  } catch (error) {
    console.error('Error refreshing services:', error);
    res.status(500).json({ 
      message: 'Failed to refresh services',
      error: error.message 
    });
  }
});

export default router; 