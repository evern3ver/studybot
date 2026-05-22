const axios = require('axios');

async function sendMessage(senderId, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    { recipient: { id: senderId }, message: { text } }
  );
}

async function sendQuickReply(senderId, text, options) {
  const quickReplies = options.map(opt => ({
    content_type: 'text',
    title: opt.title,
    payload: opt.payload
  }));

  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    {
      recipient: { id: senderId },
      message: { text, quick_replies: quickReplies }
    }
  );
}

module.exports = { sendMessage, sendQuickReply };