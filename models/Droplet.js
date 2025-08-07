import mongoose from 'mongoose';

const dropletSchema = new mongoose.Schema({
  dropletId: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  sizeSlug: {
    type: String,
    required: true
  },
  regionSlug: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['new', 'active', 'off', 'archive'],
    default: 'new'
  },
  createdAt: {
    type: Date,
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  transaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: false
  },
  ipAddress: {
    type: String,
    required: false
  },
  memory: {
    type: Number,
    required: false
  },
  vcpus: {
    type: Number,
    required: false
  },
  disk: {
    type: Number,
    required: false
  },
  priceMonthly: {
    type: Number,
    required: false
  },
  tags: [{
    type: String
  }]
}, {
  timestamps: true
});

// Index for faster queries
dropletSchema.index({ dropletId: 1 });
dropletSchema.index({ user: 1 });
dropletSchema.index({ status: 1 });
dropletSchema.index({ createdAt: -1 });

const Droplet = mongoose.model('Droplet', dropletSchema);

export default Droplet; 