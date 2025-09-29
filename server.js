import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import passport from 'passport';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import solana from './routes/solana.js';
import stripe from './routes/stripe.js';
import auth from './routes/auth.js';
import signupProgress from './routes/signupProgress.js';
import admin from './routes/admin.js';
import items from './routes/items.js';
import user from './routes/user.js';
import dns from './routes/dns.js';
import calendly from './routes/calendly.js';
import webhooks from './routes/webhooks.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/edifyengine')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.set('trust proxy', true);
// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Add request logging middleware
app.use((req, res, next) => {
  //console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Serve static files from client/dist
app.use(express.static('../client/dist'));

// Routes
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the server!' });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Middleware to ensure API responses are JSON
app.use('/api', (req, res, next) => {
  // Set default content-type for API routes
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use('/api/auth', auth);
app.use('/api/solana', solana);
app.use('/api/stripe', stripe);
app.use('/api/signup-progress', signupProgress);
app.use('/api/admin', admin);
app.use('/api/items', items);
app.use('/api/user', user);
app.use('/api/dns', dns);
app.use('/api/calendly', calendly);
app.use('/api/webhooks', webhooks);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  // Ensure we always return JSON for API routes
  if (req.path.startsWith('/api/')) {
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      type: 'server_error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } else {
    // For non-API routes, you might want to handle differently
    res.status(500).send('Internal Server Error');
  }
});

// Catch-all for React Router paths (must be after API routes)
app.use((req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile('index.html', { root: '../client/dist' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});