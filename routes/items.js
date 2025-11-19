import express from 'express';
import multer from 'multer';
import Item from '../models/Item.js';
import { authenticateToken } from '../middleware/auth.js';
import DigitalOceanSpacesService from '../services/digitalOceanSpacesService.js';
import Droplet from '../models/Droplet.js';
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import dotenv from 'dotenv';

dotenv.config();

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
    
    let query = { isActive: true, status: 'approved' };
    
    if (type) query.type = type;
    if (category) query.category = category;
    if (featured === 'true') query.isFeatured = true;
    if (search) {
      query.$text = { $search: search };
    }
    
    const skip = (page - 1) * limit;
    
    const items = await Item.find(query)
      .select('-downloadAssets')
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
      .select('-downloadAssets')
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
    if (req.user.role !== 'admin' && !req.user.isContributor) {
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
    
    // Validate visibility
    const validVisibility = ['featured', 'limitedEdition', 'private'];
    if (visibility && !validVisibility.includes(visibility)) {
      return res.status(400).json({ error: `Invalid visibility. Valid options are: ${validVisibility.join(', ')}` });
    }
    
    // Validate required files
    if (!files.coverImage || files.coverImage.length === 0) {
      return res.status(400).json({ error: 'Cover image is required' });
    }
    
    // For 3D objects, apps, and world templates, both scene assets (GLB) and download assets (HYP) are required
    if (type === '3d-object' || type === 'app' || type === 'world') {
      if (!files.sceneAssets || files.sceneAssets.length === 0) {
        return res.status(400).json({ 
          error: type === '3d-object' 
            ? '3D scene assets (GLB file) are required for 3D objects'
            : type === 'app'
            ? 'Application preview assets (GLB file) are required for applications'
            : 'World template preview assets (GLB file) are required for world templates'
        });
      }
      if (!files.downloadAssets || files.downloadAssets.length === 0) {
        return res.status(400).json({ 
          error: type === '3d-object'
            ? 'Download assets (HYP file) are required for 3D objects'
            : type === 'app'
            ? 'Download assets (HYP file) are required for applications'
            : 'Download assets (HYP file) are required for world templates'
        });
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
    
    // Upload scene assets for 3D objects, apps, and world templates (GLB file for preview)
    if ((type === '3d-object' || type === 'app' || type === 'world') && files.sceneAssets) {
      try {
        const folderName = type === '3d-object' ? '3d-objects' : type === 'app' ? 'apps' : 'world-templates';
        const sceneAssetsResult = await DigitalOceanSpacesService.uploadFile(
          files.sceneAssets[0], 
          folderName
        );
        
        if (!sceneAssetsResult.success) {
          console.error(`${type} scene assets upload failed:`, sceneAssetsResult.error);
          return res.status(500).json({ 
            error: `Failed to upload ${type} scene assets`, 
            details: sceneAssetsResult.error 
          });
        }
        sceneAssetsUrl = sceneAssetsResult.url;
      } catch (uploadError) {
        console.error(`${type} scene assets upload error:`, uploadError);
        return res.status(500).json({ 
          error: `Failed to upload ${type} scene assets`, 
          details: uploadError.message 
        });
      }
    }
    
    // Upload download assets for 3D objects, apps, and world templates (HYP file for download)
    if ((type === '3d-object' || type === 'app' || type === 'world') && files.downloadAssets) {
      try {
        const folderName = type === '3d-object' ? '3d-objects' : type === 'app' ? 'apps' : 'world-templates';
        const downloadAssetsResult = await DigitalOceanSpacesService.uploadFile(
          files.downloadAssets[0], 
          folderName
        );
        
        if (!downloadAssetsResult.success) {
          console.error(`${type} download assets upload failed:`, downloadAssetsResult.error);
          return res.status(500).json({ 
            error: `Failed to upload ${type} download assets`, 
            details: downloadAssetsResult.error 
          });
        }
        downloadAssetsUrl = downloadAssetsResult.url;
      } catch (uploadError) {
        console.error(`${type} download assets upload error:`, uploadError);
        return res.status(500).json({ 
          error: `Failed to upload ${type} download assets`, 
          details: uploadError.message 
        });
      }
    }
    
    // Calculate file size for the main file (download assets for 3D objects, apps, and world templates, cover image for others)
    let fileSize = '0 MB';
    if ((type === '3d-object' || type === 'app' || type === 'world') && files.downloadAssets) {
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
      },
      // Set status based on user role: admin items are auto-approved, contributor items need approval
      status: req.user.role === 'admin' ? 'approved' : 'unapproved'
    };
    
    // Add scene assets URL for 3D objects, apps, and world templates (GLB file for preview)
    if ((type === '3d-object' || type === 'app' || type === 'world') && sceneAssetsUrl) {
      itemData.sceneAssets = sceneAssetsUrl;
    }
    
    // Add download assets URL for 3D objects, apps, and world templates (HYP file for download)
    if ((type === '3d-object' || type === 'app' || type === 'world') && downloadAssetsUrl) {
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
router.put('/:id', authenticateToken, upload.fields([
  { name: 'coverImage', maxCount: 1 },
  { name: 'sceneAssets', maxCount: 1 },
  { name: 'downloadAssets', maxCount: 1 }
]), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { id } = req.params;
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
    
    // Find the existing item
    const existingItem = await Item.findById(id);
    if (!existingItem) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    // Prepare update data
    const updateData = {
      title: title || existingItem.title,
      description: description || existingItem.description,
      type: type || existingItem.type,
      category: category || existingItem.category,
      priceUSD: priceUSD ? parseFloat(priceUSD) : existingItem.priceUSD,
      features: features ? (typeof features === 'string' ? JSON.parse(features) : features) : existingItem.features,
      tags: tags ? (typeof tags === 'string' ? JSON.parse(tags) : tags) : existingItem.tags,
      supportedPlatforms: platforms ? (typeof platforms === 'string' ? JSON.parse(platforms) : platforms) : existingItem.supportedPlatforms,
      visibility: visibility || existingItem.visibility,
      installationInstructions: installationInstructions || existingItem.installationInstructions
    };
    
    // Handle file uploads if provided
    if (files) {
      // Check DigitalOcean Spaces configuration
      if (!process.env.DO_SPACES_ACCESS_KEY || !process.env.DO_SPACES_SECRET_KEY || 
          !process.env.DO_SPACES_ITEMS_BUCKET_NAME || !process.env.DO_SPACES_ITEMS_BUCKET_URL) {
        console.error('DigitalOcean Spaces configuration missing');
        return res.status(500).json({ 
          error: 'File upload service not configured. Please contact administrator.',
          details: 'DigitalOcean Spaces environment variables are missing'
        });
      }
      
      // Upload cover image if provided
      if (files.coverImage && files.coverImage.length > 0) {
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
          updateData.image = coverImageResult.url;
        } catch (uploadError) {
          console.error('Cover image upload error:', uploadError);
          return res.status(500).json({ 
            error: 'Failed to upload cover image', 
            details: uploadError.message 
          });
        }
      }
      
      // Upload scene assets if provided
      if (files.sceneAssets && files.sceneAssets.length > 0) {
        try {
          const folderName = updateData.type === '3d-object' ? '3d-objects' : 
                           updateData.type === 'app' ? 'apps' : 'world-templates';
          const sceneAssetsResult = await DigitalOceanSpacesService.uploadFile(
            files.sceneAssets[0], 
            folderName
          );
          
          if (!sceneAssetsResult.success) {
            console.error('Scene assets upload failed:', sceneAssetsResult.error);
            return res.status(500).json({ 
              error: 'Failed to upload scene assets', 
              details: sceneAssetsResult.error 
            });
          }
          updateData.sceneAssets = sceneAssetsResult.url;
        } catch (uploadError) {
          console.error('Scene assets upload error:', uploadError);
          return res.status(500).json({ 
            error: 'Failed to upload scene assets', 
            details: uploadError.message 
          });
        }
      }
      
      // Upload download assets if provided
      if (files.downloadAssets && files.downloadAssets.length > 0) {
        try {
          const folderName = updateData.type === '3d-object' ? '3d-objects' : 
                           updateData.type === 'app' ? 'apps' : 'world-templates';
          const downloadAssetsResult = await DigitalOceanSpacesService.uploadFile(
            files.downloadAssets[0], 
            folderName
          );
          
          if (!downloadAssetsResult.success) {
            console.error('Download assets upload failed:', downloadAssetsResult.error);
            return res.status(500).json({ 
              error: 'Failed to upload download assets', 
              details: downloadAssetsResult.error 
            });
          }
          updateData.downloadAssets = downloadAssetsResult.url;
        } catch (uploadError) {
          console.error('Download assets upload error:', uploadError);
          return res.status(500).json({ 
            error: 'Failed to upload download assets', 
            details: uploadError.message 
          });
        }
      }
      
      // Update file size if download assets were uploaded
      if (files.downloadAssets && files.downloadAssets.length > 0) {
        const sizeInBytes = files.downloadAssets[0].size;
        updateData.fileSize = formatFileSize(sizeInBytes);
      }
    }
    
    // Update the item
    const updatedItem = await Item.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      item: updatedItem,
      message: 'Item updated successfully'
    });
  } catch (error) {
    console.error('Item update error:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message,
      type: 'server_error'
    });
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
      isFeatured: true,
      status: 'approved'
    })
    .select('-downloadAssets')
    .sort({ rating: -1, salesCount: -1 });
    
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
      isActive: true,
      status: 'approved'
    })
    .select('-downloadAssets')
    .sort({ rating: -1, salesCount: -1 });
    
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
      isActive: true,
      status: 'approved'
    })
    .select('-downloadAssets')
    .sort({ score: { $meta: 'textScore' } });
    
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get signed URL for 3D model or app preview file
router.get('/signed-url-3d/:itemId', async (req, res) => {
  try {
    const item = await Item.findById(req.params.itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    if (!item.sceneAssets) {
      return res.status(404).json({ 
        error: item.type === 'app' 
          ? 'No preview model available for this application' 
          : 'No 3D model available for this item' 
      });
    }
    
    // Extract the key from the sceneAssets URL
    let key;
    if (item.sceneAssets.includes(process.env.DO_SPACES_ITEMS_BUCKET_URL)) {
      // Extract key from full URL
      const urlParts = item.sceneAssets.split(`${process.env.DO_SPACES_ITEMS_BUCKET_URL}/`);
      key = urlParts[1];
    } else {
      // Assume it's already a key
      key = item.sceneAssets;
    }
    
    // Generate signed URL (expires in 1 hour)
    const signedUrl = await DigitalOceanSpacesService.getSignedUrl(key, 30);
    
    res.json({
      success: true,
      signedUrl: signedUrl,
      expiresIn: 3600
    });
    
  } catch (error) {
    console.error('Error generating signed URL for 3D model:', error);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});


// Get contributor stats (item count and total earned SOL)
router.get('/contributor/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user._id;

    // Count items created by this user
    const itemCount = await Item.countDocuments({ 'creator.id': userId });

    // Calculate total earned SOL from transactions
    // Find all successful transactions where items created by this user were purchased
    const userItems = await Item.find({ 'creator.id': userId }).select('_id priceUSD');
    const itemIds = userItems.map(item => item._id.toString());

    if (itemIds.length === 0) {
      return res.json({
        itemCount: 0,
        totalEarnedSOL: 0
      });
    }

    // Get all successful transactions for items created by this user
    const transactions = await Transaction.find({
      status: 'success',
      $or: [
        { item: { $in: itemIds } },
        { cartItems: { $in: itemIds } }
      ]
    }).populate('item', 'priceUSD creator');

    let totalEarnedSOL = 0;

    // Calculate earnings from single item purchases
    const singleItemTransactions = transactions.filter(t => t.item && itemIds.includes(t.item._id.toString()));
    for (const transaction of singleItemTransactions) {
      if (transaction.paymentMethod === 'solana') {
        // For Solana, amount is already in SOL, so 80% of that
        totalEarnedSOL += transaction.amount * 0.8;
      } else {
        // For Stripe, need to convert USD to SOL (approximate)
        // This is a simplified calculation - in production you might want to use actual conversion rates
        const solanaPaymentService = (await import('../services/solanaPaymentService.js')).default;
        const amountSOL = await solanaPaymentService.convertUsdToSol(transaction.amount);
        totalEarnedSOL += amountSOL * 0.8;
      }
    }

    // Calculate earnings from cart purchases
    const cartTransactions = transactions.filter(t => t.cartItems && t.cartItems.length > 0);
    for (const transaction of cartTransactions) {
      if (transaction.cartItems) {
        const cartItemIds = Array.isArray(transaction.cartItems) 
          ? transaction.cartItems.map(id => id.toString())
          : [];
        
        // Find which items in the cart belong to this creator
        const creatorItemsInCart = userItems.filter(item => 
          cartItemIds.includes(item._id.toString())
        );

        if (creatorItemsInCart.length > 0) {
          if (transaction.paymentMethod === 'solana') {
            // For cart purchases, we need to calculate proportional earnings
            // Get all items in the cart to calculate proportions
            const allCartItems = await Item.find({ _id: { $in: cartItemIds } }).select('priceUSD');
            const totalCartValueUSD = allCartItems.reduce((sum, item) => sum + (item.priceUSD || 0), 0);
            const creatorItemsValueUSD = creatorItemsInCart.reduce((sum, item) => sum + (item.priceUSD || 0), 0);
            
            if (totalCartValueUSD > 0) {
              const proportion = creatorItemsValueUSD / totalCartValueUSD;
              // transaction.amount is in SOL for Solana payments
              totalEarnedSOL += transaction.amount * proportion * 0.8;
            }
          } else {
            // For Stripe cart purchases
            const solanaPaymentService = (await import('../services/solanaPaymentService.js')).default;
            const allCartItems = await Item.find({ _id: { $in: cartItemIds } }).select('priceUSD');
            const totalCartValueUSD = allCartItems.reduce((sum, item) => sum + (item.priceUSD || 0), 0);
            const creatorItemsValueUSD = creatorItemsInCart.reduce((sum, item) => sum + (item.priceUSD || 0), 0);
            
            if (totalCartValueUSD > 0) {
              const proportion = creatorItemsValueUSD / totalCartValueUSD;
              const amountSOL = await solanaPaymentService.convertUsdToSol(transaction.amount);
              totalEarnedSOL += amountSOL * proportion * 0.8;
            }
          }
        }
      }
    }

    res.json({
      itemCount,
      totalEarnedSOL: parseFloat(totalEarnedSOL.toFixed(6))
    });
  } catch (error) {
    console.error('Error fetching contributor stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contributor stats',
      details: error.message 
    });
  }
});

export default router; 