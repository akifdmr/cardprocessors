const { MongoClient } = require('mongodb');
require('dotenv').config({ path: 'PaymentApi/.env' });

async function run() {
  const uri = process.env.DATABASE_URL;
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('paymentmanger'); // or what the db name is
    const coll = db.collection('verification_attempts');
    console.log("Testing aggregate...");
    const res = await coll.aggregate([{ $group: { _id: "$attempt_type" } }]).toArray();
    console.log("Result:", res);
  } catch(e) {
    console.error(e);
  } finally {
    await client.close();
  }
}
run();
