import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import calendlyService from '../services/calendlyService.js';

const router = express.Router();

// Get Calendly event and invitee details
router.post('/event-details', authenticateToken, async (req, res) => {
  try {
    const { eventUri, inviteeUri } = req.body;

    if (!eventUri || !inviteeUri) {
      return res.status(400).json({ 
        error: 'Event URI and Invitee URI are required' 
      });
    }

    const details = await calendlyService.getEventAndInviteeDetails(eventUri, inviteeUri);

    res.json({
      success: true,
      data: details
    });
  } catch (error) {
    console.error('Error fetching Calendly event details:', error);
    res.status(500).json({ 
      error: 'Failed to fetch event details',
      message: error.message 
    });
  }
});

export default router;
