#!/usr/bin/env node

/**
 * Socket.IO Chat Testing Client
 * 
 * This script helps test the chat Socket.IO functionality
 * 
 * Usage:
 *   node scripts/test-chat-socket.js --token <JWT_TOKEN> --userId <USER_ID> --tenantId <TENANT_ID>
 * 
 * Or set environment variables:
 *   TOKEN=your_jwt_token USER_ID=user_id TENANT_ID=tenant_id node scripts/test-chat-socket.js
 */

const io = require('socket.io-client');

// Configuration
const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:4000';
const TOKEN = process.env.TOKEN || process.argv.find(arg => arg.startsWith('--token='))?.split('=')[1];
const USER_ID = process.env.USER_ID || process.argv.find(arg => arg.startsWith('--userId='))?.split('=')[1];
const TENANT_ID = process.env.TENANT_ID || process.argv.find(arg => arg.startsWith('--tenantId='))?.split('=')[1];

if (!TOKEN || !USER_ID || !TENANT_ID) {
  console.error('❌ Missing required parameters:');
  console.error('   --token <JWT_TOKEN>');
  console.error('   --userId <USER_ID>');
  console.error('   --tenantId <TENANT_ID>');
  console.error('\nOr set environment variables: TOKEN, USER_ID, TENANT_ID');
  process.exit(1);
}

console.log('🔌 Connecting to Socket.IO server...');
console.log(`   URL: ${SOCKET_URL}`);
console.log(`   User ID: ${USER_ID}`);
console.log(`   Tenant ID: ${TENANT_ID}`);
console.log('');

// Create Socket.IO client
const socket = io(SOCKET_URL, {
  auth: {
    token: TOKEN,
  },
  transports: ['websocket'],
});

let isConnected = false;
let currentConversationId = null;

// Connection handlers
socket.on('connect', () => {
  isConnected = true;
  console.log('✅ Connected to server');
  console.log(`   Socket ID: ${socket.id}`);
  console.log('');
  showHelp();
});

socket.on('disconnect', (reason) => {
  isConnected = false;
  console.log(`\n❌ Disconnected: ${reason}`);
});

socket.on('connect_error', (error) => {
  console.error(`\n❌ Connection error: ${error.message}`);
  if (error.message.includes('Authentication')) {
    console.error('   Check your JWT token is valid');
  }
});

// Chat event handlers
socket.on('chat:message', (data) => {
  console.log('\n📨 Message received:');
  console.log(`   Conversation: ${data.conversationId}`);
  console.log(`   From: ${data.from?.name || data.from?._id || data.from}`);
  console.log(`   Content: ${data.content}`);
  console.log(`   Timestamp: ${new Date(data.createdAt || Date.now()).toLocaleString()}`);
});

socket.on('chat:presence', (data) => {
  console.log(`\n👤 Presence update: ${data.userId} is ${data.status}`);
});

socket.on('chat:typing', (data) => {
  const status = data.isTyping ? 'typing...' : 'stopped typing';
  console.log(`\n⌨️  ${data.userId} is ${status} in conversation ${data.conversationId}`);
});

socket.on('chat:delivered', (data) => {
  console.log(`\n✓ Message ${data.messageId} delivered to ${data.userId}`);
});

socket.on('chat:read', (data) => {
  console.log(`\n✓✓ Message ${data.messageId} read by ${data.userId}`);
});

socket.on('error', (error) => {
  console.error(`\n❌ Error: ${error.message || JSON.stringify(error)}`);
});

socket.on('rate-limit-exceeded', (data) => {
  console.error(`\n🚫 Rate limit exceeded: ${data.message}`);
  console.error(`   Type: ${data.type}`);
  console.error(`   Remaining: ${data.remaining}/${data.limit}`);
  console.error(`   Reset at: ${new Date(data.resetAt).toLocaleString()}`);
});

// Helper functions
function showHelp() {
  console.log('📋 Available commands (type in console):');
  console.log('   join <conversationId>          - Join a conversation');
  console.log('   leave                          - Leave current conversation');
  console.log('   send <message>                 - Send a message to current conversation');
  console.log('   typing <true|false>            - Set typing indicator');
  console.log('   heartbeat                      - Send presence heartbeat');
  console.log('   help                           - Show this help');
  console.log('   exit                           - Disconnect and exit');
  console.log('');
}

// Command handlers
const commands = {
  join: (conversationId) => {
    if (!conversationId) {
      console.error('❌ Usage: join <conversationId>');
      return;
    }
    currentConversationId = conversationId;
    socket.emit('chat:join', { conversationId });
    console.log(`✅ Joining conversation: ${conversationId}`);
  },

  leave: () => {
    if (!currentConversationId) {
      console.error('❌ Not in any conversation. Use: join <conversationId>');
      return;
    }
    socket.emit('chat:leave', { conversationId: currentConversationId });
    console.log(`✅ Leaving conversation: ${currentConversationId}`);
    currentConversationId = null;
  },

  send: (content) => {
    if (!content) {
      console.error('❌ Usage: send <message>');
      return;
    }
    if (!currentConversationId) {
      console.error('❌ Not in any conversation. Use: join <conversationId>');
      return;
    }
    socket.emit('chat:message', {
      conversationId: currentConversationId,
      content,
      messageType: 'text',
    });
    console.log(`✅ Message sent: ${content}`);
  },

  typing: (isTypingStr) => {
    if (!currentConversationId) {
      console.error('❌ Not in any conversation. Use: join <conversationId>');
      return;
    }
    const isTyping = isTypingStr === 'true' || isTypingStr === '1';
    socket.emit('chat:typing', {
      conversationId: currentConversationId,
      isTyping,
    });
    console.log(`✅ Typing indicator: ${isTyping ? 'typing' : 'stopped'}`);
  },

  heartbeat: () => {
    socket.emit('chat:presence:heartbeat', {
      userId: USER_ID,
      tenantId: TENANT_ID,
    });
    console.log('✅ Presence heartbeat sent');
  },

  help: () => {
    showHelp();
  },

  exit: () => {
    console.log('\n👋 Disconnecting...');
    socket.disconnect();
    setTimeout(() => process.exit(0), 1000);
  },
};

// Read commands from stdin
if (process.stdin.isTTY) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'chat> ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    const [command, ...args] = line.trim().split(' ');
    const handler = commands[command];

    if (handler) {
      handler(args.join(' '));
    } else if (command) {
      console.error(`❌ Unknown command: ${command}. Type 'help' for available commands.`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 Goodbye!');
    socket.disconnect();
    process.exit(0);
  });
} else {
  console.log('⚠️  Interactive mode requires a TTY. Socket.IO client will stay connected.');
  console.log('   Use Ctrl+C to exit');
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down...');
  socket.disconnect();
  process.exit(0);
});





