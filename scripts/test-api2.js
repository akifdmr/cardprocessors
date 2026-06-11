const axios = require('axios');
async function run() {
  try {
    const loginRes = await axios.post('http://127.0.0.1:3103/api/auth/login', {
      username: 'admin',
      password: 'change_me_now'
    });
    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
    
    const logsRes = await axios.get('http://127.0.0.1:3103/api/payment-processors/logs', {
      headers: { Cookie: cookie }
    });
    console.log("Processors from logs:", logsRes.data.processors.map(p => p.key));
    
  } catch(e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
run();
