require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cron = require('node-cron');
const User = require('./models/User');
const { sendMessage } = require('./utils/messenger');
const webhookRouter = require('./routes/webhook');

const app = express();
app.use(bodyParser.json());
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true');
  next();
});

// MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB prijungtas!'))
  .catch(err => console.log('❌ MongoDB klaida:', err));

// Automatiniai priminimai kas dieną 9:00
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

// Routes
app.use('/webhook', webhookRouter);
app.get('/', (req, res) => res.send('📚 StudyBot veikia!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Serveris paleistas ant porto ${PORT}`));