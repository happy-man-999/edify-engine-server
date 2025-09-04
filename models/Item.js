import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  // Basic item information
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  
  // Item type and category
  type: {
    type: String,
    enum: ['app', 'bundle', 'template', 'world', 'asset', 'service', '3d-object'],
    required: true
  },
  category: {
    type: String,
    enum: ['gaming', 'education', 'business', 'entertainment', 'social', 'creative', 'other'],
    required: true
  },
  
  // Pricing
  priceUSD: {
    type: Number,
    required: true,
    min: 0
  },
  discount: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Media
  image: {
    type: String,
    required: true
  },
  // 3D Object specific fields
  sceneAssets: {
    type: String // URL to the 3D scene assets stored in Digital Ocean Spaces (GLB file for preview)
  },
  downloadAssets: {
    type: String // URL to the downloadable assets stored in Digital Ocean Spaces (HYP file for download)
  },
  
  // Ratings and reviews
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  reviewCount: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // Item details
  features: [{
    type: String
  }],
  fileSize: {
    type: String,
    required: true
  },
  supportedPlatforms: [{
    type: String,
    enum: ['desktop', 'mobile', 'vr'],
    required: true
  }],

  // File & technical info
  installationInstructions: {
    type: String
  },
  
  // Bundle specific fields
  bundleItems: [{
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item'
    },
    itemTitle: String,
    itemType: String
  }],
  
  // Template/World specific fields
  worldType: {
    type: String
  },
  dimensions: {
    width: Number,
    height: Number,
    depth: Number
  },
  
  // Status and availability
  isActive: {
    type: Boolean,
    default: true
  },
  isFeatured: {
    type: Boolean,
    default: false
  },
  isLimited: {
    type: Boolean,
    default: false
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  visibility: {
    type: String,
    enum: ['featured', 'limitedEdition', 'private'],
    required: true,
    default: 'private'
  },
  
  // SEO and metadata
  tags: [{
    type: String
  }],
  
  // Sales and analytics
  salesCount: {
    type: Number,
    min: 0,
    default: 0
  },
  viewCount: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // Creator information
  creator: {
    name: String,
    id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true
});

// Custom validation for features array (max 5 features)
itemSchema.pre('validate', function(next) {
  if (this.features && this.features.length > 5) {
    return next(new Error('Maximum 5 features allowed'));
  }
  next();
});

// Indexes for better query performance
itemSchema.index({ type: 1, category: 1 });
itemSchema.index({ isActive: 1, isFeatured: 1 });
itemSchema.index({ priceUSD: 1 });
itemSchema.index({ rating: -1 });
itemSchema.index({ salesCount: -1 });
itemSchema.index({ title: 'text', description: 'text', tags: 'text' });

const Item = mongoose.model('Item', itemSchema);

export default Item; 