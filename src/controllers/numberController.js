const numberService = require('../services/numberService');

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

module.exports = {
    addNumber,
    verifyNumber,
    getCardNumbers,
    listAll
};
