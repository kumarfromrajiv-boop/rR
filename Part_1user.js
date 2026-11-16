// Part 1: talks to the user. Takes the task, shows steps, asks the user's questions, handles Stop.
const clients = new Set();
let history = [];
let job = null;
let waiter = null;

function send(res, m) { res.write(`data: ${JSON.stringify(m)}\n\n`); }
function emit(role, text) {
  const m = { role, text };
  history.push(m);
  clients.forEach(c => send(c, m));
}
function state() {
  const m = { role: 'state', running: !!job, waiting: !!waiter };
  clients.forEach(c => send(c, m));
}

module.exports = {
  isBusy: () => !!job,
  attach(req, res) {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    history.forEach(m => send(res, m));
    send(res, { role: 'state', running: !!job, waiting: !!waiter });
    clients.add(res);
    req.on('close', () => clients.delete(res));
  },
  start(info, run) {
    history = [];
    job = { ...info, stopped: false, pending: [] };
    emit('user', `${info.task}\n${info.url}`);
    state();
    run(job, this)
      .catch(e => emit('ai', 'Error: ' + e.message))
      .finally(() => { job = null; waiter = null; state(); });
  },
  // User typed a reply: answer to an AI question, or a mid-task message.
  reply(text) {
    if (!text.trim()) return;
    emit('user', text);
    if (waiter) { const w = waiter; waiter = null; w(text); state(); }
    else if (job) job.pending.push(text);
  },
  stop() {
    if (!job) return;
    job.stopped = true;
    if (waiter) { const w = waiter; waiter = null; w(null); }
  },
  say: t => emit('ai', t),
  step: t => emit('step', t),
  // AI wants to ask the user something; resolves with the answer (or null on Stop).
  ask(q) { emit('ai', q); return new Promise(r => { waiter = r; state(); }); }
};
