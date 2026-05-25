const { sendMessage, sendQuickReply } = require('../utils/messenger');
const { processWithAI } = require('../services/ai');
const Group = require('../models/Group');

const DESTYTOJAS_KEY = 'PIT23-DESTYTOJAS-2026';

function generateGroupCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function handleText(senderId, text, user) {
  console.log(`📨 [${senderId}] [${user.role}]: ${text}`);

  // BDAR SUTIKIMAS - pirmas kartas
  if (!user.consentGiven) {
    if (text === 'Sutinku' || text === '✅ Sutinku') {
      user.consentGiven = true;
      await user.save();
      await sendMessage(senderId, '✅ Ačiū! Dabar gali naudotis StudyBot.\n\nParašyk /pagalba norėdamas pamatyti komandas.');
      return;
    }

    if (text === 'Nesutinku' || text === '❌ Nesutinku') {
  const User = require('../models/User');
  await User.deleteOne({ userId: senderId });
  await sendMessage(senderId, '❌ Supratau. Tavo duomenys ištrinti. Jei persigalvosi — parašyk dar kartą.');
  return;
}

    await sendQuickReply(senderId,
      '👋 Sveiki! Aš esu StudyBot — tavo mokymosi asistentas.\n\n🔒 Prieš pradedant, privalau informuoti pagal BDAR (GDPR):\n\nApdorosiu šiuos tavo duomenis:\n• Tavo "Facebook" Messenger ID\n• Užduočių sąrašą, kurį pridėsi\n• Žinučių turinį (komandoms apdoroti)\n\nDuomenys saugomi "MongoDB Atlas" duomenų bazėje ES (Frankfurt).\n\nTavo teisės:\n• Bet kada gauti savo duomenis: /mano-duomenys\n• Bet kada ištrinti viską: /ištrinti-paskyrą\n\nAr sutinki?',
      [
        { title: '✅ Sutinku', payload: 'CONSENT_YES' },
        { title: '❌ Nesutinku', payload: 'CONSENT_NO' }
      ]
    );
    return;
  }

  // DĖSTYTOJO AUTORIZACIJA
  if (text.startsWith('/dėstytojas ')) {
    const key = text.substring('/dėstytojas '.length).trim();
    if (key === DESTYTOJAS_KEY) {
      user.role = 'destytojas';
      await user.save();
      await sendMessage(senderId, '✅ Sveikiname! Tu dabar esi dėstytojas.\n\nKomandos:\n/grupė sukurti [pavadinimas]\n/grupei [kodas] [užduotis] [data]\n/mano-grupės');
    } else {
      await sendMessage(senderId, '❌ Neteisingas raktas.');
    }
    return;
  }

  // KAS AŠ?
  if (text === '/kas-as') {
    let info = `👤 Tavo statusas:\n\nRolė: ${user.role === 'destytojas' ? '👨‍🏫 Dėstytojas' : '🎓 Studentas'}`;
    if (user.groupCode) {
      const group = await Group.findOne({ groupCode: user.groupCode });
      info += `\nGrupė: ${group ? group.groupName : user.groupCode}`;
    } else if (user.role === 'student') {
      info += '\nGrupė: neprisijungęs';
    }
    await sendMessage(senderId, info);
    return;
  }

  // GDPR KOMANDOS
  if (text === '/mano-duomenys') {
    let info = `📊 Tavo duomenys mūsų sistemoje:\n\n`;
    info += `🆔 Messenger ID: ${user.userId}\n`;
    info += `👤 Rolė: ${user.role === 'destytojas' ? 'Dėstytojas' : 'Studentas'}\n`;
    if (user.groupCode) info += `📚 Grupė: ${user.groupCode}\n`;
    info += `📋 Užduočių: ${user.tasks.length}\n`;
    info += `📅 Paskyros sukūrimo data: ${user.createdAt.toLocaleDateString('lt-LT')}\n\n`;
    info += `Norėdamas ištrinti — rašyk /ištrinti-paskyrą`;
    await sendMessage(senderId, info);
    return;
  }

  if (text === '/ištrinti-paskyrą') {
    const User = require('../models/User');
    await User.deleteOne({ userId: senderId });
    await sendMessage(senderId, '🗑️ Visi tavo duomenys ištrinti.\n\nDėkojame, kad naudojaisi StudyBot!');
    return;
  }

  // DĖSTYTOJO KOMANDOS
  if (user.role === 'destytojas') {
    if (text.startsWith('/grupė sukurti ')) {
      const groupName = text.slice(15).trim();
      if (groupName) {
        const groupCode = generateGroupCode();
        const group = new Group({ groupCode, groupName, adminId: senderId, tasks: [] });
        await group.save();
        await sendMessage(senderId, `✅ Grupė sukurta!\n\nPavadinimas: ${groupName}\nKodas: ${groupCode}\n\nPasakyk studentams prisijungti: /prisijungti ${groupCode}`);
      }
      return;

    } else if (text.startsWith('/grupei ')) {
      const parts = text.slice(8).trim().split(' ');
      const groupCode = parts[0];
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      let taskName, deadline;

      if (dateRegex.test(parts[parts.length - 1])) {
        deadline = new Date(parts[parts.length - 1]);
        taskName = parts.slice(1, -1).join(' ');
      } else {
        taskName = parts.slice(1).join(' ');
        deadline = null;
      }

      const group = await Group.findOne({ groupCode });
      if (!group) {
        await sendMessage(senderId, '❌ Grupė nerasta!');
        return;
      }
      if (group.adminId !== senderId) {
        await sendMessage(senderId, '❌ Tai ne tavo grupė!');
        return;
      }

      group.tasks.push({ name: taskName, deadline });
      await group.save();

      const User = require('../models/User');
      const students = await User.find({ groupCode });
      for (const student of students) {
        const deadlineText = deadline ? ` (iki ${deadline.toLocaleDateString('lt-LT')})` : '';
        await sendMessage(student.userId, `📢 Nauja grupės užduotis:\n\n📚 ${taskName}${deadlineText}\n\nGrupė: ${group.groupName}`);
      }

      const deadlineText = deadline ? `\nTerminas: ${deadline.toLocaleDateString('lt-LT')}` : '';
      await sendMessage(senderId, `✅ Užduotis išsiųsta ${students.length} studentams!\n\n"${taskName}"${deadlineText}`);
      return;

    } else if (text === '/mano-grupės') {
      const groups = await Group.find({ adminId: senderId });
      if (groups.length === 0) {
        await sendMessage(senderId, '📋 Tu neturi grupių.\n\nSukurk: /grupė sukurti PIT-23');
      } else {
        const list = groups.map(g => `• ${g.groupName} (kodas: ${g.groupCode}) — ${g.tasks.length} užduotys`).join('\n');
        await sendMessage(senderId, `📋 Tavo grupės:\n\n${list}`);
      }
      return;
    }
  }

  if (text === '/mano-grupes') {
  if (user.groupCodes.length === 0) {
    await sendMessage(senderId, '📋 Tu nepriklausai jokiai grupei.\n\nPrisijunk: /prisijungti [kodas]');
    return;
  }
  const groups = await Group.find({ groupCode: { $in: user.groupCodes } });
  const list = groups.map(g => `• ${g.groupName} (kodas: ${g.groupCode})`).join('\n');
  await sendMessage(senderId, `📋 Tavo grupės:\n\n${list}\n\nAtsijungti: /atsijungti [kodas]`);
  return;
}

if (text.startsWith('/atsijungti ')) {
  const code = text.slice(12).trim().toUpperCase();
  if (!user.groupCodes.includes(code)) {
    await sendMessage(senderId, '❌ Tu nepriklausai šiai grupei. Patikrink savo grupes per /mano-grupes');
    return;
  }
  const group = await Group.findOne({ groupCode: code });
  user.groupCodes = user.groupCodes.filter(c => c !== code);
  await user.save();
  await sendMessage(senderId, `✅ Atsijungei nuo grupės "${group ? group.groupName : code}".`);
  return;
}

if (text.startsWith('/prisijungti ')) {
  if (user.role === 'destytojas') {
    await sendMessage(senderId, '❌ Dėstytojas negali prisijungti prie grupės kaip studentas!');
    return;
  }
  const code = text.slice(13).trim().toUpperCase();
  const group = await Group.findOne({ groupCode: code });
  if (group) {
    if (user.groupCodes.includes(code)) {
      await sendMessage(senderId, `⚠️ Jau esi šios grupės narys: "${group.groupName}"`);
    } else {
      user.groupCodes.push(code);
      await user.save();
      await sendMessage(senderId, `✅ Prisijungei prie grupės "${group.groupName}"!\n\nDabar gausi visas grupės užduotis automatiškai.\n\nNorėdamas atsijungti: /atsijungti ${code}`);
    }
  } else {
    await sendMessage(senderId, '❌ Grupė su tokiu kodu nerasta.');
  }
  return;
}
   // ATSIJUNGTI NUO GRUPĖS
if (text === '/atsijungti') {
    if (!user.groupCode) {
        await sendMessage(
            senderId,
            '❌ Tu neesi prisijungęs prie jokios grupės.'
        );
        return;
    }

    const oldGroup = user.groupCode;
    user.groupCode = null;

    await user.save();

    await sendMessage(
        senderId,
        `✅ Atsijungei nuo grupės "${oldGroup}". Daugiau negausi grupės užduočių.`
    );

    return;
}

  // BENDROS KOMANDOS
  if (text === '/pagalba') {
    let helpText = '📚 Komandos:\n\n/užduotys — mano užduotys\n/pridėti [pavadinimas] — pridėti užduotį\n/pridėti [pavadinimas] [YYYY-MM-DD] — su terminu\n/atlikta [nr.] — pažymėti atlikta\n/išvalyti — ištrinti visas\n/prisijungti [kodas] — prisijungti prie grupės\n/mano-grupes\n/atsijungti [kodas] — atsijungti nuo grupės\n/kas-as — mano statusas\n\n🔒 BDAR:\n/mano-duomenys — peržiūrėti duomenis\n/ištrinti-paskyrą — ištrinti viską\n\n💡 Arba rašyk laisvai!\n🎤 Arba siųsk balso žinutę!\n📸 Arba siųsk nuotrauką!';
    if (user.role === 'destytojas') {
      helpText += '\n\n👨‍🏫 Dėstytojo komandos:\n/grupė sukurti [pavadinimas]\n/grupei [kodas] [užduotis] [data]\n/mano-grupės';
    }
    await sendMessage(senderId, helpText);

 } else if (text === '/užduotys') {
  let allTasks = [...user.tasks];

  if (user.groupCodes && user.groupCodes.length > 0) {
    const groups = await Group.find({ groupCode: { $in: user.groupCodes } });
    for (const group of groups) {
      const groupTasks = group.tasks.map(t => ({
        name: `[${group.groupName}] ${t.name}`,
        done: false,
        deadline: t.deadline
      }));
      allTasks = [...allTasks, ...groupTasks];
    }
  }


    if (allTasks.length === 0) {
      await sendMessage(senderId, '📋 Neturi jokių užduočių!\n\nPridėk: /pridėti Matematika');
    } else {
      const list = allTasks.map((t, i) => {
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
      await sendMessage(senderId, '❌ Užduotis nerasta!');
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
        const list = user.tasks.map((t, i) => `${i + 1}. ${t.done ? '✅' : '⏳'} ${t.name}`).join('\n');
        await sendMessage(senderId, user.tasks.length === 0 ? '📋 Neturi užduočių!' : `📋 Tavo užduotys:\n\n${list}`);
      } else if (aiResult.action === 'complete_task' && aiResult.task_number) {
        const num = aiResult.task_number - 1;
        if (num >= 0 && num < user.tasks.length) {
          user.tasks[num].done = true;
          await user.save();
          await sendMessage(senderId, aiResult.response || `🎉 Atlikta!`);
        }
      } else if (aiResult.action === 'clear_tasks') {
        user.tasks = [];
        await user.save();
        await sendMessage(senderId, aiResult.response || '🗑️ Ištrinta!');
      } else {
        await sendMessage(senderId, aiResult.response || '❓ Neatpažįstu. /pagalba');
      }
    } catch (err) {
      console.log('AI klaida:', err);
      await sendMessage(senderId, '❓ Neatpažįstu komandos. /pagalba');
    }
  }

}
module.exports = { handleText };