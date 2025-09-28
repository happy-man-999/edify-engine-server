import axios from 'axios';

class CalendlyService {
  constructor() {
    this.token = process.env.CALENDLY_TOKEN;
  }

  async getEventDetails(eventUri) {
    try {
      if (!this.token) {
        throw new Error('Calendly token not configured');
      }

      const response = await axios.get(eventUri, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching Calendly event details:', error);
      throw error;
    }
  }

  async getInviteeDetails(inviteeUri) {
    try {
      if (!this.token) {
        throw new Error('Calendly token not configured');
      }

      const response = await axios.get(inviteeUri, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching Calendly invitee details:', error);
      throw error;
    }
  }

  async getEventAndInviteeDetails(eventUri, inviteeUri) {
    try {
      const [eventDetails, inviteeDetails] = await Promise.all([
        this.getEventDetails(eventUri),
        this.getInviteeDetails(inviteeUri)
      ]);

      return {
        event: eventDetails,
        invitee: inviteeDetails
      };
    } catch (error) {
      console.error('Error fetching Calendly details:', error);
      throw error;
    }
  }
}

export default new CalendlyService();
