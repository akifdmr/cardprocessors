const maskingService = require('../services/maskingService');

const createMask = (req, res) => {
    const { realFrom, realTo } = req.body;

    if (!realFrom || !realTo) {
        return res.status(400).json({ error: 'realFrom and realTo are required' });
    }

    const session = maskingService.createSession(realFrom, realTo);

    res.json({
        success: true,
        maskedNumber: session.maskedFrom,   // Arayan tarafın göreceği numara
        targetMasked: session.maskedTo,
        sessionId: session.sessionId,
        expiresAt: session.expiresAt
    });
};

const resolveNumber = (req, res) => {
    const { maskedNumber } = req.body;

    const realNumber = maskingService.getRealNumber(maskedNumber);

    if (!realNumber) {
        return res.status(404).json({ error: 'Masked number not found' });
    }

    res.json({
        success: true,
        realNumber
    });
};

module.exports = {
    createMask,
    resolveNumber
};
