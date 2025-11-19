import express from 'express';
import DemoEmail from '../models/DemoEmail.js';
import emailService from '../services/emailService.js';

const router = express.Router();

// POST /api/demo-email - Capture email from demo world
router.post('/', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email) {
      return res.status(400).json({
        error: 'Email is required',
        message: 'Please provide a valid email address'
      });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Check if email already exists
    const emailExists = await DemoEmail.emailExists(email);
    
    // Get request metadata
    const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];
    const userAgent = req.get('user-agent');
    const referer = req.get('referer');

    if (emailExists) {
      // Email already exists, but return success to avoid revealing this
      return res.json({
        success: true,
        message: 'Email received successfully'
      });
    }

    // Create new demo email record
    const demoEmail = new DemoEmail({
      email: email.toLowerCase(),
      source: 'demo-world',
      ipAddress,
      userAgent,
      referer
    });

    await demoEmail.save();

    // Optionally send welcome email (non-blocking)
    try {
      await emailService.sendDemoWelcomeEmail(email);
    } catch (emailError) {
      // Log but don't fail the request if email sending fails
      console.error('Failed to send demo welcome email:', emailError);
    }

    // Log the submission
    console.log(`Demo email captured: ${email} from ${ipAddress}`);

    res.json({
      success: true,
      message: 'Email received successfully'
    });

  } catch (error) {
    console.error('Error processing demo email:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process email submission'
    });
  }
});

export default router;

