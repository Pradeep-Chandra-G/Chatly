// lib/cloudinary.js
import { v2 as cloudinary } from "cloudinary";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Upload options
 * @returns {Promise} Cloudinary upload result
 */
export const uploadToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Delete file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise} Deletion result
 */
export const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Cloudinary deletion error:", error);
    throw error;
  }
};

/**
 * Upload avatar (profile picture)
 * @param {Buffer} buffer - Image buffer
 * @param {string} userId - User ID for unique naming
 * @returns {Promise<Object>} Upload result with URL
 */
export const uploadAvatar = async (buffer, userId) => {
  const result = await uploadToCloudinary(buffer, {
    folder: "chatly/avatars",
    public_id: `user_${userId}_${Date.now()}`,
    resource_type: "image",
    transformation: [
      { width: 400, height: 400, crop: "fill", gravity: "face" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ],
    overwrite: true,
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
  };
};

/**
 * Upload message image
 * @param {Buffer} buffer - Image buffer
 * @param {string} userId - User ID
 * @param {string} conversationId - Conversation ID
 * @returns {Promise<Object>} Upload result with URL
 */
export const uploadMessageImage = async (buffer, userId, conversationId) => {
  const result = await uploadToCloudinary(buffer, {
    folder: `chatly/messages/${conversationId}`,
    public_id: `img_${userId}_${Date.now()}`,
    resource_type: "image",
    transformation: [
      { width: 1920, height: 1920, crop: "limit" },
      { quality: "auto:good" },
      { fetch_format: "auto" },
    ],
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
};

/**
 * Upload document/file
 * @param {Buffer} buffer - File buffer
 * @param {string} userId - User ID
 * @param {string} conversationId - Conversation ID
 * @param {string} originalFilename - Original filename
 * @returns {Promise<Object>} Upload result with URL
 */
export const uploadDocument = async (
  buffer,
  userId,
  conversationId,
  originalFilename
) => {
  const result = await uploadToCloudinary(buffer, {
    folder: `chatly/documents/${conversationId}`,
    public_id: `doc_${userId}_${Date.now()}`,
    resource_type: "auto", // Handles any file type
    type: "upload",
  });

  return {
    url: result.secure_url,
    publicId: result.public_id,
    originalFilename: originalFilename,
    format: result.format,
    bytes: result.bytes,
  };
};

export default cloudinary;
