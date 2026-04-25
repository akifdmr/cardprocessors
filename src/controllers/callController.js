const maskingService = require('../services/maskingService');
const providerRouter = require('../services/providerRouter');

const initiateCall = async (req, res) => {
    const { realFrom, realTo } = req.body;

    if (!realFrom || !realTo) {
        return res.status(400).json({ error: 'realFrom and realTo are required' });
    }

    // Maskeleme katmanı
    const session = maskingService.createSession(realFrom, realTo);

    // Provider Router katmanı (unverified kontrolü burada yapılır)
    try {
        const result = await providerRouter.routeCall(
            session.maskedFrom,
            realTo,
            realFrom
        );

        res.json({
            success: true,
            maskedFrom: session.maskedFrom,
            maskedTo: session.maskedTo,
            sessionId: session.sessionId,
            provider: result.provider,
            callId: result.callSid || result.callId
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to initiate call through provider' });
    }
};

module.exports = { initiateCall };
