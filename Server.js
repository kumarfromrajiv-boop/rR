// Main file: serves the pages and connects all parts.
require('dotenv').config();
const express = require('express');
const path = require('path');
const hub = require('./part1_user');
const part2 = require('./part2_ai_router');
const part6 = require('./part6_checker');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Part 6: is the chosen browser on the server, and is it Live or Busy?
app.get('/api/check', async (req, res) => {
  res.json(await part6.check(req.query.browser, hub.isBusy()));
});

// Start a task: URL + task + chosen browser go to Part 1, which starts the flow.
app.post('/api/task', async (req, res) => {
  const { url, task, how, steps, browser } = req.body || {};
  if (!url || !task || !['playwright', 'firefox'].includes(browser))
    return res.status(400).json({ error: 'URL, task and browser are required.' });
  if (hub.isBusy()) return res.status(409).json({ error: 'Server is Busy with another task.' });
  const c = await part6.check(browser, false);
  if (!c.exists) return res.status(400).json({ error: c.detail || 'Browser not found on server.' });
  hub.start({ url, task, how, steps, browser }, part2.run);
  res.json({ ok: true });
});

app.post('/api/reply', (req, res) => { hub.reply(String(req.body.text || '')); res.json({ ok: true }); });
app.post('/api/stop', (req, res) => { hub.stop(); res.json({ ok: true }); });
app.get('/api/events', (req, res) => hub.attach(req, res));

app.listen(process.env.PORT || 3000, () => console.log('AI Browser running on port ' + (process.env.PORT || 3000)));
