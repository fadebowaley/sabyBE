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
  config: {
    update: jest.fn(),
  },
  S3: jest.fn(() => ({
    upload: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve({ Location: 'test-location' }))
    })),
    deleteObject: jest.fn(() => ({
      promise: jest.fn(() => Promise.resolve())
    }))
  }))
}));

// Mock axios (axios v1 is ESM; Jest 26 will choke on parsing it if required)
jest.mock('axios', () => {
  const mock = {
    get: jest.fn(() => Promise.resolve({ data: {} })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
    delete: jest.fn(() => Promise.resolve({ data: {} })),
    create: jest.fn(() => mock),
    defaults: {},
    interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  };
  return mock;
});

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
