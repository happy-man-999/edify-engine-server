import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

// Configure AWS SDK for Digital Ocean Spaces
const spacesEndpoint = new AWS.Endpoint('nyc3.digitaloceanspaces.com');
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: process.env.DO_SPACES_ACCESS_KEY,
  secretAccessKey: process.env.DO_SPACES_SECRET_KEY,
  region: 'nyc3'
});

const BUCKET_NAME = process.env.DO_SPACES_ITEMS_BUCKET_NAME;
const BUCKET_URL = process.env.DO_SPACES_ITEMS_BUCKET_URL;

class DigitalOceanSpacesService {
  /**
   * Upload a file to Digital Ocean Spaces
   * @param {Object} file - The file object from multer
   * @param {string} folder - The folder to upload to (e.g., '3d-objects', 'cover-images')
   * @returns {Promise<Object>} - Object containing the file URL and key
   */
  static async uploadFile(file, folder = 'uploads') {
    try {
      const fileExtension = file.originalname.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
      const key = `${folder}/${fileName}`;

      const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read' // Make the file publicly accessible
      };

      const result = await s3.upload(uploadParams).promise();
      
      return {
        success: true,
        url: result.Location,
        key: key,
        fileName: fileName
      };
    } catch (error) {
      console.error('Digital Ocean Spaces upload error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete a file from Digital Ocean Spaces
   * @param {string} key - The file key to delete
   * @returns {Promise<Object>} - Success status
   */
  static async deleteFile(key) {
    try {
      const deleteParams = {
        Bucket: BUCKET_NAME,
        Key: key
      };

      await s3.deleteObject(deleteParams).promise();
      
      return {
        success: true
      };
    } catch (error) {
      console.error('Digital Ocean Spaces delete error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get a signed URL for private file access (if needed)
   * @param {string} key - The file key
   * @param {number} expiresIn - Expiration time in seconds (default: 3600)
   * @returns {Promise<string>} - Signed URL
   */
  static async getSignedUrl(key, expiresIn = 3600) {
    try {
      const params = {
        Bucket: BUCKET_NAME,
        Key: key,
        Expires: expiresIn
      };

      return await s3.getSignedUrlPromise('getObject', params);
    } catch (error) {
      console.error('Digital Ocean Spaces signed URL error:', error);
      throw error;
    }
  }

  /**
   * List files in a folder
   * @param {string} prefix - The folder prefix
   * @returns {Promise<Array>} - Array of file objects
   */
  static async listFiles(prefix = '') {
    try {
      const params = {
        Bucket: BUCKET_NAME,
        Prefix: prefix
      };

      const result = await s3.listObjectsV2(params).promise();
      
      return result.Contents.map(item => ({
        key: item.Key,
        url: `${BUCKET_URL}/${item.Key}`,
        size: item.Size,
        lastModified: item.LastModified
      }));
    } catch (error) {
      console.error('Digital Ocean Spaces list files error:', error);
      throw error;
    }
  }
}

export default DigitalOceanSpacesService;
