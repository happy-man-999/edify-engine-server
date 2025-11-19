import mongoose from 'mongoose';

const demoEmailSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true
  },
  source: {
    type: String,
    default: 'demo-world',
    enum: ['demo-world', 'other']
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  referer: {
    type: String
  }
}, {
  timestamps: true
});

// Index for efficient queries
demoEmailSchema.index({ email: 1 });
demoEmailSchema.index({ createdAt: -1 });

// Static method to check if email already exists
demoEmailSchema.statics.emailExists = async function(email) {
  const count = await this.countDocuments({ email: email.toLowerCase() });
  return count > 0;
};

const DemoEmail = mongoose.model('DemoEmail', demoEmailSchema);

export default DemoEmail;

