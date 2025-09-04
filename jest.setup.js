// Jest setup file for test environment
const path = require('path');

// Load test environment variables
require('dotenv').config({ path: path.join(__dirname, '.env.test') });

// Mock external services that might cause issues in tests
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    verify: jest.fn(() => Promise.resolve(true)),
    sendMail: jest.fn(() => Promise.resolve({ messageId: 'test-message-id' }))
  }))
}));

jest.mock('bullmq', () => ({
  Queue: jest.fn(() => ({
    add: jest.fn(() => Promise.resolve({ id: 'test-job-id' })),
    close: jest.fn(() => Promise.resolve())
  }))
}));

jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({
    upload: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve({ Location: 'test-location' }))
    })),
    deleteObject: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve())
    }))
  }))
}));

// Mock uploadthing
jest.mock('uploadthing/server', () => ({
  UTApi: jest.fn(() => ({
    uploadFiles: jest.fn(() => Promise.resolve({ data: { url: 'test-url' } })),
    deleteFiles: jest.fn(() => Promise.resolve())
  }))
}));

// Mock html-to-text
jest.mock('html-to-text', () => ({
  htmlToText: jest.fn((html) => html.replace(/<[^>]*>/g, ''))
}));

// Global test timeout
jest.setTimeout(30000);

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global teardown
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 100));
});
