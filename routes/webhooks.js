import { Router } from 'express';
import jwt from 'jsonwebtoken';
import webhookService from '../services/webhookService.js';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();

// SSE endpoint for frontend webhooks
router.get('/webhook-stream/:userId', async (req, res) => {
  const { userId } = req.params;
  const { token } = req.query;
  
  // Verify token from query parameter
  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }
  
  // For development, accept any token
  if (process.env.NODE_ENV === 'development') {
    // Accept any token in development
  } else {
    // In production, verify the JWT token properly
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized access to webhook stream' });
      }
    } catch (jwtError) {
      return res.status(403).json({ error: 'Invalid authorization token' });
    }
  }
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });
  
  // Store client connection using webhook service
  webhookService.addClient(userId, res);
  
  // Handle client disconnect
  req.on('close', () => {
    webhookService.removeClient(userId);
    console.log(`Webhook client disconnected for user: ${userId}`);
  });
  
  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'ping', data: { timestamp: Date.now() } })}\n\n`);
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

export default router;
