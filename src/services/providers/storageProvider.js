const AWS = require('aws-sdk');
const { google } = require('googleapis');
const { UTApi } = require('uploadthing/server');

class StorageProviderFactory {
  static create(provider) {
    switch (provider) {
      case 'aws-s3':
        return new AWSS3Provider();
      case 'google-drive':
        return new GoogleDriveProvider();
      case 'uploadthing':
        return new UploadThingProvider();
      default:
        throw new Error(`Unsupported storage provider: ${provider}`);
    }
  }
}

class AWSS3Provider {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN,
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.bucket = process.env.AWS_S3_BUCKET || process.env.AWS_BUCKET_NAME || 'halocrm-storage';
  }

  async upload(buffer, key, contentType) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    };

    const result = await this.s3.upload(params).promise();
    return {
      url: result.Location,
      key: result.Key,
      provider: 'aws-s3',
    };
  }

  async delete(key) {
    const params = {
      Bucket: this.bucket,
      Key: key,
    };

    return this.s3.deleteObject(params).promise();
  }

  async generatePresignedUrl(key, expiresIn = 3600) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn,
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  async generatePresignedUploadUrl(key, contentType, expiresIn = 600) {
    const params = {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    };

    return this.s3.getSignedUrlPromise('putObject', params);
  }

  async copy(sourceKey, destinationKey) {
    const params = {
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destinationKey,
    };

    return this.s3.copyObject(params).promise();
  }
}

class GoogleDriveProvider {
  constructor() {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_DRIVE_CLIENT_ID,
      process.env.GOOGLE_DRIVE_CLIENT_SECRET
    );

    this.auth.setCredentials({
      refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });
    this.parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  }

  async upload(buffer, key, contentType) {
    const media = {
      mimeType: contentType,
      body: buffer,
    };

    const fileMetadata = {
      name: key,
      parents: this.parentFolderId ? [this.parentFolderId] : undefined,
    };

    const response = await this.drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id,webViewLink,webContentLink',
    });

    return {
      url: response.data.webContentLink,
      key: response.data.id,
      provider: 'google-drive',
      viewUrl: response.data.webViewLink,
    };
  }

  async delete(fileId) {
    return this.drive.files.delete({
      fileId,
    });
  }

  async generatePresignedUrl(fileId, expiresIn = 3600) {
    const response = await this.drive.files.get({
      fileId,
      fields: 'webContentLink',
    });

    return response.data.webContentLink;
  }

  async copy(sourceFileId, newName) {
    const response = await this.drive.files.copy({
      fileId: sourceFileId,
      resource: {
        name: newName,
        parents: this.parentFolderId ? [this.parentFolderId] : undefined,
      },
    });

    return response.data;
  }
}

class UploadThingProvider {
  constructor() {
    this.utapi = new UTApi({
      apiKey: process.env.UPLOADTHING_SECRET,
    });
  }

  async upload(buffer, key, contentType) {
    const file = new File([buffer], key, { type: contentType });

    const response = await this.utapi.uploadFiles([file]);

    if (response.error) {
      throw new Error(`UploadThing upload failed: ${response.error.message}`);
    }

    const uploadedFile = response.data[0];

    return {
      url: uploadedFile.url,
      key: uploadedFile.key,
      provider: 'uploadthing',
    };
  }

  async delete(key) {
    return this.utapi.deleteFiles([key]);
  }

  async generatePresignedUrl(key, expiresIn = 3600) {
    return `https://uploadthing.com/f/${key}`;
  }

  async copy(sourceKey, destinationKey) {
    throw new Error('Copy operation not supported by UploadThing provider');
  }
}

module.exports = {
  StorageProviderFactory,
  AWSS3Provider,
  GoogleDriveProvider,
  UploadThingProvider,
};
