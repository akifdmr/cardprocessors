const express = require('express');
const router = express.Router();
const { requirePermission } = require('../auth');
const { initiateCall, initiateCardCall } = require('../controllers/callController');

router.post('/initiate', requirePermission('canRunLiveCheck'), initiateCall);
router.post('/card', requirePermission('canRunLiveCheck'), initiateCardCall);

module.exports = router;
