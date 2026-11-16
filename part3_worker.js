// Part 3: does the work on the website using the chosen browser (Part 4 Playwright or Part 5 Firefox).
const adapters = {
  playwright: require('./part4_playwright'),
  firefox: require('./part5_firefox')
};

// Runs inside the page: numbers clickable elements and returns a text snapshot.
function snapshot() {
  const out = []; let i = 0;
  document.querySelectorAll('a,button,input,textarea,select,[role=button]').forEach(e => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || i >= 40) return;
    e.setAttribute('data-aib', i);
    const label = (e.innerText || e.value || e.placeholder || e.getAttribute('aria-label') || e.name || '').trim().slice(0, 50);
    out.push('[' + i + '] ' + e.tagName.toLowerCase() + (e.type ? '(' + e.type + ')' : '') + ' "' + label + '"');
    i++;
  });
  return 'URL: ' + location.href + '\nTitle: ' + document.title + '\nElements:\n' + out.join('\n') +
    '\nText:\n' + document.body.innerText.slice(0, 2500);
}

const sel = id => `[data-aib="${Number(id)}"]`;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function perform(job, a) {
  if (job.stopped) throw new Error('Stopped');
  if (!job.br) job.br = await adapters[job.browser].open();
  const b = job.br;
  switch (a.type) {
    case 'goto': await b.goto(a.url); break;
    case 'click': await b.click(sel(a.id)); break;
    case 'type': await b.type(sel(a.id), a.text || '', !!a.enter); break;
    case 'press': await b.press(a.key || 'Enter'); break;
    case 'scroll': await b.evaluate(() => window.scrollBy(0, window.innerHeight)); break;
    case 'read': break;
    default: throw new Error('Unknown action: ' + a.type);
  }
  await wait(1200);
  if (job.stopped) throw new Error('Stopped');
  return b.evaluate(snapshot);
