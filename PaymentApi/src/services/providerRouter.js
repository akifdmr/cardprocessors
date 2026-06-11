const axios = require('axios');

class ProviderRouter {
    constructor() {
        this.providers = {
            TWILIO: {
                name: "Twilio",
                makeCall: this.makeTwilioCall.bind(this),
                supportsUnverified: false
            },
            TELNYX: {
                name: "Telnyx",
                makeCall: this.makeTelnyxCall.bind(this),
                supportsUnverified: true
            }
        };
    }

    async routeCall(maskedFrom, realTo, realFrom, options = {}) {
        const primary = process.env.PRIMARY_PROVIDER || 'TWILIO';
        let provider = this.providers[primary];
        if (!provider) {
            throw new Error(`Unsupported voice provider: ${primary}`);
        }

        const callerId = options.callerId || realFrom;
        const providerFrom = options.providerFrom || process.env.TWILIO_PHONE_NUMBER;
        if (!provider.supportsUnverified && process.env.VOICE_GATEWAY_PROVIDER) {
            const gatewayKey = process.env.VOICE_GATEWAY_PROVIDER || 'TELNYX';
            const gateway = this.providers[gatewayKey];
            if (gateway?.supportsUnverified) {
                console.log(`[Router] using ${gatewayKey} to preserve caller ID ${callerId}.`);
                provider = gateway;
            }
        }

        return provider.makeCall(maskedFrom, realTo, realFrom, {
            ...options,
            callerId,
            providerFrom
        });
    }

    async makeTwilioCall(maskedFrom, realTo, realFrom, options = {}) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = options.providerFrom || process.env.TWILIO_DEFAULT_CALLER_ID || process.env.TWILIO_PHONE_NUMBER;
        const twimlUrl = process.env.TWILIO_TWIML_URL;

        if (!accountSid || !authToken || !fromNumber || !twimlUrl) {
            throw new Error('TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER and TWILIO_TWIML_URL are required');
        }

        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

        const data = new URLSearchParams();
        data.append('From', fromNumber);
        data.append('To', realTo);
        data.append('Url', twimlUrl);

        const config = {
            auth: { username: accountSid, password: authToken },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000
        };

        const res = await axios.post(url, data, config);
        return { success: true, provider: 'TWILIO', callSid: res.data.sid, from: fromNumber, maskedFrom };
    }

    async testTwilioConnection() {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;
        const twimlUrl = process.env.TWILIO_TWIML_URL;
        const missing = [
            ['TWILIO_ACCOUNT_SID', accountSid],
            ['TWILIO_AUTH_TOKEN', authToken],
            ['TWILIO_PHONE_NUMBER', fromNumber],
            ['TWILIO_TWIML_URL', twimlUrl]
        ].filter(([, value]) => !value).map(([key]) => key);

        if (missing.length > 0) {
            return {
                ok: false,
                configured: false,
                missing
            };
        }

        const response = await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
            {
                auth: { username: accountSid, password: authToken },
                timeout: 15000
            }
        );

        return {
            ok: true,
            configured: true,
            accountSid: response.data.sid,
            status: response.data.status,
            type: response.data.type,
            fromNumber,
            twimlUrl
        };
    }

    async makeTelnyxCall(maskedFrom, realTo, realFrom, options = {}) {
        const apiKey = process.env.TELNYX_API_KEY;
        const fromNumber = options.callerId || process.env.TELNYX_PHONE_NUMBER;
        const connectionId = process.env.TELNYX_CONNECTION_ID || "your-telnyx-connection-id";
        const webhookUrl = process.env.TELNYX_WEBHOOK_URL || "https://your-domain.com/webhooks/telnyx";

        const res = await axios.post('https://api.telnyx.com/v2/calls', {
            from: fromNumber,
            to: realTo,
            connection_id: connectionId,
            webhook_url: webhookUrl
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        return { success: true, provider: 'TELNYX', callId: res.data.data.id, from: fromNumber, maskedFrom };
    }

    isUnverifiedNumber(number) {
        // Burada kendi logic'ini koyabilirsin (örneğin prefix kontrolü, blacklist vs.)
        const unverifiedPrefixes = ['+447', '+44', '+33', '+49']; // örnek
        return unverifiedPrefixes.some(prefix => number.startsWith(prefix));
    }
}

module.exports = new ProviderRouter();
