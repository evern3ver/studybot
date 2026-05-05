const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { sendMessage } = require('../utils/messenger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function handleImage(senderId, imageUrl, user) {
  try {
    await sendMessage(senderId, '📸 Analizuoju nuotrauką...');

    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBase64 = Buffer.from(imageResponse.data).toString('base64');
    const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 }},
          { type: 'text', text: `Esi mokymosi asistentas. Pažiūrėk į šią nuotrauką ir surask visas užduotis, terminus, egzaminus ar svarbius įvykius.\n\nGrąžink JSON formatu:\n{\n  "tasks": [\n    {"name": "užduoties pavadinimas", "deadline": "YYYY-MM-DD arba null"}\n  ],\n  "message": "trumpas aprašymas ką radai nuotraukoje lietuviškai"\n}` }
        ]
      }]
    });

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.tasks && parsed.tasks.length > 0) {
        for (const task of parsed.tasks) {
          const deadline = task.deadline ? new Date(task.deadline) : null;
          user.tasks.push({ name: task.name, deadline });
        }
        await user.save();
        const taskList = parsed.tasks.map(t => `✅ ${t.name}${t.deadline ? ` (iki ${t.deadline})` : ''}`).join('\n');
        await sendMessage(senderId, `📸 Radau ${parsed.tasks.length} užduot${parsed.tasks.length === 1 ? 'į' : 'is'}:\n\n${taskList}\n\nVisos pridėtos į tavo sąrašą!`);
      } else {
        await sendMessage(senderId, `📸 ${parsed.message || 'Užduočių nuotraukoje neradau.'}`);
      }
    }
  } catch (err) {
    console.log('Nuotraukos klaida:', err);
    await sendMessage(senderId, '❌ Nepavyko apdoroti nuotraukos. Pabandyk dar kartą.');
  }
}

module.exports = { handleImage };