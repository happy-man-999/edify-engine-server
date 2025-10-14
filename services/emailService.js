import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

class EmailService {
  constructor() {
    this.isConfigured = false;
    this.initializeSendGrid();
  }

  initializeSendGrid() {
    // Initialize SendGrid with API key
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      this.isConfigured = true;
      console.log('SendGrid email service initialized successfully');
    } else {
      console.warn('SendGrid not configured. Set SENDGRID_API_KEY environment variable.');
      console.warn('Email verification codes will be returned in API responses for development.');
    }
  }

  async sendVerificationCode(email, code, firstName = '') {
    if (!this.isConfigured) {
      throw new Error('Email service not configured');
    }

    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: 'Verify Your Email - Edify Engine',
      html: this.getVerificationEmailTemplate(code, firstName)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Verification email sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  getVerificationEmailTemplate(code, firstName) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Email</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #42677D;
            margin-bottom: 10px;
          }
          .verification-code {
            background: #f8f9fa;
            border: 2px solid #42677D;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 30px 0;
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 4px;
            color: #42677D;
            font-family: 'Courier New', monospace;
          }
          .instructions {
            background: #e3f2fd;
            border-left: 4px solid #42677D;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 14px;
            color: #666;
            text-align: center;
          }
          .button {
            display: inline-block;
            background: #42677D;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Edify Engine</div>
            <h1>Verify Your Email Address</h1>
          </div>
          
          <p>${greeting}</p>
          
          <p>Thank you for signing up for Edify Engine! To complete your registration, please verify your email address using the code below:</p>
          
          <div class="verification-code">${code}</div>
          
          <div class="instructions">
            <strong>Instructions:</strong>
            <ul>
              <li>Enter this 4-digit code in the verification modal</li>
              <li>This code will expire in 10 minutes</li>
              <li>If you didn't request this verification, please ignore this email</li>
            </ul>
          </div>
          
          <p>Once verified, you'll be able to access all the features of Edify Engine and start building your virtual worlds!</p>
          
          <div class="footer">
            <p>This email was sent by Edify Engine. If you have any questions, please contact our support team.</p>
            <p>&copy; 2024 Edify Engine. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendWelcomeEmail(email, firstName) {
    if (!this.isConfigured) {
      throw new Error('Email service not configured');
    }

    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: 'Welcome to Edify Engine!',
      html: this.getWelcomeEmailTemplate(firstName)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Welcome email sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      throw new Error('Failed to send welcome email');
    }
  }

  getWelcomeEmailTemplate(firstName) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Edify Engine</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 28px;
            font-weight: bold;
            color: #42677D;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            background: #42677D;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 14px;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">Edify Engine</div>
            <h1>Welcome to Edify Engine!</h1>
          </div>
          
          <p>Hi ${firstName},</p>
          
          <p>Congratulations! Your email has been verified and your Edify Engine account is now active.</p>
          
          <p>You can now:</p>
          <ul>
            <li>Create immersive 3D virtual worlds</li>
            <li>Customize your spaces with our powerful tools</li>
            <li>Collaborate with others in real-time</li>
            <li>Access our premium features and templates</li>
          </ul>
          
          <p>Ready to start building? Click the button below to access your dashboard:</p>
          
          <div style="text-align: center;">
            <a href="${process.env.CLIENT_URL || 'https://edifyengine.com'}/home" class="button">Go to Dashboard</a>
          </div>
          
          <div class="footer">
            <p>Thank you for choosing Edify Engine. We're excited to see what you'll create!</p>
            <p>&copy; 2024 Edify Engine. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Send admin notification for new signup
  async sendAdminSignupNotification(userEmail, userName) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping admin signup notification');
      return { success: false, reason: 'not_configured' };
    }

    const adminEmail = process.env.SENDGRID_FROM_EMAIL || 'info@edifyengine.com';
    
    const msg = {
      to: adminEmail,
      from: {
        email: process.env.ADMIN_NOTIFICATION_EMAIL || 'support@edifyengine.com',
        name: 'Edify Engine Notifications'
      },
      subject: '🎉 New User Signup - Edify Engine',
      html: this.getAdminSignupNotificationTemplate(userEmail, userName)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Admin signup notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send admin signup notification:', error);
      // Don't throw - we don't want to fail the signup if admin notification fails
      return { success: false, error: error.message };
    }
  }

  getAdminSignupNotificationTemplate(userEmail, userName) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New User Signup</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #42677D 0%, #5a8aa6 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -40px -40px 30px -40px;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #42677D;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-row {
            display: flex;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            min-width: 120px;
            color: #42677D;
          }
          .info-value {
            color: #333;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">🎉 New User Signup</h1>
          </div>
          
          <p>A new user has signed up for Edify Engine!</p>
          
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">User Name:</div>
              <div class="info-value">${userName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Email:</div>
              <div class="info-value">${userEmail}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Signup Time:</div>
              <div class="info-value">${timestamp}</div>
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Edify Engine.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // Send admin notification for payment received
  async sendAdminPaymentNotification(paymentData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping admin payment notification');
      return { success: false, reason: 'not_configured' };
    }

    const adminEmail = process.env.SENDGRID_FROM_EMAIL || 'info@edifyengine.com';
    
    // Format amount based on payment method
    const isSolana = paymentData.paymentMethod?.toLowerCase() === 'solana';
    const amountDisplay = isSolana 
      ? `${paymentData.amount.toFixed(3)} SOL`
      : `$${paymentData.amount.toFixed(2)}`;
    
    const msg = {
      to: adminEmail,
      from: {
        email: process.env.ADMIN_NOTIFICATION_EMAIL || 'support@edifyengine.com',
        name: 'Edify Engine Notifications'
      },
      subject: `💰 Payment Received (${paymentData.paymentMethod}) - ${amountDisplay}`,
      html: this.getAdminPaymentNotificationTemplate(paymentData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Admin payment notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send admin payment notification:', error);
      // Don't throw - we don't want to fail the payment if admin notification fails
      return { success: false, error: error.message };
    }
  }

  getAdminPaymentNotificationTemplate(paymentData) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const isSolana = paymentData.paymentMethod?.toLowerCase() === 'solana';
    const paymentMethodBadge = paymentData.paymentMethod === 'Stripe' 
      ? '<span style="background: #635bff; color: white; padding: 4px 12px; border-radius: 4px; font-weight: bold;">Stripe</span>'
      : '<span style="background: #14f195; color: #000; padding: 4px 12px; border-radius: 4px; font-weight: bold;">Solana</span>';
    
    // Format amount based on payment method
    const amountDisplay = isSolana 
      ? `${paymentData.amount.toFixed(3)} SOL`
      : `$${paymentData.amount.toFixed(2)} ${paymentData.currency || 'USD'}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Payment Received</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -40px -40px 30px -40px;
          }
          .amount-box {
            background: #f0fdf4;
            border: 2px solid #10b981;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .amount {
            font-size: 36px;
            font-weight: bold;
            color: #10b981;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #10b981;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .info-row {
            display: flex;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: bold;
            min-width: 150px;
            color: #10b981;
          }
          .info-value {
            color: #333;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">💰 Payment Received!</h1>
          </div>
          
          <div class="amount-box">
            <div class="amount">${amountDisplay}</div>
            <div style="margin-top: 10px;">${paymentMethodBadge}</div>
          </div>
          
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">Customer Name:</div>
              <div class="info-value">${paymentData.userName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Customer Email:</div>
              <div class="info-value">${paymentData.userEmail}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Item/Service:</div>
              <div class="info-value">${paymentData.itemName || 'N/A'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Payment Method:</div>
              <div class="info-value">${paymentData.paymentMethod}</div>
            </div>
            ${paymentData.transactionId ? `
            <div class="info-row">
              <div class="info-label">Transaction ID:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${paymentData.transactionId}</div>
            </div>
            ` : ''}
            <div class="info-row">
              <div class="info-label">Payment Time:</div>
              <div class="info-value">${timestamp}</div>
            </div>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Edify Engine.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // Send user notification for droplet creation complete
  async sendDropletCreatedNotification(userEmail, dropletData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping droplet created notification');
      return { success: false, reason: 'not_configured' };
    }

    const msg = {
      to: userEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: '🎉 Your World is Ready! - Edify Engine',
      html: this.getDropletCreatedNotificationTemplate(dropletData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Droplet created notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send droplet created notification:', error);
      // Don't throw - we don't want to fail if notification fails
      return { success: false, error: error.message };
    }
  }

  getDropletCreatedNotificationTemplate(dropletData) {
    const { dropletName, domain, firstName } = dropletData;
    const fullUrl = `https://${domain}`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your World is Ready!</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
          }
          .container {
            background: white;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #42677D 0%, #5a8aa6 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -40px -40px 30px -40px;
            text-align: center;
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 10px;
          }
          .world-box {
            background: linear-gradient(135deg, #e3f2fd 0%, #f8f9fa 100%);
            border: 2px solid #42677D;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .world-name {
            font-size: 24px;
            font-weight: bold;
            color: #42677D;
            margin-bottom: 10px;
          }
          .world-url {
            font-size: 16px;
            color: #666;
            word-break: break-all;
            margin-bottom: 15px;
          }
          .button {
            display: inline-block;
            background: #42677D;
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            margin: 10px 0;
            font-weight: bold;
          }
          .info-box {
            background: #fff3cd;
            border-left: 4px solid #ffc107;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .admin-code-box {
            background: #f0f9ff;
            border: 2px dashed #42677D;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .admin-code {
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 4px;
            color: #42677D;
            font-family: 'Courier New', monospace;
            background: white;
            padding: 15px;
            border-radius: 6px;
            display: inline-block;
            margin: 10px 0;
          }
          .features-list {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .features-list ul {
            margin: 0;
            padding-left: 20px;
          }
          .features-list li {
            margin: 8px 0;
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            font-size: 14px;
            color: #666;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">🎉</div>
            <h1 style="margin: 0;">Your World is Ready!</h1>
          </div>
          
          <p>Hi ${firstName},</p>
          
          <p>Great news! Your new virtual world has been successfully created and is now live!</p>
          
          <div class="world-box">
            <div class="world-name">${dropletName}</div>
            <div class="world-url">${fullUrl}</div>
            <a href="${fullUrl}" class="button">Visit Your World</a>
          </div>
          
          <div class="admin-code-box">
            <strong style="color: #42677D;">🔑 Admin Access Code</strong>
            <div class="admin-code">edify</div>
            <p style="margin: 10px 0 0 0; font-size: 14px; color: #666;">
              Use this code to access admin features in your world
            </p>
          </div>
          
          <div class="info-box">
            <strong>⚠️ Important:</strong> Your world may take a few more minutes to fully initialize. If you see a connection error, please wait 2-3 minutes and try again.
          </div>
          
          <div class="features-list">
            <strong>What's next?</strong>
            <ul>
              <li>Access your world using the link above</li>
              <li>Use the admin code <strong>"edify"</strong> for privileged access</li>
              <li>Customize your space with our building tools</li>
              <li>Invite others to explore your creation</li>
              <li>Monitor your world from your dashboard</li>
            </ul>
          </div>
          
          <p>If you have any questions or need assistance, please don't hesitate to reach out to our support team.</p>
          
          <div class="footer">
            <p>Happy building!</p>
            <p>&copy; 2024 Edify Engine. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

export default new EmailService();
