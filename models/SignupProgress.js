import mongoose from 'mongoose';

const signupProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  // Step 2: Account Information
  accountInfo: {
    firstName: String,
    lastName: String,
    email: String,
    isGoogleAuth: {
      type: Boolean,
      default: false
    }
  },
  // Step 3: Use Cases
  useCases: [{
    type: String,
    enum: [
      'Events',
      'Gaming',
      "I'll decide later"
    ]
  }],
  // Step 4: Persistence
  isPersistent: {
    type: String,
    enum: ['Yes', 'No', "I'll decide later"],
    default: null
  },
  // Step 5: Access Method
  accessMethod: {
    type: String,
    enum: ['Connect Domain', 'Use Free Domain', "I'll decide later"],
    default: null
  },
  // Step 6: Customization Level
  customizationLevel: {
    type: String,
    enum: ['basic-plan', 'premium-plan', 'start-plan', 'growth-plan', 'studio-plan', 'enterprise-plan'],
    default: null
  },
  // Step 7: Payment
  payment: {
    isCompleted: {
      type: Boolean,
      default: false
    },
    stripeSessionId: String,
    amount: Number,
    completedAt: Date
  },
  // Step 7: Enterprise Contact (alternative to payment)
  enterpriseContact: {
    isScheduled: {
      type: Boolean,
      default: false
    },
    contactData: {
      eventUuid: String,
      inviteeUuid: String,
      eventUri: String,
      inviteeUri: String,
      startTime: Date,
      endTime: Date,
      inviteeName: String,
      inviteeEmail: String,
      eventName: String,
      eventType: String,
      status: String,
      location: {
        join_url: String,
        status: String,
        type: { type: String, default: "" }
      },
      cancelUrl: String,
      rescheduleUrl: String,
      timezone: String
    },
    scheduledAt: Date
  },
  // Overall progress
  currentStep: {
    type: Number,
    min: 1,
    max: 7,
    default: 1
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  completedAt: Date
}, {
  timestamps: true
});

// Method to check if signup is complete
signupProgressSchema.methods.isSignupComplete = function() {
  return this.isCompleted && (this.payment.isCompleted || this.enterpriseContact.isScheduled);
};

// Method to get progress percentage
signupProgressSchema.methods.getProgressPercentage = function() {
  return Math.round((this.currentStep / 7) * 100);
};

export default mongoose.model('SignupProgress', signupProgressSchema); 