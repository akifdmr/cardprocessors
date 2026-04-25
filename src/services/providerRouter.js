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

    async routeCall(maskedFrom, realTo, realFrom) {
        const primary = process.env.PRIMARY_PROVIDER || 'TWILIO';
        let provider = this.providers[primary];

        // Eğer primary provider unverified numaraları desteklemiyorsa ve hedef numara unverified ise fallback'e geç
        if (!provider.supportsUnverified && this.isUnverifiedNumber(realTo)) {
            console.log(`[Router] ${realTo} unverified. Switching to fallback provider.`);
            provider = this.providers.TELNYX;   // veya istediğin fallback
        }

        return provider.makeCall(maskedFrom, realTo, realFrom);
    }

    async makeTwilioCall(maskedFrom, realTo, realFrom) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;

        const data = new URLSearchParams();
        data.append('From', maskedFrom);
        data.append('To', realTo);
        data.append('Url', 'http://your-twiml-url.com/twiml'); // TwiML endpoint'in

        const config = {
            auth: { username: accountSid, password: authToken },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        };

        const res = await axios.post(url, data, config);
        return { success: true, provider: 'TWILIO', callSid: res.data.sid };
    }

    async makeTelnyxCall(maskedFrom, realTo, realFrom) {
        const apiKey = process.env.TELNYX_API_KEY;
        const fromNumber = process.env.TELNYX_PHONE_NUMBER;

        const res = await axios.post('https://api.telnyx.com/v2/calls', {
            from: maskedFrom,
            to: realTo,
            connection_id: "your-telnyx-connection-id",
            webhook_url: "https://your-domain.com/webhooks/telnyx"
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        return { success: true, provider: 'TELNYX', callId: res.data.data.id };
    }

    isUnverifiedNumber(number) {
        // Burada kendi logic'ini koyabilirsin (örneğin prefix kontrolü, blacklist vs.)
        const unverifiedPrefixes = ['+447', '+44', '+33', '+49']; // örnek
        return unverifiedPrefixes.some(prefix => number.startsWith(prefix));
    }
}

module.exports = new ProviderRouter();
