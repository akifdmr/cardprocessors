const axios = require('axios');
async function run() {
  const loginRes = await axios.post('http://127.0.0.1:3103/api/auth/login', { username: 'admin', password: 'change_me_now' });
  const cookie = loginRes.headers['set-cookie'][0].split(';')[0];
  const res = await axios.get('http://127.0.0.1:3103/api/payment-processors/logs', { headers: { Cookie: cookie } });
  console.log('Status:', res.status);
  console.log('Processors:', res.data.processors?.map(p => p.key));
  console.log('Facets:', res.data.facets);
  console.log('Log count:', res.data.count);
}
run().catch(e => console.error(e.response ? e.response.data : e.message));
