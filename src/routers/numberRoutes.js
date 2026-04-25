const express = require('express');
const router = express.Router();
const { addNumber, verifyNumber, getCardNumbers, listAll } = require('../controllers/numberController');

router.post('/add', addNumber);
router.post('/verify', verifyNumber);
router.get('/card/:cardId', getCardNumbers);
router.get('/all', listAll);

module.exports = router;
