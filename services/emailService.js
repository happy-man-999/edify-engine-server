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
          .button:hover {
            color: rgba(255,255,255,0.8);
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
            <p style="margin: 15px 0 0 0; font-size: 14px; color: #666;">
              <strong>How to use:</strong><br>
              Click <strong>'Enter'</strong> to open chat and type:<br>
              <code style="background: white; padding: 5px 10px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 16px; color: #42677D;">/admin edify</code>
            </p>
          </div>
          
          <div class="info-box">
            <strong>⚠️ Important:</strong> Your world may take a few more minutes to fully initialize. If you see a connection error, please wait 2-3 minutes and try again.
          </div>
          
          <div class="features-list">
            <strong>What's next?</strong>
            <ul>
              <li>Access your world using the link above</li>
              <li>Press <strong>'Enter'</strong> to open chat, then type <code style="background: #e3f2fd; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace;">/admin edify</code> for privileged access</li>
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

  // Send welcome email for demo world email capture
  async sendDemoWelcomeEmail(email) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping demo welcome email');
      return { success: false, reason: 'not_configured' };
    }

    const msg = {
      to: email,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: 'Welcome to Edify Demo World! 🎉',
      html: this.getDemoWelcomeEmailTemplate()
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Demo welcome email sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send demo welcome email:', error);
      // Don't throw - we don't want to fail the demo email capture if email sending fails
      return { success: false, error: error.message };
    }
  }

  getDemoWelcomeEmailTemplate() {
    const signupUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to Edify Demo World</title>
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
            background: linear-gradient(135deg, rgba(100, 100, 255, 0.9) 0%, rgba(200, 100, 255, 0.9) 100%);
            color: white;
            padding: 14px 28px;
            text-decoration: none;
            border-radius: 8px;
            margin: 20px 0;
            font-weight: 600;
          }
          .features-box {
            background: #f8f9fa;
            border-left: 4px solid #42677D;
            padding: 20px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .features-box ul {
            margin: 10px 0;
            padding-left: 20px;
          }
          .features-box li {
            margin: 8px 0;
          }
          .offer-box {
            background: linear-gradient(135deg, rgba(255, 200, 0, 0.1) 0%, rgba(255, 150, 0, 0.1) 100%);
            border: 2px solid rgba(255, 200, 0, 0.3);
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            text-align: center;
          }
          .offer-badge {
            display: inline-block;
            background: linear-gradient(135deg, rgba(0, 200, 0, 0.2) 0%, rgba(0, 150, 0, 0.2) 100%);
            border: 1px solid rgba(0, 200, 0, 0.3);
            border-radius: 6px;
            padding: 6px 12px;
            font-size: 14px;
            font-weight: 600;
            color: #00c800;
            margin-bottom: 10px;
          }
          .price {
            font-size: 24px;
            font-weight: bold;
            color: #4ade80;
            margin: 10px 0;
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
            <h1>Thanks for Trying Our Demo! 🎉</h1>
          </div>
          
          <p>Hi there,</p>
          
          <p>Thank you for exploring the Edify Demo World! We hope you enjoyed experiencing our virtual world platform.</p>
          
          <div class="features-box">
            <strong>What you can do with Edify:</strong>
            <ul>
              <li>Create immersive 3D virtual worlds</li>
              <li>Customize your spaces with powerful building tools</li>
              <li>Collaborate with others in real-time</li>
              <li>Access premium features and templates</li>
              <li>Deploy your world on your own domain</li>
            </ul>
          </div>
          
          <div class="offer-box">
            <div class="offer-badge">Special Offer: 25% Off</div>
            <h2 style="margin: 10px 0;">Save 25% on Starter Annual</h2>
            <div class="price">$189/year</div>
            <p style="margin: 10px 0; color: #666;">Regular yearly: $252/year</p>
            <p style="margin: 15px 0 0 0; font-size: 14px;">Save $63 compared to yearly billing</p>
          </div>
          
          <div style="text-align: center;">
            <a href="${signupUrl}/signup" class="button">Claim Your Offer</a>
          </div>
          
          <p>Ready to build your own virtual world? Sign up now and unlock the full power of Edify Engine!</p>
          
          <div class="footer">
            <p>Questions? We're here to help! Just reply to this email.</p>
            <p>&copy; 2024 Edify Engine. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Send admin notification for contributor item upload
  async sendAdminItemUploadNotification(itemData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping admin item upload notification');
      return { success: false, reason: 'not_configured' };
    }

    const adminEmail = process.env.SENDGRID_FROM_EMAIL || 'info@edifyengine.com';
    
    const msg = {
      to: adminEmail,
      from: {
        email: process.env.ADMIN_NOTIFICATION_EMAIL || 'support@edifyengine.com',
        name: 'Edify Engine Notifications'
      },
      subject: `📦 New Item Upload - ${itemData.title}`,
      html: this.getAdminItemUploadNotificationTemplate(itemData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Admin item upload notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send admin item upload notification:', error);
      // Don't throw - we don't want to fail the upload if admin notification fails
      return { success: false, error: error.message };
    }
  }

  getAdminItemUploadNotificationTemplate(itemData) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const adminUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    const itemManagementUrl = `${adminUrl}/admin/items`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Item Upload</title>
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
          .item-box {
            background: #f0f9ff;
            border: 2px solid #42677D;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .item-title {
            font-size: 24px;
            font-weight: bold;
            color: #42677D;
            margin-bottom: 10px;
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
            min-width: 150px;
            color: #42677D;
          }
          .info-value {
            color: #333;
            word-break: break-word;
          }
          .button {
            display: inline-block;
            background: #42677D;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
          }
          .status-unapproved {
            background: #fef3c7;
            color: #92400e;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">📦 New Item Upload</h1>
          </div>
          
          <p>A contributor has uploaded a new item that requires your approval.</p>
          
          <div class="item-box">
            <div class="item-title">${itemData.title}</div>
            <div class="status-badge status-unapproved">Status: ${itemData.status || 'unapproved'}</div>
          </div>
          
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">Contributor:</div>
              <div class="info-value">${itemData.contributorName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Contributor Email:</div>
              <div class="info-value">${itemData.contributorEmail}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Item Type:</div>
              <div class="info-value">${itemData.type}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Category:</div>
              <div class="info-value">${itemData.category}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Price:</div>
              <div class="info-value">$${itemData.priceUSD?.toFixed(2) || '0.00'}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Item ID:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${itemData.itemId}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Upload Time:</div>
              <div class="info-value">${timestamp}</div>
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${itemManagementUrl}" class="button">Review Item</a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Edify Engine.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // Send admin notification for contributor withdrawal request
  async sendAdminWithdrawalRequestNotification(withdrawalData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping admin withdrawal request notification');
      return { success: false, reason: 'not_configured' };
    }

    const adminEmail = process.env.SENDGRID_FROM_EMAIL || 'info@edifyengine.com';
    
    const msg = {
      to: adminEmail,
      from: {
        email: process.env.ADMIN_NOTIFICATION_EMAIL || 'support@edifyengine.com',
        name: 'Edify Engine Notifications'
      },
      subject: `💰 Withdrawal Request - ${withdrawalData.amount.toFixed(3)} SOL`,
      html: this.getAdminWithdrawalRequestNotificationTemplate(withdrawalData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Admin withdrawal request notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send admin withdrawal request notification:', error);
      // Don't throw - we don't want to fail the withdrawal request if admin notification fails
      return { success: false, error: error.message };
    }
  }

  getAdminWithdrawalRequestNotificationTemplate(withdrawalData) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const adminUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    const withdrawalManagementUrl = `${adminUrl}/admin`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Withdrawal Request</title>
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
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -40px -40px 30px -40px;
          }
          .amount-box {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .amount {
            font-size: 36px;
            font-weight: bold;
            color: #f59e0b;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #f59e0b;
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
            color: #f59e0b;
          }
          .info-value {
            color: #333;
            word-break: break-word;
          }
          .button {
            display: inline-block;
            background: #f59e0b;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
            background: #fef3c7;
            color: #92400e;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">💰 Withdrawal Request</h1>
          </div>
          
          <p>A contributor has requested a withdrawal that requires your approval.</p>
          
          <div class="amount-box">
            <div class="amount">${withdrawalData.amount.toFixed(3)} SOL</div>
            <div class="status-badge" style="margin-top: 10px;">Status: ${withdrawalData.status || 'pending'}</div>
          </div>
          
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">Contributor:</div>
              <div class="info-value">${withdrawalData.contributorName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Contributor Email:</div>
              <div class="info-value">${withdrawalData.contributorEmail}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Solana Address:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${withdrawalData.solanaAddress}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Withdrawal ID:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${withdrawalData.withdrawalId}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Request Time:</div>
              <div class="info-value">${timestamp}</div>
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${withdrawalManagementUrl}" class="button">Review Withdrawal</a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Edify Engine.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // Send notification to item owner when their item is purchased
  async sendItemOwnerPurchaseNotification(purchaseData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping item owner purchase notification');
      return { success: false, reason: 'not_configured' };
    }

    // Only send if owner email is provided
    if (!purchaseData.ownerEmail) {
      console.log('No owner email provided - skipping item owner purchase notification');
      return { success: false, reason: 'no_owner_email' };
    }
    
    const msg = {
      to: purchaseData.ownerEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: `💰 Your Item Was Purchased - ${purchaseData.itemTitle}`,
      html: this.getItemOwnerPurchaseNotificationTemplate(purchaseData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Item owner purchase notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send item owner purchase notification:', error);
      // Don't throw - we don't want to fail the purchase if notification fails
      return { success: false, error: error.message };
    }
  }

  getItemOwnerPurchaseNotificationTemplate(purchaseData) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const isSolana = purchaseData.paymentMethod?.toLowerCase() === 'solana';
    const amountDisplay = isSolana 
      ? `${purchaseData.amount.toFixed(3)} SOL`
      : `$${purchaseData.amount.toFixed(2)} ${purchaseData.currency || 'USD'}`;
    
    const earningsDisplay = isSolana
      ? `${purchaseData.earnings.toFixed(3)} SOL`
      : `$${purchaseData.earnings.toFixed(2)} ${purchaseData.currency || 'USD'}`;

    const contributorUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    const contributeUrl = `${contributorUrl}/contribute`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Item Was Purchased</title>
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
          .item-box {
            background: #f0fdf4;
            border: 2px solid #10b981;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .item-title {
            font-size: 24px;
            font-weight: bold;
            color: #10b981;
            margin-bottom: 10px;
          }
          .amount-box {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .amount {
            font-size: 32px;
            font-weight: bold;
            color: #f59e0b;
            margin-bottom: 5px;
          }
          .earnings-box {
            background: #dbeafe;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
            text-align: center;
          }
          .items-list-box {
            background: #f0fdf4;
            border-left: 4px solid #10b981;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .items-list {
            margin: 10px 0;
            padding-left: 20px;
          }
          .items-list li {
            margin: 8px 0;
            color: #333;
          }
          .earnings {
            font-size: 24px;
            font-weight: bold;
            color: #3b82f6;
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
          .button {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
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
            <h1 style="margin: 0;">💰 Your Item Was Purchased!</h1>
          </div>
          
          <p>Great news! Someone just purchased your item!</p>
          
          <div class="item-box">
            <div class="item-title">${purchaseData.itemTitle}</div>
          </div>
          
          ${purchaseData.itemsList ? `
          <div class="items-list-box">
            <strong style="color: #10b981; display: block; margin-bottom: 10px;">Items Purchased:</strong>
            <ul class="items-list">
              ${purchaseData.itemsList.split(', ').map(item => `<li>${item}</li>`).join('')}
            </ul>
          </div>
          ` : ''}
          
          <div class="amount-box">
            <div style="color: #666; font-size: 14px; margin-bottom: 5px;">Purchase Amount</div>
            <div class="amount">${amountDisplay}</div>
            <div style="color: #666; font-size: 12px; margin-top: 5px;">Payment Method: ${purchaseData.paymentMethod}</div>
          </div>
          
          <div class="earnings-box">
            <div style="color: #666; font-size: 14px; margin-bottom: 5px;">Your Earnings (80%)</div>
            <div class="earnings">${earningsDisplay}</div>
            <div style="color: #666; font-size: 12px; margin-top: 5px;">Credited to your account balance</div>
          </div>
          
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">Buyer Name:</div>
              <div class="info-value">${purchaseData.buyerName}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Buyer Email:</div>
              <div class="info-value">${purchaseData.buyerEmail}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Item Type:</div>
              <div class="info-value">${purchaseData.itemType}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Transaction ID:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${purchaseData.transactionId}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Purchase Time:</div>
              <div class="info-value">${timestamp}</div>
            </div>
          </div>
          
          <div style="text-align: center;">
            <a href="${contributeUrl}" class="button">View Your Earnings</a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            Thank you for contributing to Edify Engine! Your earnings have been automatically credited to your account balance.
          </p>
          
          <div class="footer">
            <p>This is an automated notification from Edify Engine.</p>
            <p>&copy; 2024 Edify Engine. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Send withdrawal approval notification to user
  async sendWithdrawalApprovalNotification(withdrawalData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping withdrawal approval notification');
      return { success: false, reason: 'not_configured' };
    }

    // Only send if user email is provided
    if (!withdrawalData.userEmail) {
      console.log('No user email provided - skipping withdrawal approval notification');
      return { success: false, reason: 'no_user_email' };
    }
    
    const msg = {
      to: withdrawalData.userEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: `✅ Withdrawal Approved - ${withdrawalData.amount.toFixed(3)} SOL`,
      html: this.getWithdrawalApprovalNotificationTemplate(withdrawalData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Withdrawal approval notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send withdrawal approval notification:', error);
      // Don't throw - we don't want to fail the withdrawal approval if email fails
      return { success: false, error: error.message };
    }
  }

  getWithdrawalApprovalNotificationTemplate(withdrawalData) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const clientUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    const withdrawalsUrl = `${clientUrl}/store?tab=withdrawals`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Withdrawal Approved</title>
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
            text-align: center;
          }
          .amount-box {
            background: #d1fae5;
            border: 2px solid #10b981;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .amount {
            font-size: 36px;
            font-weight: bold;
            color: #059669;
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
            color: #059669;
          }
          .info-value {
            color: #333;
            word-break: break-word;
          }
          .button {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
            background: #d1fae5;
            color: #065f46;
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✅</div>
            <h1 style="margin: 0;">Withdrawal Approved</h1>
          </div>
          
          <p>Great news! Your withdrawal request has been approved and the payment has been processed.</p>
          
          <div class="amount-box">
            <div class="amount">${withdrawalData.amount.toFixed(3)} SOL</div>
            <div class="status-badge" style="margin-top: 10px;">Status: Approved</div>
          </div>
          
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">Amount:</div>
              <div class="info-value">${withdrawalData.amount.toFixed(6)} SOL</div>
            </div>
            <div class="info-row">
              <div class="info-label">Solana Address:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${withdrawalData.solanaAddress}</div>
            </div>
            ${withdrawalData.paymentSignature ? `
            <div class="info-row">
              <div class="info-label">Transaction Signature:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${withdrawalData.paymentSignature}</div>
            </div>
            ` : ''}
            <div class="info-row">
              <div class="info-label">Approved At:</div>
              <div class="info-value">${timestamp}</div>
            </div>
            ${withdrawalData.withdrawalId ? `
            <div class="info-row">
              <div class="info-label">Withdrawal ID:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${withdrawalData.withdrawalId}</div>
            </div>
            ` : ''}
          </div>
          
          <div style="text-align: center;">
            <a href="${withdrawalsUrl}" class="button">View Withdrawals</a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            The funds have been sent to your Solana wallet. Please allow a few minutes for the transaction to be confirmed on the blockchain.
          </p>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Edify Engine.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // Send withdrawal rejection notification to user
  async sendWithdrawalRejectionNotification(withdrawalData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping withdrawal rejection notification');
      return { success: false, reason: 'not_configured' };
    }

    // Only send if user email is provided
    if (!withdrawalData.userEmail) {
      console.log('No user email provided - skipping withdrawal rejection notification');
      return { success: false, reason: 'no_user_email' };
    }
    
    const msg = {
      to: withdrawalData.userEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: `❌ Withdrawal Rejected - ${withdrawalData.amount.toFixed(3)} SOL`,
      html: this.getWithdrawalRejectionNotificationTemplate(withdrawalData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Withdrawal rejection notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send withdrawal rejection notification:', error);
      // Don't throw - we don't want to fail the withdrawal rejection if email fails
      return { success: false, error: error.message };
    }
  }

  getWithdrawalRejectionNotificationTemplate(withdrawalData) {
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'long'
    });

    const clientUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    const withdrawalsUrl = `${clientUrl}/store?tab=withdrawals`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Withdrawal Rejected</title>
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
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -40px -40px 30px -40px;
            text-align: center;
          }
          .amount-box {
            background: #fee2e2;
            border: 2px solid #ef4444;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 20px 0;
          }
          .amount {
            font-size: 36px;
            font-weight: bold;
            color: #dc2626;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #ef4444;
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
            color: #dc2626;
          }
          .info-value {
            color: #333;
            word-break: break-word;
          }
          .button {
            display: inline-block;
            background: #ef4444;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
          }
          .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
            background: #fee2e2;
            color: #991b1b;
          }
          .rejection-reason-box {
            background: #fef2f2;
            border: 2px solid #ef4444;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
          }
          .rejection-reason-title {
            font-weight: bold;
            color: #dc2626;
            margin-bottom: 8px;
          }
          .rejection-reason-text {
            color: #333;
            line-height: 1.5;
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">❌</div>
            <h1 style="margin: 0;">Withdrawal Rejected</h1>
          </div>
          
          <p>We regret to inform you that your withdrawal request has been rejected. Your balance has been restored to your account.</p>
          
          <div class="amount-box">
            <div class="amount">${withdrawalData.amount.toFixed(3)} SOL</div>
            <div class="status-badge" style="margin-top: 10px;">Status: Rejected</div>
          </div>
          
          <div class="info-box">
            <div class="info-row">
              <div class="info-label">Amount:</div>
              <div class="info-value">${withdrawalData.amount.toFixed(6)} SOL</div>
            </div>
            <div class="info-row">
              <div class="info-label">Solana Address:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${withdrawalData.solanaAddress}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Rejected At:</div>
              <div class="info-value">${timestamp}</div>
            </div>
            ${withdrawalData.withdrawalId ? `
            <div class="info-row">
              <div class="info-label">Withdrawal ID:</div>
              <div class="info-value" style="font-family: monospace; font-size: 12px;">${withdrawalData.withdrawalId}</div>
            </div>
            ` : ''}
          </div>
          
          ${withdrawalData.rejectionReason ? `
          <div class="rejection-reason-box">
            <div class="rejection-reason-title">Rejection Reason:</div>
            <div class="rejection-reason-text">${withdrawalData.rejectionReason}</div>
          </div>
          ` : ''}
          
          <div style="text-align: center;">
            <a href="${withdrawalsUrl}" class="button">View Withdrawals</a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            The funds have been restored to your account balance. If you have any questions or concerns, please contact our support team.
          </p>
          
          <p style="color: #666; font-size: 14px; margin-top: 30px;">
            This is an automated notification from Edify Engine.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  // Send notification to contributor when their item is approved
  async sendItemApprovalNotification(itemData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping item approval notification');
      return { success: false, reason: 'not_configured' };
    }

    if (!itemData.contributorEmail) {
      console.log('No contributor email provided - skipping item approval notification');
      return { success: false, reason: 'no_contributor_email' };
    }

    const msg = {
      to: itemData.contributorEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: `✅ Your Item Has Been Approved - ${itemData.itemTitle}`,
      html: this.getItemApprovalNotificationTemplate(itemData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Item approval notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send item approval notification:', error);
      return { success: false, error: error.message };
    }
  }

  getItemApprovalNotificationTemplate(itemData) {
    const contributorUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    const storeUrl = `${contributorUrl}/store`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Item Approved</title>
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
            text-align: center;
          }
          .success-icon {
            font-size: 48px;
            margin-bottom: 10px;
          }
          .item-box {
            background: #f0fdf4;
            border: 2px solid #10b981;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .item-title {
            font-size: 24px;
            font-weight: bold;
            color: #10b981;
            margin-bottom: 10px;
          }
          .button {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #10b981;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="success-icon">✅</div>
            <h1>Item Approved!</h1>
          </div>
          
          <p>Hi ${itemData.contributorName || 'there'},</p>
          
          <p>Great news! Your item has been approved and is now live in the Edify Engine store.</p>
          
          <div class="item-box">
            <div class="item-title">${itemData.itemTitle}</div>
            ${itemData.itemType ? `<p><strong>Type:</strong> ${itemData.itemType}</p>` : ''}
            ${itemData.priceUSD ? `<p><strong>Price:</strong> $${itemData.priceUSD.toFixed(2)}</p>` : ''}
          </div>
          
          <div class="info-box">
            <p><strong>What's next?</strong></p>
            <ul>
              <li>Your item is now visible to all users in the store</li>
              <li>You'll earn 80% of each purchase made</li>
              <li>Earnings will be credited to your balance automatically</li>
              <li>You can track your earnings on the Contribute page</li>
            </ul>
          </div>
          
          <p style="text-align: center;">
            <a href="${storeUrl}" class="button">View in Store</a>
          </p>
          
          <p>Thank you for contributing to Edify Engine!</p>
          
          <p>Best regards,<br>The Edify Engine Team</p>
        </div>
      </body>
      </html>
    `;
  }

  // Send notification to contributor when their item is rejected
  async sendItemRejectionNotification(itemData) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping item rejection notification');
      return { success: false, reason: 'not_configured' };
    }

    if (!itemData.contributorEmail) {
      console.log('No contributor email provided - skipping item rejection notification');
      return { success: false, reason: 'no_contributor_email' };
    }

    const msg = {
      to: itemData.contributorEmail,
      from: {
        email: process.env.SENDGRID_FROM_EMAIL || 'noreply@edifyengine.com',
        name: 'Edify Engine'
      },
      subject: `❌ Item Review Update - ${itemData.itemTitle}`,
      html: this.getItemRejectionNotificationTemplate(itemData)
    };

    try {
      const result = await sgMail.send(msg);
      console.log('Item rejection notification sent:', result[0].headers['x-message-id']);
      return { success: true, messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      console.error('Failed to send item rejection notification:', error);
      return { success: false, error: error.message };
    }
  }

  getItemRejectionNotificationTemplate(itemData) {
    const contributorUrl = process.env.CLIENT_URL || 'https://edifyengine.com';
    const contributeUrl = `${contributorUrl}/contribute`;

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Item Review Update</title>
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
            background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
            color: white;
            padding: 20px;
            border-radius: 8px 8px 0 0;
            margin: -40px -40px 30px -40px;
            text-align: center;
          }
          .item-box {
            background: #fef2f2;
            border: 2px solid #ef4444;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
          }
          .item-title {
            font-size: 24px;
            font-weight: bold;
            color: #ef4444;
            margin-bottom: 10px;
          }
          .reason-box {
            background: #fff7ed;
            border-left: 4px solid #f59e0b;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
          .button {
            display: inline-block;
            background: #42677D;
            color: white;
            padding: 12px 24px;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
            font-weight: bold;
          }
          .info-box {
            background: #f8f9fa;
            border-left: 4px solid #42677D;
            padding: 15px;
            margin: 20px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Item Review Update</h1>
          </div>
          
          <p>Hi ${itemData.contributorName || 'there'},</p>
          
          <p>We've reviewed your item submission, and unfortunately, it doesn't meet our current quality standards or guidelines.</p>
          
          <div class="item-box">
            <div class="item-title">${itemData.itemTitle}</div>
            ${itemData.itemType ? `<p><strong>Type:</strong> ${itemData.itemType}</p>` : ''}
          </div>
          
          ${itemData.rejectionReason ? `
          <div class="reason-box">
            <p><strong>Reason:</strong></p>
            <p>${itemData.rejectionReason}</p>
          </div>
          ` : ''}
          
          <div class="info-box">
            <p><strong>What can you do?</strong></p>
            <ul>
              <li>Review the feedback provided above</li>
              <li>Make necessary improvements to your item</li>
              <li>Resubmit your item for review</li>
              <li>If you have questions, please contact our support team</li>
            </ul>
          </div>
          
          <p style="text-align: center;">
            <a href="${contributeUrl}" class="button">Upload New Item</a>
          </p>
          
          <p>We appreciate your contribution and encourage you to submit again!</p>
          
          <p>Best regards,<br>The Edify Engine Team</p>
        </div>
      </body>
      </html>
    `;
  }
}

export default new EmailService();
