import express from 'express';
import dotenv from 'dotenv';
import https from 'https';
import Droplet from '../models/Droplet.js';

dotenv.config();

const router = express.Router();

// Check domain health endpoint
router.get('/check-health', async (req, res) => {
  try {
    const { domain } = req.query;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain parameter is required' });
    }

    const healthUrl = `https://${domain}/health`;
    console.log('Server checking domain health at:', healthUrl);

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    // Create an insecure HTTPS agent (equivalent to curl --insecure)
    const insecureAgent = new https.Agent({
      rejectUnauthorized: false
    });

    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
      agent: insecureAgent,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      res.json({
        success: true,
        status: data.status,
        domain,
        httpStatus: response.status
      });
    } else {
      res.json({
        success: false,
        status: 'error',
        domain,
        httpStatus: response.status,
        message: `Domain responded with HTTP ${response.status}`
      });
    }
    
  } catch (error) {
    console.error('Health check error:', error);
    
    if (error.name === 'AbortError') {
      res.json({
        success: false,
        status: 'timeout',
        domain: req.query.domain,
        protocol: req.query.protocol,
        message: 'Request timed out'
      });
    } else {
      res.json({
        success: false,
        status: 'error',
        domain: req.query.domain,
        protocol: req.query.protocol,
        message: error.message
      });
    }
  }
});

// Get droplet IP address endpoint
router.get('/droplet/:dropletId/ip', async (req, res) => {
  try {
    const { dropletId } = req.params;
    
    if (!dropletId) {
      return res.status(400).json({ error: 'Droplet ID parameter is required' });
    }

    // Find the droplet in the database
    const droplet = await Droplet.findOne({ dropletId: parseInt(dropletId) });
    
    if (!droplet) {
      return res.status(404).json({ 
        error: 'Droplet not found',
        message: `Droplet with ID ${dropletId} not found`
      });
    }

    if (!droplet.ipAddress) {
      return res.status(404).json({ 
        error: 'IP address not available',
        message: `Droplet ${dropletId} does not have an IP address yet. It may still be being created.`
      });
    }

    res.json({
      dropletId: droplet.dropletId,
      name: droplet.name,
      ipAddress: droplet.ipAddress,
      status: droplet.status
    });
    
  } catch (error) {
    console.error('Get droplet IP error:', error);
    res.status(500).json({ 
      error: 'Failed to get droplet IP address',
      message: error.message 
    });
  }
});

export default router;
