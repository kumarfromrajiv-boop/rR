# Part 2: talks to AI (aicredits.in -> Claude Haiku 5.5) and sends the answer to the part the AI names.
import json
import os
import re

import httpx

import part3_worker as part3

BASE = os.getenv("AI_BASE_URL") or "https://api.aicredits.in/v1"
MODEL = os.getenv("AI_MODEL") or "claude-haiku-5.5"

SYSTEM = """You operate a real web browser on a server to finish the user's task.
Reply ONLY with JSON: {"to":"part3" or "part1","message":"short text","action":{...}}
- "to":"part3" = run the action in the browser. "message" = one short line saying what you do.
- "to":"part1" = ask the user a question (use when stuck, or a choice/login/secret is needed). "message" = the question.
- If the user gave numbered steps, do them in order. When a step is finished, reply with "to":"part1", "step_done":N and
  "message" = what was done, then continue with the next step. Never use "step_done" if no steps were given.
- If the user's text asks to be told when something happens (e.g. "tell me when the login is done"), put "watch":true in your replies,
  check the page after every step, and as soon as it has happened reply with "to":"part1", "notify":true and "message" = what happened.
  Then keep working if the task is not finished. If the user did not ask for this, never use "watch" or "notify".
Actions: {"type":"goto","url":""} {"type":"click","id":N} {"type":"type","id":N,"text":"","enter":false}
{"type":"press","key":"Enter"} {"type":"scroll"} {"type":"read"} {"type":"done"}
The browser starts closed: your first action must be goto with the user's URL.
After each action you get DONE (what was done) and the page: numbered elements [N] and visible text. Use those numbers as id.
If you get ERROR, try another way, or ask the user via part1.
When the task is finished, reply with "to":"part1" and {"type":"done"}, and "message" = the final result for the user.
Write messages in the user's language."""


async def ask(messages: list[dict]) -> str:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            BASE + "/chat/completions",
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + str(os.getenv("AI_API_KEY")),
            },
            json={"model": MODEL, "messages": messages, "max_tokens": 1000},
        )
