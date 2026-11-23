# Main file: serves the pages and connects all parts.
import ipaddress
import os
import socket
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
import uvicorn

load_dotenv()

import part1_user as hub
import part2_ai_router as part2
import part6_checker as part6
from page import HTML

app = FastAPI()


def url_ok(url: str) -> bool:
    """Only normal web addresses (http / https). No file:// and no addresses inside the server's own network."""
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        return False
    host = p.hostname.lower()
    if host == "localhost" or host.endswith(".local"):
        return False
    try:
        raw = host
        try:
            raw = socket.inet_ntoa(socket.inet_aton(host))   # 127.1, 0x7f000001, 2130706433 -> 127.0.0.1
        except OSError:
            pass
        ip = ipaddress.ip_address(raw)
        return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_unspecified)
    except ValueError:
        return True                               # a normal name like example.com


async def get_json(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


# The website (3 pages + the Message page) lives in page.py.
@app.get("/", response_class=HTMLResponse)
async def home():
    return HTML


# Part 6: is the chosen browser on the server, and is it Live or Busy?
@app.get("/api/check")
async def api_check(browser: str | None = None):
    return await part6.check(browser, hub.is_busy())


# Start a task: URL + task + chosen browser + Step by step go to Part 1, which starts the flow.
@app.post("/api/task")
async def api_task(request: Request):
    body = await get_json(request)
    url = (body.get("url") or "").strip()
    task = (body.get("task") or "").strip()
    browser = body.get("browser")
    if not url or not task or browser not in ("playwright", "firefox"):
        return JSONResponse({"error": "URL, task and browser are required."}, status_code=400)
    if not url_ok(url):
        return JSONResponse({"error": "Enter a full web address that starts with http:// or https://"}, status_code=400)

    sbs = bool(body.get("step_by_step"))                      # Step by step ticked?
    steps = (body.get("steps") or "").strip() if sbs else ""
    if sbs and not steps:
        return JSONResponse({"error": "Write the steps, or turn off Step by step."}, status_code=400)

    if hub.is_busy():
        return JSONResponse({"error": "Server is Busy with another task."}, status_code=409)
    c = await part6.check(browser, False)
    if not c["exists"]:
        return JSONResponse({"error": c["detail"] or "Browser not found on server."}, status_code=400)
    if hub.is_busy():   # re-check: another request may have started while we were checking
        return JSONResponse({"error": "Server is Busy with another task."}, status_code=409)

    choice = part6.selection(browser, sbs)                    # Part 6 sees what the user chose
    hub.start({"url": url, "task": task, "how": str(body.get("how") or ""), "steps": steps,
               "step_by_step": sbs, "choice": choice, "browser": browser}, part2.run)
    return {"ok": True}


# The Message page: messages to send (one per line) + what kind of message the user waits for.
@app.post("/api/message")
async def api_message(request: Request):
    body = await get_json(request)
    plan = part6.message_plan(body.get("send"), body.get("notify"))   # Part 6 looks: is there anything to do?
    if not plan["has_plan"]:
        return JSONResponse({"error": "Write the messages to send, or what you want to be told about."}, status_code=400)
    if not hub.set_plan(plan):
        return JSONResponse({"error": "No task is running."}, status_code=409)
    return {"ok": True}


# A reply typed in the Chat page.
@app.post("/api/reply")
async def api_reply(request: Request):
    body = await get_json(request)
    hub.reply(str(body.get("text", "")))
    return {"ok": True}


# The Stop button.
@app.post("/api/stop")
async def api_stop():
    hub.stop()
    return {"ok": True}


# Live messages for the Chat page.
@app.get("/api/events")
async def api_events(request: Request):
    res = hub.attach(request)
    if isinstance(res, StreamingResponse):        # your Part 1 already wraps it
        return res
    return StreamingResponse(res, media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "3000")))
