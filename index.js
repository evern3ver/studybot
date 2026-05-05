process.env.VERIFY_TOKEN = 'studybot2024';
process.env.PORT = '3000';
process.env.PAGE_ACCESS_TOKEN = 'EAALYhENIGVwBRLLvolbvunAdkTr7TJB3o1zYc2zHRXEQZAGwOYUIys23hEJ3bygzFZC3LVvZAxSvIGSFgZAHa9WrDGjGRboNf5GrVoB5TpywzEXogOdRTUIp4dLRpIp2t0XvCkXWZC2pA6QjWYKpxzvRiczkqLhWodo1nGnxhWfLZAxKfxjb6VejGL41rfJJL78p8LmQZDZD';
process.env.MONGO_URI = 'mongodb+srv://janliulia_db_user:av3sdSwR8SeUYwoh@cluster0.vniarnd.mongodb.net/?appName=Cluster0';
process.env.ANTHROPIC_API_KEY = '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';
process.env.OPENAI_API_KEY = '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';

const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const mongoose = require('mongoose');
const cron = require('node-cron');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const FormData = require('form-data');
 
const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});
 
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
 
const taskSchema = new mongoose.Schema({
  name: String,
  done: { type: Boolean, default: false },
  deadline: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
 
const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  tasks: [taskSchema],
  createdAt: { type: Date, default: Date.now }
});
 
const User = mongoose.model('User', userSchema);
 
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB prijungtas!'))
  .catch(err => console.log('❌ MongoDB klaida:', err));
 
cron.schedule('0 9 * * *', async () => {
  console.log('⏰ Tikrinami priminimai...');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const users = await User.find({ 'tasks.done': false });
  for (const user of users) {
    const artejancios = user.tasks.filter(t => {
      if (t.done || !t.deadline) return false;
      return new Date(t.deadline) <= tomorrow;
    });
    if (artejancios.length > 0) {
      const list = artejancios
        .map(t => `⏳ ${t.name} — iki ${new Date(t.deadline).toLocaleDateString('lt-LT')}`)
        .join('\n');
      await sendMessage(user.userId, `🔔 Priminimai!\n\nArtėjančios užduotys:\n${list}\n\nNepamirška atlikti laiku!`);
    }
  }
}, { timezone: 'Europe/Vilnius' });
 
async function getUser(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, tasks: [] });
    await user.save();
  }
  return user;
}
 
async function sendMessage(senderId, text) {
  await axios.post(
    `https://graph.facebook.com/v18.0/me/messages?access_token=${process.env.PAGE_ACCESS_TOKEN}`,
    { recipient: { id: senderId }, message: { text } }
  );
}
 
async function transcribeAudio(audioUrl) {
  // Atsisiųsti audio failą
  const audioResponse = await axios.get(audioUrl, {
    responseType: 'arraybuffer',
    headers: { 'Authorization': `Bearer ${process.env.PAGE_ACCESS_TOKEN}` }
  });
 
  const audioBuffer = Buffer.from(audioResponse.data);
  const contentType = audioResponse.headers['content-type'] || 'audio/mpeg';
  const extension = contentType.includes('ogg') ? 'ogg' :
                    contentType.includes('mp4') ? 'mp4' :
                    contentType.includes('wav') ? 'wav' : 'mp3';
 
  // Siųsti į OpenAI Whisper
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
 
async function processWithAI(userMessage, user) {
  const taskList = user.tasks.length > 0
    ? user.tasks.map((t, i) => `${i + 1}. ${t.done ? '[ATLIKTA]' : '[NEATLIKTA]'} ${t.name}${t.deadline ? ` (terminas: ${new Date(t.deadline).toLocaleDateString('lt-LT')})` : ''}`).join('\n')
    : 'Užduočių nėra';
 
  const prompt = `Tu esi StudyBot - mokymosi asistentas lietuvių kalba. 
Vartotojo užduočių sąrašas:
${taskList}
 
Vartotojas parašė: "${userMessage}"
 
Išanalizuok žinutę ir atsakyk JSON formatu:
{
  "action": "add_task" | "list_tasks" | "complete_task" | "clear_tasks" | "help" | "chat",
  "task_name": "užduoties pavadinimas jei pridedama",
  "deadline": "YYYY-MM-DD jei minima data arba null",
  "task_number": numeris jei žymima atlikta arba null,
  "response": "atsakymas vartotojui lietuvių kalba"
}
 
Taisyklės:
- Jei vartotojas nori pridėti užduotį - action: add_task
- Jei klausia apie užduotis - action: list_tasks
- Jei žymi atlikta - action: complete_task
- Jei nori išvalyti - action: clear_tasks
- Jei prašo pagalbos - action: help
- Kitais atvejais - action: chat
- Visada atsakyk draugiškai lietuviškai
- Jei minima data - konvertuok į YYYY-MM-DD formatą`;
 
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }]
  });
  const responseText = message.content[0].text;
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) return JSON.parse(jsonMatch[0]);
  return { action: 'chat', response: responseText };
}
 
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
 
app.post('/webhook', async (req, res) => {
  const body = req.body;
  if (body.object === 'page') {
    for (const entry of body.entry) {
      const event = entry.messaging[0];
 
      // BALSO ŽINUTĖS
      if (event.message && event.message.attachments) {
        const attachment = event.message.attachments[0];
        const senderId = event.sender.id;
        const user = await getUser(senderId);
 
        if (attachment.type === 'audio') {
          try {
            await sendMessage(senderId, '🎤 Klausau balso žinutės...');
            const audioUrl = attachment.payload.url;
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
 
        // NUOTRAUKOS
        } else if (attachment.type === 'image') {
          try {
            await sendMessage(senderId, '📸 Analizuoju nuotrauką...');
            const imageUrl = attachment.payload.url;
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
 
      // TEKSTINĖS ŽINUTĖS
      } else if (event.message && event.message.text) {
        const senderId = event.sender.id;
        const text = event.message.text.trim();
        const user = await getUser(senderId);
        console.log(`📨 [${senderId}]: ${text}`);
 
        if (text === '/pagalba') {
          await sendMessage(senderId, '📚 Komandos:\n\n/užduotys — mano užduotys\n/pridėti [pavadinimas] — pridėti užduotį\n/pridėti [pavadinimas] [YYYY-MM-DD] — su terminu\n/atlikta [nr.] — pažymėti atlikta\n/išvalyti — ištrinti visas\n\n💡 Arba rašyk laisvai:\n"Reikia padaryti matematiką iki penktadienio"\n\n🎤 Arba siųsk balso žinutę!\n📸 Arba siųsk nuotrauką su užduotimis!');
 
        } else if (text === '/užduotys') {
          if (user.tasks.length === 0) {
            await sendMessage(senderId, '📋 Neturi jokių užduočių!\n\nPridėk: /pridėti Matematika');
          } else {
            const list = user.tasks.map((t, i) => {
              const deadline = t.deadline ? ` (iki ${new Date(t.deadline).toLocaleDateString('lt-LT')})` : '';
              return `${i + 1}. ${t.done ? '✅' : '⏳'} ${t.name}${deadline}`;
            }).join('\n');
            await sendMessage(senderId, `📋 Tavo užduotys:\n\n${list}`);
          }
 
        } else if (text.startsWith('/pridėti ')) {
          const parts = text.slice(9).trim().split(' ');
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          let taskName, deadline;
          if (dateRegex.test(parts[parts.length - 1])) {
            deadline = new Date(parts[parts.length - 1]);
            taskName = parts.slice(0, -1).join(' ');
          } else {
            taskName = parts.join(' ');
            deadline = null;
          }
          if (taskName) {
            user.tasks.push({ name: taskName, deadline });
            await user.save();
            const deadlineText = deadline ? `\nTerminas: ${deadline.toLocaleDateString('lt-LT')}` : '';
            await sendMessage(senderId, `✅ Užduotis pridėta:\n"${taskName}"${deadlineText}\n\nIš viso: ${user.tasks.length}`);
          }
 
        } else if (text.startsWith('/atlikta ')) {
          const num = parseInt(text.slice(9)) - 1;
          if (num >= 0 && num < user.tasks.length) {
            user.tasks[num].done = true;
            await user.save();
            await sendMessage(senderId, `🎉 Atlikta:\n"${user.tasks[num].name}"`);
          } else {
            await sendMessage(senderId, '❌ Užduotis nerasta! Patikrink per /užduotys');
          }
 
        } else if (text === '/išvalyti') {
          user.tasks = [];
          await user.save();
          await sendMessage(senderId, '🗑️ Visos užduotys ištrintos!');
 
        } else {
          try {
            await sendMessage(senderId, '🤔 Apdoroju...');
            const aiResult = await processWithAI(text, user);
 
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
              await sendMessage(senderId, aiResult.response || '❓ Neatpažįstu. Parašyk /pagalba.');
            }
 
          } catch (err) {
            console.log('AI klaida:', err);
            await sendMessage(senderId, '❓ Neatpažįstu komandos. Parašyk /pagalba.');
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});
 
app.get('/', (req, res) => res.send('📚 StudyBot su Claude AI + Voice veikia!'));
 
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveris paleistas ant porto ${PORT}`));
 