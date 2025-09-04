const path = require('path');

module.exports = {
  testEnvironment: 'node',
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  restoreMocks: true,
  coveragePathIgnorePatterns: [
    'node_modules', 
    'src/config', 
    'src/app.js', 
    'tests',
    'src/scripts',
    'src/ingestion',
    'public'
  ],
  coverageReporters: ['text', 'lcov', 'clover', 'html'],
  testMatch: [
    '**/src/tests/**/*.test.js',
    '**/tests/**/*.test.js'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/config/**',
    '!src/scripts/**',
    '!src/ingestion/**',
    '!src/app.js',
    '!src/index.js'
  ],
  testTimeout: 30000,
  forceExit: true,
  moduleNameMapper: {
    '^uploadthing/server$': '<rootDir>/jest.setup.js',
    '^html-to-text$': '<rootDir>/jest.setup.js'
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uploadthing|html-to-text)/)'
  ]
};
