const { version } = require('../../package.json');
const config = require('../config/config');

// Steps to update Swagger definition:
// 1. Update the title to reflect your actual API name
// 2. Update the GitHub URL to point to your repository
// 3. Add description and examples if needed

const swaggerDef = {
  openapi: '3.0.0',
  info: {
    title: 'Saby API Documentation',
    version,
    description: `Saby API provides a robust platform for managing hierarchical networks, user roles, and organizational structures.

**Authentication:** All endpoints require JWT tokens. Include in header: \`Authorization: Bearer <token>\`

**Rate Limiting:** 100 requests/min per IP, 1000 requests/hour per user

**HTTP Status Codes:** 2xx (Success), 4xx (Client errors), 5xx (Server errors)
    `,
    license: {
      name: 'MIT',
      url: 'https://github.com/fadebowaley/saby',
    },
    contact: {
      name: 'Saby API Team',
      email: 'apis@saby.ai',
      url: 'https://saby.ai',
    },
    termsOfService: 'https://saby.ai/terms',
  },
  servers: [
    {
      url: 'https://api.saby.ai/v1',
      description: 'Production Server',
    },
    {
      url: 'https://api-staging.saby.ai/v1',
      description: 'Staging Server',
    },
    {
      url: `http://localhost:${config.port}/v1`,
      description: 'Local Development',
    },
  ],
  tags: [
    {
      name: 'Auth',
      description: 'Authentication and authorization',
    },
    {
      name: 'Users',
      description: 'User management',
    },
    {
      name: 'Roles',
      description: 'Role and permission management',
    },
    {
      name: 'Structures',
      description: 'Network and structure management',
    },
    {
      name: 'Nodes',
      description: 'Node operations',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token in the format: Bearer <token>',
      },
    },
    responses: {
      UnauthorizedError: {
        description: 'Access token is missing or invalid',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: {
                  type: 'integer',
                  example: 401,
                },
                message: {
                  type: 'string',
                  example: 'Please authenticate',
                },
              },
            },
          },
        },
      },
      NotFoundError: {
        description: 'The specified resource was not found',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: {
                  type: 'integer',
                  example: 404,
                },
                message: {
                  type: 'string',
                  example: 'Resource not found',
                },
              },
            },
          },
        },
      },
      ValidationError: {
        description: 'Validation failed',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                code: {
                  type: 'integer',
                  example: 400,
                },
                message: {
                  type: 'string',
                  example: 'Validation Error',
                },
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: {
                        type: 'string',
                        example: 'email',
                      },
                      message: {
                        type: 'string',
                        example: 'must be a valid email address',
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = swaggerDef;
