const express = require('express');
const router = express.Router();
const { initiateCall } = require('../controllers/callController');

router.post('/initiate', initiateCall);

module.exports = router;
