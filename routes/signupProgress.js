import express from 'express';
import SignupProgress from '../models/SignupProgress.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get user's signup progress
router.get('/progress', authenticateToken, async (req, res) => {
  try {
    console.log('GET /progress - User:', req.user._id);
    
    let progress = await SignupProgress.findOne({ userId: req.user._id });
    console.log('GET /progress - Found progress:', !!progress);
    
    if (!progress) {
      console.log('GET /progress - No progress found, should redirect to signup');
      return res.json({ 
        hasProgress: false, 
        isCompleted: false,
        shouldRedirectToSignup: true 
      });
    }

    const isCompleted = progress.isSignupComplete();
    console.log('GET /progress - Progress found, isCompleted:', isCompleted);
    
    res.json({
      hasProgress: true,
      progress: progress,
      isCompleted: isCompleted,
      shouldRedirectToSignup: !isCompleted
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Save signup progress for a specific step
router.post('/progress', authenticateToken, async (req, res) => {
  try {
    console.log('POST /progress - User:', req.user._id);
    console.log('POST /progress - Body:', req.body);
    
    const { step, data } = req.body;
    
    let progress = await SignupProgress.findOne({ userId: req.user._id });
    console.log('POST /progress - Existing progress:', !!progress);
    
    if (!progress) {
      progress = new SignupProgress({ userId: req.user._id });
      console.log('POST /progress - Created new progress document');
    }

    // Update based on step
    switch (step) {
      case 2: // Account Info
        progress.accountInfo = {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          isGoogleAuth: data.isGoogleAuth || false
        };
        console.log('POST /progress - Updated account info');
        break;
        
      case 3: // Use Cases
        progress.useCases = data.useCases;
        console.log('POST /progress - Updated use cases:', data.useCases);
        break;
        
      case 4: // Persistence
        progress.isPersistent = data.isPersistent;
        console.log('POST /progress - Updated persistence');
        break;
        
      case 5: // Access Method
        progress.accessMethod = data.accessMethod;
        console.log('POST /progress - Updated access method');
        break;
        
      case 6: // Customization Level
        progress.customizationLevel = data.customizationLevel;
        console.log('POST /progress - Updated customization level');
        break;
        
      case 7: // Payment
        progress.payment = {
          isCompleted: true,
          stripeSessionId: data.stripeSessionId,
          amount: data.amount,
          completedAt: new Date()
        };
        progress.isCompleted = true;
        progress.completedAt = new Date();
        console.log('POST /progress - Updated payment');
        break;
        
      default:
        console.log('POST /progress - Invalid step:', step);
        return res.status(400).json({ message: 'Invalid step number' });
    }

    progress.currentStep = step;
    await progress.save();
    console.log('POST /progress - Saved progress, current step:', step);

    res.json({ 
      success: true, 
      progress: progress,
      isCompleted: progress.isSignupComplete()
    });
  } catch (error) {
    console.error('Save progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Complete signup (mark as fully completed)
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    let progress = await SignupProgress.findOne({ userId: req.user._id });
    
    if (!progress) {
      return res.status(404).json({ message: 'No signup progress found' });
    }

    progress.isCompleted = true;
    progress.completedAt = new Date();
    await progress.save();

    res.json({ 
      success: true, 
      message: 'Signup completed successfully' 
    });
  } catch (error) {
    console.error('Complete signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset signup progress (for testing or if user wants to restart)
router.delete('/progress', authenticateToken, async (req, res) => {
  try {
    await SignupProgress.findOneAndDelete({ userId: req.user._id });
    
    res.json({ 
      success: true, 
      message: 'Signup progress reset successfully' 
    });
  } catch (error) {
    console.error('Reset progress error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router; 