import express from 'express';
import multer from 'multer';
import Item from '../models/Item.js';
import { authenticateToken } from '../middleware/auth.js';
import DigitalOceanSpacesService from '../services/digitalOceanSpacesService.js';

const router = express.Router();

// Helper function to format file size
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, GLB files, and HYP files
    if (file.mimetype.startsWith('image/') || 
        file.mimetype === 'model/gltf-binary' || 
        file.originalname.endsWith('.glb') ||
        file.originalname.endsWith('.hyp')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files, GLB files, and HYP files are allowed'), false);
    }
  }
});

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
router.post('/', authenticateToken, upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'sceneAssets', maxCount: 1 },
  { name: 'downloadAssets', maxCount: 1 }
]), async (req, res) => {
  try {
    // Check if user is admin or contributor
    if (req.user.role !== 'admin' && req.user.role !== 'contributor') {
      return res.status(403).json({ error: 'Admin or contributor access required' });
    }
    
    const { 
      title, 
      description, 
      type, 
      category,
      priceUSD, 
      features, 
      tags, 
      platforms, 
      visibility, 
      installationInstructions 
    } = req.body;
    const files = req.files;
    
    // Validate required fields
    if (!title || !description || !type || !category || !priceUSD || !platforms) {
      return res.status(400).json({ error: 'Title, description, type, category, price, and platforms are required' });
    }
    
    // Parse and validate platforms array
    const validPlatforms = ['desktop', 'mobile', 'vr'];
    let platformsArray = [];
    if (platforms) {
      try {
        platformsArray = typeof platforms === 'string' ? JSON.parse(platforms) : platforms;
        if (!Array.isArray(platformsArray)) {
          platformsArray = [platforms];
        }
      } catch (e) {
        platformsArray = [platforms];
      }
    }
    const invalidPlatforms = platformsArray.filter(platform => !validPlatforms.includes(platform));
    if (invalidPlatforms.length > 0) {
      return res.status(400).json({ error: `Invalid platforms: ${invalidPlatforms.join(', ')}. Valid platforms are: ${validPlatforms.join(', ')}` });
    }
    
    // Parse and validate features (max 5)
    let featuresArray = [];
    if (features) {
      try {
        featuresArray = typeof features === 'string' ? JSON.parse(features) : features;
        if (!Array.isArray(featuresArray)) {
          featuresArray = features.split(',').map(f => f.trim()).filter(f => f);
        }
      } catch (e) {
        featuresArray = features.split(',').map(f => f.trim()).filter(f => f);
      }
    }
    if (featuresArray.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 features allowed' });
    }
    
    // Parse and validate tags and check for reserved tags
    let tagsArray = [];
    if (tags) {
      try {
        tagsArray = typeof tags === 'string' ? JSON.parse(tags) : tags;
        if (!Array.isArray(tagsArray)) {
          tagsArray = tags.split(',').map(t => t.trim()).filter(t => t);
        }
      } catch (e) {
        tagsArray = tags.split(',').map(t => t.trim()).filter(t => t);
      }
    }
    const reservedTags = ['premium', 'staffpick', 'onsale'];
    const hasReservedTag = tagsArray.some(tag => reservedTags.includes(tag.toLowerCase()));
    if (hasReservedTag && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can use reserved tags: premium, staffPick, onSale' });
    }
    
    // Validate visibility
    const validVisibility = ['featured', 'limitedEdition', 'private'];
    if (visibility && !validVisibility.includes(visibility)) {
      return res.status(400).json({ error: `Invalid visibility. Valid options are: ${validVisibility.join(', ')}` });
    }
    
    // Validate required files
    if (!files.coverImage || files.coverImage.length === 0) {
      return res.status(400).json({ error: 'Cover image is required' });
    }
    
    // For 3D objects, both scene assets (GLB) and download assets (HYP) are required
    if (type === '3d-object') {
      if (!files.sceneAssets || files.sceneAssets.length === 0) {
        return res.status(400).json({ error: '3D scene assets (GLB file) are required for 3D objects' });
      }
      if (!files.downloadAssets || files.downloadAssets.length === 0) {
        return res.status(400).json({ error: 'Download assets (HYP file) are required for 3D objects' });
      }
    }
    
    // Check DigitalOcean Spaces configuration
    if (!process.env.DO_SPACES_ACCESS_KEY || !process.env.DO_SPACES_SECRET_KEY || 
        !process.env.DO_SPACES_ITEMS_BUCKET_NAME || !process.env.DO_SPACES_ITEMS_BUCKET_URL) {
      console.error('DigitalOcean Spaces configuration missing');
      return res.status(500).json({ 
        error: 'File upload service not configured. Please contact administrator.',
        details: 'DigitalOcean Spaces environment variables are missing'
      });
    }
    
    let coverImageUrl = '';
    let sceneAssetsUrl = '';
    let downloadAssetsUrl = '';
    
    // Upload cover image
    try {
      const coverImageResult = await DigitalOceanSpacesService.uploadFile(
        files.coverImage[0], 
        'cover-images'
      );
      
      if (!coverImageResult.success) {
        console.error('Cover image upload failed:', coverImageResult.error);
        return res.status(500).json({ 
          error: 'Failed to upload cover image', 
          details: coverImageResult.error 
        });
      }
      coverImageUrl = coverImageResult.url;
    } catch (uploadError) {
      console.error('Cover image upload error:', uploadError);
      return res.status(500).json({ 
        error: 'Failed to upload cover image', 
        details: uploadError.message 
      });
    }
    
    // Upload scene assets for 3D objects (GLB file for preview)
    if (type === '3d-object' && files.sceneAssets) {
      try {
        const sceneAssetsResult = await DigitalOceanSpacesService.uploadFile(
          files.sceneAssets[0], 
          '3d-objects'
        );
        
        if (!sceneAssetsResult.success) {
          console.error('3D scene assets upload failed:', sceneAssetsResult.error);
          return res.status(500).json({ 
            error: 'Failed to upload 3D scene assets', 
            details: sceneAssetsResult.error 
          });
        }
        sceneAssetsUrl = sceneAssetsResult.url;
      } catch (uploadError) {
        console.error('3D scene assets upload error:', uploadError);
        return res.status(500).json({ 
          error: 'Failed to upload 3D scene assets', 
          details: uploadError.message 
        });
      }
    }
    
    // Upload download assets for 3D objects (HYP file for download)
    if (type === '3d-object' && files.downloadAssets) {
      try {
        const downloadAssetsResult = await DigitalOceanSpacesService.uploadFile(
          files.downloadAssets[0], 
          '3d-objects'
        );
        
        if (!downloadAssetsResult.success) {
          console.error('3D download assets upload failed:', downloadAssetsResult.error);
          return res.status(500).json({ 
            error: 'Failed to upload 3D download assets', 
            details: downloadAssetsResult.error 
          });
        }
        downloadAssetsUrl = downloadAssetsResult.url;
      } catch (uploadError) {
        console.error('3D download assets upload error:', uploadError);
        return res.status(500).json({ 
          error: 'Failed to upload 3D download assets', 
          details: uploadError.message 
        });
      }
    }
    
    // Calculate file size for the main file (download assets for 3D objects, cover image for others)
    let fileSize = '0 MB';
    if (type === '3d-object' && files.downloadAssets) {
      const sizeInBytes = files.downloadAssets[0].size;
      fileSize = formatFileSize(sizeInBytes);
    } else if (files.coverImage) {
      const sizeInBytes = files.coverImage[0].size;
      fileSize = formatFileSize(sizeInBytes);
    }
    
    // Create item object
    const itemData = {
      title,
      description,
      type,
      category,
      priceUSD: parseFloat(priceUSD),
      image: coverImageUrl,
      fileSize,
      features: featuresArray,
      tags: tagsArray,
      supportedPlatforms: platformsArray,
      visibility: visibility || 'private',
      installationInstructions: installationInstructions || '',
      creator: {
        name: `${req.user.firstName} ${req.user.lastName}`,
        id: req.user._id
      }
    };
    
    // Add scene assets URL for 3D objects (GLB file for preview)
    if (type === '3d-object' && sceneAssetsUrl) {
      itemData.sceneAssets = sceneAssetsUrl;
    }
    
    // Add download assets URL for 3D objects (HYP file for download)
    if (type === '3d-object' && downloadAssetsUrl) {
      itemData.downloadAssets = downloadAssetsUrl;
    }
    
    const item = new Item(itemData);
    await item.save();
    
    res.status(201).json({
      success: true,
      item: item,
      message: 'Item uploaded successfully'
    });
  } catch (error) {
    console.error('Item creation error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      type: 'server_error'
    });
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