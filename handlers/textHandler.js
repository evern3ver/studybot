const { sendMessage } = require('../utils/messenger');
const { processWithAI } = require('../services/ai');

async function handleText(senderId, text, user) {
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

module.exports = { handleText };