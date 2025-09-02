// utils/bodyParser.js
const htmlToText = require('html-to-text').htmlToText;

/**
 * Very simple heuristic body parser that attempts to extract structured
 * key-value pairs from the email body.  Example supported formats:
 *   Name: John Doe\nEmail: john@example.com\nAge: 32
 *   (Blank lines ignored, keys trimmed, value kept as string)
 *
 * Returns { text, html, structured }
 *  - text: plain-text version of body
 *  - html: original html (if present)
 *  - structured: { key: value } map or {}
 */

module.exports = (parsedEmail) => {
  const html = parsedEmail.html || '';
  let text = parsedEmail.text || '';

  // If no plain text but html exists, convert html to text for parsing
  if (!text && html) {
    text = htmlToText(html, { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }] });
  }

  const structured = {};
  if (text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    lines.forEach((line) => {
      const idx = line.indexOf(':');
      if (idx > -1) {
        const key = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        if (key && value) {
          // Normalise key to camelCase
          const camelKey = key.toLowerCase().replace(/[^a-z0-9]+([a-z0-9])/g, (_, chr) => chr.toUpperCase());
          structured[camelKey] = value;
        }
      }
    });
  }

  return {
    text,
    html,
    structured,
  };
};
