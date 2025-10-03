import express from 'express';
import EmailVerification from '../models/EmailVerification.js';
import emailService from '../services/emailService.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Send verification code
router.post('/send-code', async (req, res) => {
  try {
    const { email, firstName } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if email format is valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Please enter a valid email address' });
    }

    // Generate verification code
    const code = EmailVerification.generateCode();

    // Delete any existing verification records for this email
    await EmailVerification.deleteMany({ email });

    // Create new verification record
    const verification = new EmailVerification({
      email,
      code
    });

    await verification.save();

    // Send verification email
    try {
      await emailService.sendVerificationCode(email, code, firstName);
      
      res.json({
        success: true,
        message: 'Verification code sent successfully',
        email: email
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      
      // Still save the verification record even if email fails
      res.json({
        success: true,
        message: 'Verification code generated (email service unavailable)',
        email: email,
        code: code // Include code in response for development/testing
      });
    }
  } catch (error) {
    console.error('Send verification code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify code
router.post('/verify-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    // Validate input
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and code are required' });
    }

    // Find verification record
    const verification = await EmailVerification.findOne({ email });

    if (!verification) {
      return res.status(400).json({ message: 'No verification code found for this email' });
    }

    // Check if already verified
    if (verification.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Check if code is valid
    if (!verification.isValidCode(code)) {
      // Increment attempts
      await verification.incrementAttempts();
      
      const remainingAttempts = 3 - verification.attempts;
      
      if (verification.attempts >= 3) {
        return res.status(400).json({ 
          message: 'Too many failed attempts. Please request a new verification code.',
          codeExpired: true
        });
      }

      return res.status(400).json({ 
        message: `Invalid code. ${remainingAttempts} attempts remaining.`,
        remainingAttempts
      });
    }

    // Mark as verified
    await verification.markAsVerified();

    res.json({
      success: true,
      message: 'Email verified successfully',
      email: email
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resend verification code
router.post('/resend-code', async (req, res) => {
  try {
    const { email, firstName } = req.body;

    // Validate input
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Check if there's an existing verification record
    const existingVerification = await EmailVerification.findOne({ email });

    if (!existingVerification) {
      return res.status(400).json({ message: 'No verification code found for this email' });
    }

    // Check if already verified
    if (existingVerification.isVerified) {
      return res.status(400).json({ message: 'Email already verified' });
    }

    // Check if too many attempts
    if (existingVerification.attempts >= 3) {
      return res.status(400).json({ 
        message: 'Too many failed attempts. Please wait before requesting a new code.',
        tooManyAttempts: true
      });
    }

    // Generate new code
    const newCode = EmailVerification.generateCode();
    
    // Update the verification record
    existingVerification.code = newCode;
    existingVerification.expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    existingVerification.attempts = 0; // Reset attempts
    await existingVerification.save();

    // Send verification email
    try {
      await emailService.sendVerificationCode(email, newCode, firstName);
      
      res.json({
        success: true,
        message: 'New verification code sent successfully',
        email: email
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      
      res.json({
        success: true,
        message: 'New verification code generated (email service unavailable)',
        email: email,
        code: newCode // Include code in response for development/testing
      });
    }
  } catch (error) {
    console.error('Resend verification code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check verification status
router.get('/status/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const verification = await EmailVerification.findOne({ email });

    if (!verification) {
      return res.status(404).json({ message: 'No verification record found' });
    }

    res.json({
      email: verification.email,
      isVerified: verification.isVerified,
      attempts: verification.attempts,
      expiresAt: verification.expiresAt,
      verifiedAt: verification.verifiedAt
    });
  } catch (error) {
    console.error('Check verification status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
