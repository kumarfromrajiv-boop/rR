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
    return {"report": report, "page": await b.evaluate(SNAPSHOT)}


async def close(job):
    br = job.get("br")
    if br:
        try:
            await br.close()
        except Exception:
            pass
        job["br"] = None
