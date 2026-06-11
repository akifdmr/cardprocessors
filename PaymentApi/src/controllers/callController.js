const maskingService = require('../services/maskingService');
const numberService = require('../services/numberService');
const providerRouter = require('../services/providerRouter');
const { getProviderMessage, isAxiosError, toSafeErrorLog } = require('../utils/errorUtils');

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
        console.error(toSafeErrorLog(error));
        if (isAxiosError(error)) {
            return res.status(502).json({
                error: 'Failed to initiate call through provider',
                providerStatus: error.response?.status || null,
                providerMessage: getProviderMessage(error)
            });
        }

        res.status(500).json({ error: 'Failed to initiate call through provider' });
    }
};

const initiateCardCall = async (req, res) => {
    const { cardId, realTo } = req.body;

    if (!cardId || !realTo) {
        return res.status(400).json({ error: 'cardId and realTo are required' });
    }

    const cardNumber = await numberService.getPrimaryNumberByCard(cardId);
    if (!cardNumber) {
        return res.status(404).json({ error: 'No phone number is attached to this card' });
    }

    const session = maskingService.createSession(cardNumber.phoneNumber, realTo);

    try {
        const result = await providerRouter.routeCall(
            session.maskedFrom,
            realTo,
            cardNumber.phoneNumber,
            {
                cardId,
                callerId: cardNumber.phoneNumber,
                providerFrom: process.env.TWILIO_PHONE_NUMBER
            }
        );

        res.json({
            success: true,
            cardId,
            cardPhoneNumber: cardNumber.phoneNumber,
            cardPhoneVerified: cardNumber.isVerified,
            maskedFrom: session.maskedFrom,
            maskedTo: session.maskedTo,
            sessionId: session.sessionId,
            provider: result.provider,
            providerFrom: result.from,
            callId: result.callSid || result.callId
        });
    } catch (error) {
        console.error(toSafeErrorLog(error));
        if (isAxiosError(error)) {
            return res.status(502).json({
                error: 'Failed to initiate card call through provider',
                providerStatus: error.response?.status || null,
                providerMessage: getProviderMessage(error)
            });
        }

        res.status(500).json({ error: error.message || 'Failed to initiate card call through provider' });
    }
};

module.exports = {
    initiateCall,
    initiateCardCall
};
