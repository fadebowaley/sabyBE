const mongoose = require('mongoose');
const config = require('../config/config'); // Adjust the path as necessary
const logger = require('../config/logger'); // Adjust the path as necessary
const InMail = require('../models/inmail.model'); // Adjust path as needed

// MongoDB connection
const connectToDB = async () => {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('Connected to MongoDB for permission generation.');
  } catch (err) {
    logger.error('Error connecting to MongoDB:', err);
    process.exit(1); // Exit the script if MongoDB connection fails
  }
};

(async () => {
  await connectToDB();

  // Function to delete all emails in the trash
  async function deleteAllTrashEmails() {
    console.log('Starting deletion of all trash emails in 1 second...');
    setTimeout(async () => {
      try {
        const result = await InMail.deleteMany({ status: 'trash' });
        console.log(`Deleted ${result.deletedCount} emails from trash.`);
      } catch (error) {
        console.error('Error deleting trash emails:', error);
      }
    }, 1000); // 1-second delay
  }

  // Execute the function
  deleteAllTrashEmails();
})();
