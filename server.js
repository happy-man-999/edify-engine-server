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

app.use('/api/auth', auth);
app.use('/api/solana', solana);
app.use('/api/stripe', stripe);
app.use('/api/signup-progress', signupProgress);

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