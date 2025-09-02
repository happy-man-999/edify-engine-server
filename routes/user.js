import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import Droplet from '../models/Droplet.js';
import DropletService from '../services/dropletService.js';
import DigitalOceanService from '../services/digitalOceanService.js';
import Action from '../models/Action.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const dropletService = new DropletService();
const digitalOceanService = new DigitalOceanService(process.env.DIGITAL_OCEAN_TOKEN, process.env.DIGITAL_OCEAN_SSH_KEY_ID);

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

export default router; 