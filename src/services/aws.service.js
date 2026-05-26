const AWS = require('aws-sdk');
const config = require('../config/config');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
});

const s3 = new AWS.S3();
const BUCKET_NAME = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || 'halocrm-storage';

const uploadToS3 = async (buffer, key, contentType) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ServerSideEncryption: 'AES256',
  };

  return s3.upload(params).promise();
};

const deleteFromS3 = async (key) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  return s3.deleteObject(params).promise();
};

const generatePresignedUrl = async (key, expiresIn = 3600) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Expires: expiresIn,
  };

  return s3.getSignedUrl('getObject', params);
};

const copyObject = async (sourceKey, destinationKey) => {
  const params = {
    Bucket: BUCKET_NAME,
    CopySource: `${BUCKET_NAME}/${sourceKey}`,
    Key: destinationKey,
  };

  return s3.copyObject(params).promise();
};

const getObjectMetadata = async (key) => {
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
  };

  return s3.headObject(params).promise();
};

module.exports = {
  uploadToS3,
  deleteFromS3,
  generatePresignedUrl,
  copyObject,
  getObjectMetadata,
};
