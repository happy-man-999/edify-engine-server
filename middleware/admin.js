import { authenticateToken } from './auth.js';

export const requireAdmin = async (req, res, next) => {
  try {
    // First authenticate the token
    await authenticateToken(req, res, (err) => {
      if (err) {
        return res.status(401).json({ message: 'Authentication required' });
      }
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
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'ADMIN_MIDDLEWARE_ERROR'
    });
  }
};

export const optionalAdmin = async (req, res, next) => {
  try {
    // First authenticate the token
    await authenticateToken(req, res, (err) => {
      if (err) {
        return res.status(401).json({ message: 'Authentication required' });
      }
    });

    // Check if user has admin role (optional - doesn't block if not admin)
    if (req.user && req.user.role === 'admin') {
      req.isAdmin = true;
    } else {
      req.isAdmin = false;
    }

    next();
  } catch (error) {
    return res.status(500).json({ 
      message: 'Internal server error',
      error: 'ADMIN_MIDDLEWARE_ERROR'
    });
  }
}; 