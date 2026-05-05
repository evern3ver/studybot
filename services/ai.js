const Anthropic = require('@anthropic-ai/sdk');
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

module.exports = { processWithAI };