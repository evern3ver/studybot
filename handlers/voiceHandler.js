const axios = require('axios');
const FormData = require('form-data');
const OpenAI = require('openai');
const { sendMessage } = require('../utils/messenger');
const { processWithAI } = require('../services/ai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder' });

async function transcribeAudio(audioUrl) {
  const audioResponse = await axios.get(audioUrl, {
    responseType: 'arraybuffer',
    headers: { 'Authorization': `Bearer ${process.env.PAGE_ACCESS_TOKEN}` }
  });

  const audioBuffer = Buffer.from(audioResponse.data);
  const contentType = audioResponse.headers['content-type'] || 'audio/mpeg';
  const extension = contentType.includes('ogg') ? 'ogg' :
                    contentType.includes('mp4') ? 'mp4' :
                    contentType.includes('wav') ? 'wav' : 'mp3';

  const formData = new FormData();
  formData.append('file', audioBuffer, { filename: `audio.${extension}`, contentType });
  formData.append('model', 'whisper-1');
  formData.append('language', 'lt');

  const whisperResponse = await axios.post(
    'https://api.openai.com/v1/audio/transcriptions',
    formData,
    {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    }
  );

  return whisperResponse.data.text;
}

async function handleVoice(senderId, audioUrl, user) {
  try {
    await sendMessage(senderId, '🎤 Klausau balso žinutės...');
    const transcribedText = await transcribeAudio(audioUrl);
    console.log(`🎤 Transkribuota: ${transcribedText}`);

    await sendMessage(senderId, `🎤 Išgirdau: "${transcribedText}"\n\n🤔 Apdoroju...`);

    const aiResult = await processWithAI(transcribedText, user);

    if (aiResult.action === 'add_task' && aiResult.task_name) {
      const deadline = aiResult.deadline ? new Date(aiResult.deadline) : null;
      user.tasks.push({ name: aiResult.task_name, deadline });
      await user.save();
      await sendMessage(senderId, aiResult.response || `✅ Pridėta: "${aiResult.task_name}"`);

    } else if (aiResult.action === 'list_tasks') {
      if (user.tasks.length === 0) {
        await sendMessage(senderId, '📋 Neturi jokių užduočių!');
      } else {
        const list = user.tasks.map((t, i) => {
          const deadline = t.deadline ? ` (iki ${new Date(t.deadline).toLocaleDateString('lt-LT')})` : '';
          return `${i + 1}. ${t.done ? '✅' : '⏳'} ${t.name}${deadline}`;
        }).join('\n');
        await sendMessage(senderId, `📋 Tavo užduotys:\n\n${list}`);
      }

    } else if (aiResult.action === 'complete_task' && aiResult.task_number) {
      const num = aiResult.task_number - 1;
      if (num >= 0 && num < user.tasks.length) {
        user.tasks[num].done = true;
        await user.save();
        await sendMessage(senderId, aiResult.response || `🎉 Atlikta: "${user.tasks[num].name}"`);
      }

    } else if (aiResult.action === 'clear_tasks') {
      user.tasks = [];
      await user.save();
      await sendMessage(senderId, aiResult.response || '🗑️ Visos užduotys ištrintos!');

    } else {
      await sendMessage(senderId, aiResult.response || '❓ Nepavyko suprasti. Pabandyk dar kartą.');
    }

  } catch (err) {
    console.log('Balso klaida:', err);
    await sendMessage(senderId, '❌ Nepavyko apdoroti balso žinutės. Pabandyk dar kartą.');
  }
}

module.exports = { handleVoice };