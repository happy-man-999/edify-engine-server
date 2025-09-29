/**
 * Webhook Service for managing real-time communication with frontend clients
 * Handles Server-Sent Events (SSE) for real-time updates
 */

class WebhookService {
  constructor() {
    // Map to store active webhook client connections
    // Key: userId, Value: response object
    this.webhookClients = new Map();
  }

  /**
   * Emit a webhook event to a specific user
   * @param {string} userId - The user ID to send the event to
   * @param {string} eventType - The type of event
   * @param {Object} data - The data to send with the event
   */
  emitWebhookEvent(userId, eventType, data) {
    const client = this.webhookClients.get(userId);
    if (client) {
      try {
        client.write(`data: ${JSON.stringify({ type: eventType, data })}\n\n`);
        console.log(`Webhook event sent to user ${userId}: ${eventType}`);
      } catch (error) {
        console.error(`Error sending webhook event to user ${userId}:`, error);
        // Remove the client if there's an error
        this.webhookClients.delete(userId);
      }
    } else {
      console.log(`No webhook client found for user ${userId}`);
    }
  }

  /**
   * Emit a webhook event to all connected clients
   * @param {string} eventType - The type of event
   * @param {Object} data - The data to send with the event
   */
  emitToAllClients(eventType, data) {
    for (const [userId, client] of this.webhookClients.entries()) {
      this.emitWebhookEvent(userId, eventType, data);
    }
  }

  /**
   * Add a webhook client connection
   * @param {string} userId - The user ID
   * @param {Object} response - The Express response object
   */
  addClient(userId, response) {
    // Remove any existing client for this user
    this.removeClient(userId);
    
    // Add the new client
    this.webhookClients.set(userId, response);
    console.log(`Webhook client added for user: ${userId}`);
    
    // Send initial connection message
    this.emitWebhookEvent(userId, 'connected', { 
      message: 'Webhook stream connected',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Remove a webhook client connection
   * @param {string} userId - The user ID
   */
  removeClient(userId) {
    if (this.webhookClients.has(userId)) {
      this.webhookClients.delete(userId);
      console.log(`Webhook client removed for user: ${userId}`);
    }
  }

  /**
   * Get the number of active connections
   * @returns {number} Number of active webhook clients
   */
  getActiveConnectionsCount() {
    return this.webhookClients.size;
  }

  /**
   * Get list of connected user IDs
   * @returns {Array<string>} Array of connected user IDs
   */
  getConnectedUsers() {
    return Array.from(this.webhookClients.keys());
  }

  /**
   * Check if a user has an active webhook connection
   * @param {string} userId - The user ID to check
   * @returns {boolean} True if user has an active connection
   */
  isUserConnected(userId) {
    return this.webhookClients.has(userId);
  }

  /**
   * Clean up inactive connections
   * This method can be called periodically to remove stale connections
   */
  cleanupInactiveConnections() {
    const inactiveUsers = [];
    
    for (const [userId, client] of this.webhookClients.entries()) {
      try {
        // Try to send a ping to check if connection is still alive
        client.write(`data: ${JSON.stringify({ type: 'ping', data: { timestamp: Date.now() } })}\n\n`);
      } catch (error) {
        // Connection is dead, mark for removal
        inactiveUsers.push(userId);
      }
    }
    
    // Remove inactive connections
    inactiveUsers.forEach(userId => this.removeClient(userId));
    
    if (inactiveUsers.length > 0) {
      console.log(`Cleaned up ${inactiveUsers.length} inactive webhook connections`);
    }
  }
}

// Create a singleton instance
const webhookService = new WebhookService();

export default webhookService;
