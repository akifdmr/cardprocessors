require('dotenv').config({ path: '.env' });
const env = require("./src/config/env");
const paypalService = require("./src/services/paypalService");

async function runTest() {
  try {
    const status = paypalService.getNvpStatus();
    console.log("NVP Status:", status);
    
    if (status.configured) {
      console.log("Testing NVP Connection...");
      const result = await paypalService.testNvpConnection();
      console.log("Test Result:", JSON.stringify(result, null, 2));
    } else {
      console.log("PayPal NVP is not configured.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

runTest();
