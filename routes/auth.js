import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/User.js';
import SignupProgress from '../models/SignupProgress.js';
import EmailVerification from '../models/EmailVerification.js';
import { generateToken } from '../utils/jwt.js';
import { authenticateToken } from '../middleware/auth.js';
import LogService from '../services/logService.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Google OAuth Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "/api/auth/google/callback"
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user already exists
    let user = await User.findOne({ googleId: profile.id });
    
    if (user) {
      user.lastLogin = new Date();
      await user.save();
      return done(null, user);
    }

    // Check if user exists with same email
    user = await User.findOne({ email: profile.emails[0].value });
    
    if (user) {
      // Link Google account to existing user
      user.googleId = profile.id;
      user.avatar = profile.photos[0]?.value || '';
      user.isEmailVerified = true;
      user.lastLogin = new Date();
      await user.save();
      return done(null, user);
    }

    // Create new user
    const newUser = new User({
      googleId: profile.id,
      firstName: profile.name.givenName,
      lastName: profile.name.familyName,
      email: profile.emails[0].value,
      avatar: profile.photos[0]?.value || '',
      isEmailVerified: true,
      lastLogin: new Date()
    });

    await newUser.save();
    
    // Log user signup
    try {
      await LogService.logUserSignup(newUser._id, {
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        googleId: newUser.googleId
      });
    } catch (logError) {
      console.error('Error logging user signup:', logError);
    }
    
    return done(null, newUser);
  } catch (error) {
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Register new user
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    // Validate input
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email,
      password
    });

    await user.save();

    // Log user signup
    try {
      await LogService.logUserSignup(user._id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      });
    } catch (logError) {
      console.error('Error logging user signup:', logError);
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Register new user with email verification
router.post('/signup-with-verification', async (req, res) => {
  try {
    const { firstName, lastName, email, password, verificationCode } = req.body;

    // Validate input
    if (!firstName || !lastName || !email || !password || !verificationCode) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Verify the email verification code
    const verification = await EmailVerification.findOne({ email });
    
    if (!verification) {
      return res.status(400).json({ message: 'No verification code found for this email' });
    }

    if (!verification.isVerified) {
      if (!verification.isValidCode(verificationCode)) {
        await verification.incrementAttempts();
        const remainingAttempts = 3 - verification.attempts;
        
        if (verification.attempts >= 3) {
          return res.status(400).json({ 
            message: 'Too many failed attempts. Please request a new verification code.',
            codeExpired: true
          });
        }

        return res.status(400).json({ 
          message: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
          remainingAttempts
        });
      }

      // Mark as verified
      await verification.markAsVerified();
    }

    // Create new user with verified email
    const user = new User({
      firstName,
      lastName,
      email,
      password,
      isEmailVerified: true
    });

    await user.save();

    // Log user signup
    try {
      await LogService.logUserSignup(user._id, {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      });
    } catch (logError) {
      console.error('Error logging user signup:', logError);
    }

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: user.toJSON()
    });
  } catch (error) {
    console.error('Signup with verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sign in user
router.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if user has password (not Google-only user)
    if (!user.password) {
      return res.status(401).json({ message: 'Please sign in with Google' });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Check signup progress
    const signupProgress = await SignupProgress.findOne({ userId: user._id });
    const hasCompletedSignup = signupProgress && signupProgress.isSignupComplete();

    res.json({
      message: 'Sign in successful',
      token,
      user: user.toJSON(),
      hasCompletedSignup,
      shouldRedirectToSignup: !hasCompletedSignup
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Google OAuth routes
router.get('/google', (req, res, next) => {
  const from = req.query.from;
  if (from === 'signup') {
    // Store the signup context in session or pass it through state
    req.session.signupContext = true;
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const token = generateToken(req.user._id);
    
    // Check if this was initiated from signup
    const fromSignup = req.session?.signupContext || req.query.state === 'signup';
    
    if (fromSignup) {
      // Redirect back to signup with special parameters
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/signup?googleAuthCompleted=true&token=${token}`);
    } else {
      // Normal auth flow - redirect to auth callback
      res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/auth-callback?token=${token}`);
    }
  }
);

// Get current user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({ user: req.user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, avatar } = req.body;
    const updates = {};

    if (firstName) updates.firstName = firstName;
    if (lastName) updates.lastName = lastName;
    if (avatar) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    res.json({ user });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sign out (client-side token removal)
router.post('/signout', (req, res) => {
  res.json({ message: 'Signed out successfully' });
});

export default router; 