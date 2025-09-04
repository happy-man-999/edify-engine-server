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
    default: 'other'
  },
  
  // Pricing
  priceUSD: {
    type: Number,
    required: true,
    min: 0
  },
  priceSOL: {
    type: Number,
    min: 0
  },
  originalPrice: {
    type: Number,
    min: 0
  },
  discount: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Media and assets
  image: {
    type: String,
    required: true
  },
  images: [{
    type: String
  }],
  video: {
    type: String
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
  requirements: {
    type: String
  },
  fileSize: {
    type: String
  },
  version: {
    type: String
  },
  downloadUrl: {
    type: String
  },
  license: {
    type: String,
    enum: ['free', 'personal', 'commercial', 'enterprise', 'custom'],
    default: 'personal'
  },
  supportedPlatforms: [{
    type: String,
    enum: ['web', 'windows', 'mac', 'linux', 'mobile', 'vr']
  }],
  updateFrequency: {
    type: String,
    enum: ['monthly', 'quarterly', 'biannual', 'annual', 'on-demand'],
    default: 'quarterly'
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
  
  // SEO and metadata
  tags: [{
    type: String
  }],
  keywords: [{
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
  },
  
  // Digital product specific fields
  installationInstructions: {
    type: String
  },
  changelog: [{
    version: String,
    date: Date,
    changes: [String]
  }],
  supportChannels: [{
    type: String,
    enum: ['email', 'chat', 'forum', 'documentation', 'video-tutorials', 'priority-support']
  }],
  demoUrl: {
    type: String
  },
  documentationUrl: {
    type: String
  }
}, {
  timestamps: true
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