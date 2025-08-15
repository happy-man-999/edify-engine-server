import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  defaultSnapshotId: {
    type: Number,
    required: true,
    default: 195000837 // Default to a valid DigitalOcean snapshot ID
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
  },
  // Crypto wallet addresses
  solanaWalletAddress: {
    type: String,
    required: true,
    default: '11111111111111111111111111111111' // Default placeholder
  },
  // Stripe configuration
  stripePublicKey: {
    type: String,
    required: true,
    default: '' // Will be set from env or admin
  },
  stripeSecretKey: {
    type: String,
    required: true,
    default: '' // Will be set from env or admin
  }
}, {
  timestamps: true
});

// Ensure only one settings document exists
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    // Create new settings with environment variable values
    settings = new this({
      solanaWalletAddress: '11111111111111111111111111111111',
      stripePublicKey: '',
      stripeSecretKey: ''
    });
    await settings.save();
  }
  return settings;
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings; 