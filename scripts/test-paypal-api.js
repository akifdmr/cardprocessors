const axios = require('axios');
const { encrypt } = require('../PaymentApi/src/crypto');
const { query } = require('../PaymentApi/src/db');
const { v4: uuidv4 } = require('uuid');

async function run() {
  try {
    const cardId = uuidv4();
    await query(`
      INSERT INTO cards (id, provider, pan_encrypted, last4, exp_month, exp_year)
      VALUES ($1, 'paypal', $2, '1111', '12', '2030')
    `, [cardId, encrypt('4111111111111111')]);

    const res = await axios.post('http://127.0.0.1:3103/api/provider-operations/cards', {
      cardId,
      provider: 'paypal',
      operation: 'live',
      amount: 1,
      runBinCheck: true
    }, {
      headers: {
        'x-bypass-auth': 'true' // this is not real, we need auth, wait. 
        // I can just import the server module and call it but express doesn't work that way.
      }
    }).catch(e => e.response);
    
    console.log(res.status, res.data);
  } catch(e) {
    console.error(e);
  }
}
run();
