import express from 'express';
import Item from '../models/Item.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all active items
router.get('/', async (req, res) => {
  try {
    const { type, category, featured, limit = 50, page = 1, search } = req.query;
    
    let query = { isActive: true };
    
    if (type) query.type = type;
    if (category) query.category = category;
    if (featured === 'true') query.isFeatured = true;
    if (search) {
      query.$text = { $search: search };
    }
    
    const skip = (page - 1) * limit;
    
    const items = await Item.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('creator.id', 'username email');
    
    const total = await Item.countDocuments(query);
    
    res.json({
      items,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get item by ID
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('creator.id', 'username email')
      .populate('bundleItems.itemId');
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Increment view count
    await Item.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });
    
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new item (admin and contributor only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin or contributor
    if (req.user.role !== 'admin' && req.user.role !== 'contributor') {
      return res.status(403).json({ error: 'Admin or contributor access required' });
    }
    
    const item = new Item({
      ...req.body,
      creator: {
        name: `${req.user.firstName} ${req.user.lastName}`,
        id: req.user._id
      }
    });
    
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update item (admin only)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    // if (!req.user.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }
    
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete item (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    // if (!req.user.isAdmin) {
    //   return res.status(403).json({ error: 'Admin access required' });
    // }
    
    const item = await Item.findByIdAndDelete(req.params.id);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    res.json({ message: 'Item deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get featured items
router.get('/featured/items', async (req, res) => {
  try {
    const featuredItems = await Item.find({ 
      isActive: true, 
      isFeatured: true 
    }).sort({ rating: -1, salesCount: -1 });
    
    res.json(featuredItems);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get items by type
router.get('/type/:type', async (req, res) => {
  try {
    const items = await Item.find({ 
      type: req.params.type, 
      isActive: true 
    }).sort({ rating: -1, salesCount: -1 });
    
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search items
router.get('/search/:query', async (req, res) => {
  try {
    const items = await Item.find({
      $text: { $search: req.params.query },
      isActive: true
    }).sort({ score: { $meta: 'textScore' } });
    
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 