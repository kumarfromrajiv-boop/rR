# Main file: serves the pages and connects all parts.
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

load_dotenv()

import part1_user as hub
import part2_ai_router as part2
import part6_checker as part6

BASE_DIR = Path(__file__).parent

app = FastAPI()


async def get_json(request: Request) -> dict:
    try:
        body = await request.json()
    except Exception:
        return {}
    return body if isinstance(body, dict) else {}


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
