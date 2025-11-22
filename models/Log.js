import mongoose from 'mongoose';

const logSchema = new mongoose.Schema({
  timestamp: {
    type: Date,
    required: true,
    default: Date.now
  },
  level: {
    type: String,
    required: true,
    enum: ['info', 'success', 'warning', 'error'],
    default: 'info'
  },
  type: {
    type: String,
    required: true,
    enum: ['user_signup', 'user_created', 'user_updated', 'user_deleted', 'user_role_changed', 'purchase', 'transaction_created', 'droplet_created', 'droplet_restarted', 'droplet_terminated', 'droplet_reprovisioned', 'droplet_deleted', 'subdomain_assigned', 'settings_updated', 'error', 'webhook', 'provisioning', 'subdomain_updated', 'item_status_changed', 'item_files_deleted'],
    default: 'info'
  },
  message: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    required: true,
    enum: ['completed', 'failed', 'in_progress', 'pending'],
    default: 'completed'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: false
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: false
  },
  dropletId: {
    type: Number,
    required: false
  },
  error: {
    type: String,
    required: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for faster queries
logSchema.index({ timestamp: -1 });
logSchema.index({ level: 1 });
logSchema.index({ type: 1 });
logSchema.index({ userId: 1 });

const Log = mongoose.model('Log', logSchema);

export default Log; 