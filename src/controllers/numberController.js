const numberService = require('../services/numberService');
const twilioVerifyService = require('../services/twilioVerifyService');

const addNumber = async (req, res) => {
    try {
        const { phoneNumber, cardId, addedBy, isVerified = false } = req.body;

        if (!phoneNumber || !cardId) {
            return res.status(400).json({ error: 'phoneNumber and cardId are required' });
        }

        const result = await numberService.addNumber({
            phoneNumber,
            cardId,
            isVerified,
            addedBy: addedBy || 'system'
        });

        res.status(201).json({
            success: true,
            message: 'Number added successfully',
            data: result
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const verifyNumber = async (req, res) => {
    try {
        const { numberId, code } = req.body;
        const result = await numberService.verifyNumber(numberId, code);
        res.json(result);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

const getCardNumbers = async (req, res) => {
    try {
        const { cardId } = req.params;
        const numbers = await numberService.getNumbersByCard(cardId);
        res.json({ success: true, data: numbers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const listAll = async (req, res) => {
    try {
        const numbers = await numberService.listAllNumbers();
        res.json({ success: true, count: numbers.length, data: numbers });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

const startTwilioVerification = async (req, res) => {
    try {
        const { numberId } = req.params;
        const { channel = 'sms' } = req.body;
        const number = await numberService.getNumberById(numberId);

        if (!number) {
            return res.status(404).json({ error: 'Number not found' });
        }

        const result = await twilioVerifyService.startPhoneVerification(number.phoneNumber, channel);
        res.json({
            success: true,
            numberId,
            phoneNumber: number.phoneNumber,
            verification: result
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

const checkTwilioVerification = async (req, res) => {
    try {
        const { numberId } = req.params;
        const { code } = req.body;
        const number = await numberService.getNumberById(numberId);

        if (!number) {
            return res.status(404).json({ error: 'Number not found' });
        }
        if (!code) {
            return res.status(400).json({ error: 'code is required' });
        }

        const result = await twilioVerifyService.checkPhoneVerification(number.phoneNumber, code);
        if (result.status === 'approved' || result.valid) {
            const updated = await numberService.markNumberVerified(numberId);
            return res.json({
                success: true,
                number: updated,
                verification: result
            });
        }

        res.status(400).json({
            success: false,
            verification: result
        });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};

module.exports = {
    addNumber,
    verifyNumber,
    getCardNumbers,
    listAll,
    startTwilioVerification,
    checkTwilioVerification
};
