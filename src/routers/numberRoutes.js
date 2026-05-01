const express = require('express');
const router = express.Router();
const { requirePermission } = require('../auth');
const {
  addNumber,
  verifyNumber,
  getCardNumbers,
  listAll,
  startTwilioVerification,
  checkTwilioVerification
} = require('../controllers/numberController');

router.post('/add', requirePermission('canCreateCards'), addNumber);
router.post('/verify', requirePermission('canCreateCards'), verifyNumber);
router.post('/:numberId/twilio/start', requirePermission('canCreateCards'), startTwilioVerification);
router.post('/:numberId/twilio/check', requirePermission('canCreateCards'), checkTwilioVerification);
router.get('/card/:cardId', requirePermission('canListCards'), getCardNumbers);
router.get('/all', requirePermission('canManageUsers'), listAll);

module.exports = router;
