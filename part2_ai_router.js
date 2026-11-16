// Part 2: talks to AI (aicredits.in -> Claude Haiku 5.5) and sends the answer to the part the AI names.
const part3 = require('./part3_worker');

const BASE = process.env.AI_BASE_URL || 'https://api.aicredits.in/v1';
const MODEL = process.env.AI_MODEL || 'claude-haiku-5.5';

const SYSTEM = `You operate a real web browser on a server to finish the user's task.
Reply ONLY with JSON: {"to":"part3" or "part1","message":"short text","action":{...}}
- "to":"part3" = run the action in the browser. "message" = one short line saying what you do.
- "to":"part1" = ask the user a question (use when stuck, or a choice/login/secret is needed). "message" = the question.
Actions: {"type":"goto","url":""} {"type":"click","id":N} {"type":"type","id":N,"text":"","enter":false}
{"type":"press","key":"Enter"} {"type":"scroll"} {"type":"read"} {"type":"done"}
The browser starts closed: your first action must be goto with the user's URL.
After each action you get the page: numbered elements [N] and visible text. Use those numbers as id.
If you get ERROR, try another way, or ask the user via part1.
When the task is finished use {"type":"done"} with "message" = the final answer.
Write messages in the user's language.`;

async function ask(messages) {
  const r = await fetch(BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.AI_API_KEY },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 1000 })
  });
  if (!r.ok) throw new Error(`AI error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).choices[0].message.content;
}

function parse(t) { try { return JSON.parse(t.match(/\{[\s\S]*\}/)[0]); } catch { return null; } }

// Route check: the AI answer must name part1 or part3. If not, ask the AI again.
async function route(msgs) {
  for (let i = 0; i < 3; i++) {
    const raw = await ask(msgs);
    const o = parse(raw);
    msgs.push({ role: 'assistant', content: raw });
    if (o && ['part1', 'part3'].includes(o.to)) return o;
    msgs.push({ role: 'user', content: 'You did not say which part to send this to. Reply again as JSON with "to": "part1" or "part3".' });
  }
  throw new Error('AI did not say which part to send to.');
