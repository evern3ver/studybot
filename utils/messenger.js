const axios = require('axios');

async function sendMessage(senderId, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    { recipient: { id: senderId }, message: { text } }
  );
}

module.exports = { sendMessage };