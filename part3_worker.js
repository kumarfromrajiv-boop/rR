"""Part 3: does the work on the website using the chosen browser (Part 4 Playwright or Part 5 Firefox)."""
import asyncio

import part4_playwright
import part5_firefox

ADAPTERS = {"playwright": part4_playwright, "firefox": part5_firefox}

# JavaScript that runs inside the page: numbers clickable elements and returns a text snapshot.
SNAPSHOT = r"""() => {
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
}"""
SCROLL = "() => window.scrollBy(0, window.innerHeight)"


def sel(i):
    try:
        return f'[data-aib="{int(i)}"]'
    except (TypeError, ValueError):
        raise RuntimeError("This action needs a numeric id from the element list.")


async def perform(job, a):
    """Do one step. Returns a report for Part 2: what was done + the page now."""
    if job["stopped"]:
        raise RuntimeError("Stopped")
    if job["br"] is None:
        job["br"] = await ADAPTERS[job["browser"]].open()
    b = job["br"]
    t = a.get("type")
    if t == "goto":
        await b.goto(a.get("url", ""))
        report = f"opened {a.get('url', '')}"
    elif t == "click":
        await b.click(sel(a.get("id")))
        report = f"clicked element {a.get('id')}"
    elif t == "type":
        await b.type(sel(a.get("id")), a.get("text", ""), bool(a.get("enter")))
        report = f"typed in element {a.get('id')}" + (" and pressed Enter" if a.get("enter") else "")
    elif t == "press":
        await b.press(a.get("key", "Enter"))
        report = f"pressed {a.get('key', 'Enter')}"
    elif t == "scroll":
        await b.evaluate(SCROLL)
        report = "scrolled down"
    elif t == "read":
        report = "read the page"
    else:
        raise RuntimeError("Unknown action: " + str(t))
    await asyncio.sleep(1.2)
    if job["stopped"]:
        raise RuntimeError("Stopped")
    if job.get("step_no"):                            # Step by step is ON: say which step this belongs to
        report = f"[step {job['step_no']}/{job.get('step_total')}] " + report
    return {"report": report, "page": await b.evaluate(SNAPSHOT)}


def selector_js(i) -> str:
    """JavaScript (as text) that returns a stable CSS selector for element number i (element numbers can shift later)."""
    try:
        n = int(i)
    except (TypeError, ValueError):
        raise RuntimeError("This action needs a numeric id from the element list.")
    return r'''() => {
  const el = document.querySelector('[data-aib="%d"]');
  if (!el) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  for (const a of ['name', 'aria-label', 'placeholder', 'data-testid']) {
    const v = el.getAttribute(a);
    if (v) {
      const s = el.tagName.toLowerCase() + '[' + a + '="' + v.replace(/"/g, '\\"') + '"]';
      if (document.querySelectorAll(s).length === 1) return s;
    }
  }
  const path = []; let e = el;
  while (e && e.nodeType === 1 && e !== document.body) {
    let n = 1, s = e;
    while ((s = s.previousElementSibling)) n++;
    path.unshift(e.tagName.toLowerCase() + ':nth-child(' + n + ')');
    e = e.parentElement;
  }
  return 'body > ' + path.join(' > ');
}''' % n


async def chat_setup(job, a):
    """The AI found the chat's message box (and send button): remember them as stable selectors."""
    if job["br"] is None:
        raise RuntimeError("The browser is not open.")
    b = job["br"]
    inp = await b.evaluate(selector_js(a.get("input_id")))
    if not inp:
        raise RuntimeError("Message box not found.")
    send = None
    if a.get("send_id") is not None:
        send = await b.evaluate(selector_js(a.get("send_id")))
    job["chat"] = {"input": inp, "send": send}


async def send_chat(job, text):
    """Type one message into the chat and send it. No AI is needed for this."""
    if job["stopped"]:
        raise RuntimeError("Stopped")
    c, b = job["chat"], job["br"]
    await b.type(c["input"], text, c["send"] is None)     # Enter sends when there is no send button
    if c["send"]:
        await b.click(c["send"])
    await asyncio.sleep(1.5)
    return await b.evaluate(SNAPSHOT)


async def close(job):
    br = job.get("br")
    if br:
        try:
            await br.close()
        except Exception:
            pass
        job["br"] = None
