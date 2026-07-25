const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');

const getCountry = catchAsync(async (req, res) => {
  const country =
    req.headers['cf-ipcountry'] ||
    req.headers['x-country'] ||
    null;

  res.status(httpStatus.OK).send({
    country: country ? String(country).toUpperCase() : null,
  });
});

module.exports = { getCountry };
