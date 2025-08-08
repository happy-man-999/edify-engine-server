import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  defaultSnapshotId: {
    type: Number,
    required: true,
    default: 123456
  },
  defaultDnsDomain: {
    type: String,
    required: true,
    default: 'edifyengine.com'
  },
  stripeMode: {
    type: String,
    enum: ['test', 'live'],
    default: 'live'
  },
  solanaMode: {
    type: String,
    enum: ['devnet', 'mainnet'],
    default: 'mainnet'
  },
  isTestMode: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this();
    await settings.save();
  }
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings; 