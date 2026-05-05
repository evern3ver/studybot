const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { handleText } = require('../handlers/textHandler');
const { handleImage } = require('../handlers/imageHandler');
const { handleVoice } = require('../handlers/voiceHandler');

async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, tasks: [] });
    await user.save();
  }
  return user;
}

router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    console.log('✅ Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

router.post('/', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];

      if (event.message && event.message.attachments) {
        const attachment = event.message.attachments[0];
        const senderId = event.sender.id;
        const user = await getUser(senderId);

        if (attachment.type === 'audio') {
          await handleVoice(senderId, attachment.payload.url, user);
        } else if (attachment.type === 'image') {
          await handleImage(senderId, attachment.payload.url, user);
        }

      } else if (event.message && event.message.text) {
        const senderId = event.sender.id;
        const text = event.message.text.trim();
        const user = await getUser(senderId);
        await handleText(senderId, text, user);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

module.exports = router;