import mongoose from 'mongoose';

const emailVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  code: {
    type: String,
    required: true,
    length: 4
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verifiedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
emailVerificationSchema.index({ email: 1 });
emailVerificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Static method to generate verification code
emailVerificationSchema.statics.generateCode = function() {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

// Instance method to check if code is valid
emailVerificationSchema.methods.isValidCode = function(inputCode) {
  return this.code === inputCode && this.expiresAt > new Date() && this.attempts < 3;
};

// Instance method to increment attempts
emailVerificationSchema.methods.incrementAttempts = function() {
  this.attempts += 1;
  return this.save();
};

// Instance method to mark as verified
emailVerificationSchema.methods.markAsVerified = function() {
  this.isVerified = true;
  this.verifiedAt = new Date();
  return this.save();
};

const EmailVerification = mongoose.model('EmailVerification', emailVerificationSchema);

export default EmailVerification;
