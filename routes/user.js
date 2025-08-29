import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import Droplet from '../models/Droplet.js';
import DropletService from '../services/dropletService.js';
import User from '../models/User.js';

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
    const dropletService = new DropletService();
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

// Check domain availability
router.post('/check-domain', async (req, res) => {
  try {
    const { subdomain } = req.body;

    if (!subdomain) {
      return res.status(400).json({ error: 'Subdomain is required' });
    }

    // Validate subdomain format
    // Validate domain format - allows normal domains like example.com, sub.example.com
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainRegex.test(subdomain)) {
      return res.status(400).json({ error: 'Invalid domain format. Domain must be a valid domain name (e.g., example.com, app.example.com). Each part must be 1-63 characters long and contain only letters, numbers, and hyphens. Cannot start or end with a hyphen.' });
    }
    
    // Additional validation for domain length and format
    const domainParts = subdomain.split('.');
    if (domainParts.length < 2) {
      return res.status(400).json({ error: 'Domain must have at least 2 parts (e.g., example.com)' });
    }
    
    if (domainParts.length > 5) {
      return res.status(400).json({ error: 'Domain cannot have more than 5 parts' });
    }
    
    // Check each part length
    for (let i = 0; i < domainParts.length; i++) {
      const part = domainParts[i];
      if (part.length < 1 || part.length > 63) {
        return res.status(400).json({ error: `Domain part "${part}" must be 1-63 characters long` });
      }
      if (part.startsWith('-') || part.endsWith('-')) {
        return res.status(400).json({ error: `Domain part "${part}" cannot start or end with a hyphen` });
      }
    }
    
    // Check total domain length
    if (subdomain.length > 253) {
      return res.status(400).json({ error: 'Total domain length cannot exceed 253 characters' });
    }

    // Check if subdomain already exists
    const existingDroplet = await Droplet.findOne({ subdomain: subdomain });
    const available = !existingDroplet;

    res.json({ available, subdomain });
  } catch (error) {
    console.error('Error checking domain availability:', error);
    res.status(500).json({ error: 'Failed to check domain availability' });
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

export default router; 