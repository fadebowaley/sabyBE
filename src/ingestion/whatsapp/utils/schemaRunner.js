const formSchemas = require('../../formSchemas'); // or load from DB

exports.getQuestion = async (projectId, index) => {
  const schema = formSchemas[projectId];
  if (!schema || !schema.fields[index]) return null;

  return schema.fields[index]; // e.g. { label: 'Enter your name' }
};
