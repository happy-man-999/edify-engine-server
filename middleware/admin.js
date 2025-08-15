import { authenticateToken } from './auth.js';

export const requireAdmin = async (req, res, next) => {
  try {
    // First authenticate the token
    await new Promise((resolve, reject) => {
      authenticateToken(req, res, (err) => {
        if (err) {
          reject(new Error('Authentication required'));
        } else {
          resolve();
        }
      });
    });

    // Check if user has admin role
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ 
        message: 'Admin access required',
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: 'Internal server error',
        error: 'ADMIN_MIDDLEWARE_ERROR'
      });
    }
  }
};

export const optionalAdmin = async (req, res, next) => {
  try {
    // First authenticate the token
    await new Promise((resolve, reject) => {
      authenticateToken(req, res, (err) => {
        if (err) {
          reject(new Error('Authentication required'));
        } else {
          resolve();
        }
      });
    });

    // Check if user has admin role (optional - doesn't block if not admin)
    if (req.user && req.user.role === 'admin') {
      req.isAdmin = true;
    } else {
      req.isAdmin = false;
    }

    next();
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ 
        message: 'Internal server error',
        error: 'ADMIN_MIDDLEWARE_ERROR'
      });
    }
  }
}; 