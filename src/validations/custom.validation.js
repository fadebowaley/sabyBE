const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('"{{#label}}" must be a valid mongo id');
  }
  return value;
};

const nodeIdentifier = (value, helpers) => {
  if (typeof value !== 'string' || value.length === 0) {
    return helpers.message('"{{#label}}" must be a non-empty string');
  }

  if (value.match(/^[0-9a-fA-F]{24}$/)) {
    return value;
  }

  if (value.match(/^[A-Za-z0-9_-]{3,}$/)) {
    return value;
  }

  return helpers.message('"{{#label}}" must be a valid node identifier');
};

const password = (value, helpers) => {
  if (value.length < 8) {
    return helpers.message('password must be at least 8 characters');
  }
  if (!value.match(/\d/) || !value.match(/[a-zA-Z]/)) {
    return helpers.message(
      'password must contain at least 1 letter and 1 number'
    );
  }
  return value;
};

module.exports = {
  objectId,
  nodeIdentifier,
  password,
};
