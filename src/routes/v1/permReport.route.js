const express = require('express');
const auth = require('../../middlewares/auth');
const permReportController = require('../../controllers/permReport.controller');

const router = express.Router();

router.get('/', auth(), permReportController.getPermReport);

module.exports = router;
