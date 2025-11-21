import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Decimal128 } from 'mongodb';

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password not required if using Google OAuth
    },
    minlength: 8
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  avatar: {
    type: String,
    default: ''
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['lead', 'user', 'admin'],
    default: 'lead'
  },
  isContributor: {
    type: Boolean,
    default: false
  },
  plan: {
    type: String,
    enum: ['basic', 'premium', 'enterprise', 'starter', 'growth', 'studio'],
    default: 'basic'
  },
  lastLogin: {
    type: Date,
    default: Date.now
  },
  balance: {
    type: mongoose.Schema.Types.Decimal128,
    default: () => Decimal128.fromString('0'),
    get: function(value) {
      // Convert Decimal128 to Number for API responses, preserving precision
      if (value) {
        return parseFloat(value.toString());
      }
      return 0;
    },
    set: function(value) {
      // Convert Number to Decimal128 for storage, preserving precision
      if (value === null || value === undefined) {
        return Decimal128.fromString('0');
      }
      // Convert to string first to preserve precision, then to Decimal128
      // Use up to 18 decimal places for maximum precision (Decimal128 supports up to 34 digits)
      if (typeof value === 'number') {
        // Convert to string with enough precision, avoiding scientific notation
        const valueStr = value.toFixed(18).replace(/\.?0+$/, ''); // Remove trailing zeros
        return Decimal128.fromString(valueStr);
      }
      return Decimal128.fromString(value.toString());
    }
  },
  solanaAddress: {
    type: String
  },
  stripeCustomerId: {
    type: String,
    sparse: true,
    index: true
  },
  stripeSubscriptionId: {
    type: String,
    sparse: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Method to get user profile (without password)
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

export default mongoose.model('User', userSchema); 