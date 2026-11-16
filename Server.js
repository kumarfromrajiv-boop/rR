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


# Start a task: URL + task + chosen browser go to Part 1, which starts the flow.
@app.post("/api/task")
async def api_task(request: Request):
    body = await get_json(request)
    url = body.get("url")
