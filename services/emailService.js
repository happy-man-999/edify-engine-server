import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Use environment variables for email configuration
    const emailConfig = {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    };

    // Only create transporter if email credentials are provided
    if (emailConfig.auth.user && emailConfig.auth.pass) {
      this.transporter = nodemailer.createTransport(emailConfig);
      console.log('Email service initialized successfully');
    } else {
      console.warn('Email service not configured. Set EMAIL_USER and EMAIL_PASS environment variables.');
      console.warn('Email verification codes will be returned in API responses for development.');
    }
  }

  async sendVerificationCode(email, code, firstName = '') {
    if (!this.transporter) {
      throw new Error('Email service not configured');
    }

    const mailOptions = {
      from: `"Edify Engine" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify Your Email - Edify Engine',
      html: this.getVerificationEmailTemplate(code, firstName)
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Verification email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
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
    if (!this.transporter) {
      throw new Error('Email service not configured');
    }

    const mailOptions = {
      from: `"Edify Engine" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Welcome to Edify Engine!',
      html: this.getWelcomeEmailTemplate(firstName)
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log('Welcome email sent:', result.messageId);
      return { success: true, messageId: result.messageId };
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
}

export default new EmailService();
