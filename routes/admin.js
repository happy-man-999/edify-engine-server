import express from 'express';
import { requireAdmin } from '../middleware/admin.js';
import User from '../models/User.js';
import TransactionService from '../services/transactionService.js';
import DropletService from '../services/dropletService.js';

const transactionService = new TransactionService();
const dropletService = new DropletService();

const router = express.Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

// Error handling middleware for admin routes
router.use((error, req, res, next) => {
  console.error('Admin route error:', error);
  res.status(500).json({ 
    message: 'Internal server error in admin routes',
    error: error.message 
  });
});

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

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
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

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

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

export default router; 