const express = require('express');
const router = express.Router();
const { createMask, resolveNumber } = require('../controllers/maskController');

router.post('/create', createMask);
router.post('/resolve', resolveNumber);

module.exports = router;
