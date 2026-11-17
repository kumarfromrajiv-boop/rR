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
Actions: {"type":"goto","url":""} {"type":"click","id":N} {"type":"type","id":N,"text":"","enter":false}
{"type":"press","key":"Enter"} {"type":"scroll"} {"type":"read"} {"type":"done"}
The browser starts closed: your first action must be goto with the user's URL.
After each action you get the page: numbered elements [N] and visible text. Use those numbers as id.
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
    if r.status_code >= 400:
        raise RuntimeError(f"AI error {r.status_code}: {r.text[:200]}")
    return r.json()["choices"][0]["message"]["content"]


def parse(t: str):
    try:
        return json.loads(re.search(r"\{.*\}", t, re.S).group(0))
    except Exception:
        return None


# Route check: the AI answer must name part1 or part3. If not, ask the AI again.
async def route(msgs: list[dict]) -> dict:
    for _ in range(3):
        raw = await ask(msgs)
        o = parse(raw)
        msgs.append({"role": "assistant", "content": raw})
        if isinstance(o, dict) and o.get("to") in ("part1", "part3"):
            return o
        msgs.append({"role": "user", "content": 'You did not say which part to send this to. '
                     'Reply again as JSON with "to": "part1" or "part3".'})
    raise RuntimeError("AI did not say which part to send to.")


def describe(a: dict) -> str:
    extra = a.get("url") or (f"#{a['id']}" if "id" in a else "")
    return f"{a.get('type', 'read')} {extra}".strip()


async def run(job: dict, hub) -> None:
    msgs = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"URL: {job['url']}\nTask: {job['task']}\n"
                                    f"How: {job['how'] or '-'}\nSteps: {job['steps'] or '-'}"},
    ]
    n = 0
    try:
        while n < 40 and not job["stopped"]:
            n += 1
            while job["pending"]:
                msgs.append({"role": "user", "content": "User says: " + job["pending"].pop(0)})
            o = await route(msgs)
            if job["stopped"]:
                break
            action = o.get("action") or {}
            if action.get("type") == "done":            # काम पूरा: AI ने part1 लिखा -> यूज़र को खबर
                hub.say(o.get("message") or "Done.")
                return
            if o["to"] == "part1":                      # AI यूज़र से पूछना चाहता है
                a = await hub.ask(o.get("message", ""))
                if a is None:
                    break
                msgs.append({"role": "user", "content": "User answered: " + a})
                continue
            action = action or {"type": "read"}
            label = str(o.get("message") or describe(action))
            hub.step("→ Now: " + label)                 # भाग 2 -> भाग 1 -> यूज़र: अभी ये चल रहा है
            try:
                res = await part3.perform(job, action)  # भाग 3 काम करता है, नतीजा भाग 2 को
                hub.step("✓ Done: " + label)            # भाग 2 -> भाग 1 -> यूज़र: ये हो चुका
                msgs.append({"role": "user", "content": "RESULT:\n" + res})   # भाग 2 -> AI
            except Exception as e:
                hub.step("✗ Problem: " + str(e))
                msgs.append({"role": "user", "content": "ERROR: " + str(e)})
        if job["stopped"]:
            hub.say("Task stopped.")
        elif n >= 40:
            hub.say("Stopped after 40 steps without finishing.")
    finally:
        await part3.close(job)
