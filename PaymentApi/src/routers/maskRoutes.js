const express = require('express');
const router = express.Router();
const { requirePermission } = require('../auth');
const { createMask, resolveNumber } = require('../controllers/maskController');

router.post('/create', requirePermission('canRunLiveCheck'), createMask);
router.post('/resolve', requirePermission('canManageUsers'), resolveNumber);

module.exports = router;
