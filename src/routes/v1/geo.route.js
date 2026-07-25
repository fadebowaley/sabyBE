const express = require('express');
const geoController = require('../../controllers/geo.controller');

const router = express.Router();

router.route('/country').get(geoController.getCountry);

module.exports = router;
