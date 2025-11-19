import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  signature: {
    type: String,
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['solana', 'stripe'],
    default: 'solana'
  },
  status: {
    type: String,
    required: true,
    enum: ['success', 'failed', 'pending'],
    default: 'success'
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
    required: false
  },
  itemType: {
    type: String,
    enum: ['new-world', 'item-purchase', 'cart-purchase', 'basic-plan', 'premium-plan', 'start-plan', 'growth-plan', 'studio-plan', 'enterprise-plan', 'custom-domain', 'other'],
    required: false
  },
  cartItems: {
    type: [String],
    required: false
  }
}, {
  timestamps: true
});

// Index for faster queries
transactionSchema.index({ signature: 1 });
transactionSchema.index({ user: 1 });
transactionSchema.index({ date: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

export default Transaction; 