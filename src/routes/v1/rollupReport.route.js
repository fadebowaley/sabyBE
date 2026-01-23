const express = require('express');
const auth = require('../../middlewares/auth');
const rollupReportController = require('../../controllers/rollupReport.controller');

const router = express.Router();

router.get('/daily', auth(), rollupReportController.getDailyRollup);
router.get('/weekly', auth(), rollupReportController.getWeeklyRollup);
router.get('/monthly', auth(), rollupReportController.getMonthlyRollup);
router.get('/status', auth(), rollupReportController.getSubmissionStatus);

module.exports = router;
