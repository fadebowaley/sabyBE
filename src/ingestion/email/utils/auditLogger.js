// auditLogger.js

const fs = require('fs');
const path = require('path');
const LOG_FILE_PATH = path.join(__dirname, 'logs', 'audit.log');

// Simple utility to ensure log directory exists
function ensureLogDir() {
  const logDir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
}

// Log event to file
function logAudit(eventType, details = {}) {
  ensureLogDir();
  const logEntry = {
    timestamp: new Date().toISOString(),
    event: eventType,
    details,
  };

  const line = JSON.stringify(logEntry) + '\n';
  fs.appendFile(LOG_FILE_PATH, line, (err) => {
    if (err) {
      console.error('Failed to write audit log:', err);
    }
  });
}


module.exports = { logAudit };
