import mongoose from 'mongoose';

const actionSchema = new mongoose.Schema({
  actionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['snapshot_update', 'droplet_creation', 'backup_creation', 'migration', 'demo_world_update'],
    default: 'snapshot_update'
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'in_progress', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  error: {
    message: String,
    code: String,
    details: mongoose.Schema.Types.Mixed
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date,
    default: null
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  progressMessage: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Index for efficient queries
actionSchema.index({ userId: 1, status: 1 });
actionSchema.index({ type: 1, status: 1 });
actionSchema.index({ createdAt: -1 });

// Static method to create a new action
actionSchema.statics.createAction = async function(data) {
  const action = new this(data);
  await action.save();
  return action;
};

// Static method to update action status
actionSchema.statics.updateStatus = async function(actionId, status, data = {}) {
  const updateData = { 
    status,
    ...data
  };
  
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    updateData.completedAt = new Date();
  }
  
  return await this.findOneAndUpdate(
    { actionId },
    updateData,
    { new: true }
  );
};

// Static method to get action by ID
actionSchema.statics.getAction = async function(actionId) {
  return await this.findOne({ actionId });
};

// Static method to get actions by user
actionSchema.statics.getUserActions = async function(userId, options = {}) {
  const { type, status, limit = 50, skip = 0 } = options;
  
  const query = { userId };
  if (type) query.type = type;
  if (status) query.status = status;
  
  return await this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Instance method to update progress
actionSchema.methods.updateProgress = async function(progress, message = '') {
  this.progress = progress;
  this.progressMessage = message;
  if (progress === 100) {
    this.status = 'completed';
    this.completedAt = new Date();
  }
  return await this.save();
};

// Instance method to mark as failed
actionSchema.methods.markAsFailed = async function(error) {
  this.status = 'failed';
  this.error = error;
  this.completedAt = new Date();
  return await this.save();
};

// Instance method to mark as completed
actionSchema.methods.markAsCompleted = async function(result) {
  this.status = 'completed';
  this.result = result;
  this.completedAt = new Date();
  this.progress = 100;
  return await this.save();
};

const Action = mongoose.model('Action', actionSchema);

export default Action;
