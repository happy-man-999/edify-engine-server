import mongoose from 'mongoose';

const snapshotSchema = new mongoose.Schema({
  snapshotId: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  dropletId: {
    type: Number,
    required: true
  },
  droplet: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Droplet',
    required: false
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sizeGigabytes: {
    type: Number,
    required: false
  },
  regions: [{
    type: String
  }],
  createdAt: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'available', 'deleted'],
    default: 'pending'
  },
  type: {
    type: String,
    enum: ['manual', 'automatic'],
    default: 'manual'
  },
  description: {
    type: String,
    required: false
  },
  sourceDomain: {
    type: String,
    required: false,
    description: 'The domain used in the source droplet (customDomain or subdomain.edifyengine.com)'
  }
}, {
  timestamps: true
});

// Index for faster queries
snapshotSchema.index({ snapshotId: 1 });
snapshotSchema.index({ user: 1 });
snapshotSchema.index({ dropletId: 1 });
snapshotSchema.index({ name: 1 });
snapshotSchema.index({ createdAt: -1 });

// Static method to check if snapshot name exists for a user
snapshotSchema.statics.nameExists = async function(userId, name) {
  const snapshot = await this.findOne({ 
    user: userId, 
    name: name,
    status: { $ne: 'deleted' }
  });
  return !!snapshot;
};

// Static method to get user snapshots
snapshotSchema.statics.getUserSnapshots = async function(userId, options = {}) {
  const query = { user: userId, status: { $ne: 'deleted' } };
  
  let queryBuilder = this.find(query).sort({ createdAt: -1 });
  
  if (options.limit) {
    queryBuilder = queryBuilder.limit(options.limit);
  }
  
  if (options.skip) {
    queryBuilder = queryBuilder.skip(options.skip);
  }
  
  return await queryBuilder.exec();
};

const Snapshot = mongoose.model('Snapshot', snapshotSchema);

export default Snapshot;

