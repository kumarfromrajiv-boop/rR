# Part 2: talks to AI (aicredits.in -> Claude Haiku 5.5) and sends the answer to the part the AI names.
import asyncio
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
- Every "message" is read by a human. Write it in plain, friendly language (the user's language: Hindi or English). No JSON, no element numbers, no code, no error text.
- If the user message says "Step by step: ON", the user gave numbered steps: do them in order. When a step is finished, reply with "to":"part1", "step_done":N and
  "message" = what was done, then continue with the next step. Never use "step_done" when it says OFF.
- If the user's text asks to be told when something happens (e.g. "tell me when the login is done"), put "watch":true in your replies,
  check the page after every step, and as soon as it has happened reply with "to":"part1", "notify":true and "message" = what happened.
  Then keep working if the task is not finished. If the user did not ask for this, never use "watch" or "notify".
- If you get "MESSAGE PLAN", the user wants messages sent in this website's chat. Reply with {"to":"part3","action":{"type":"chat_setup","input_id":N,"send_id":M}}
  where N is the chat message box and M is the send button (null if pressing Enter sends). If you get "MESSAGE CHECK", the user wants to know whether a certain kind
  of message has arrived in the chat: reply {"to":"part1","notify":true,"message":"<what arrived, in plain language>"} if yes, otherwise {"to":"part3","action":{"type":"read"}}.
Actions: {"type":"goto","url":""} {"type":"click","id":N} {"type":"type","id":N,"text":"","enter":false}
{"type":"press","key":"Enter"} {"type":"scroll"} {"type":"read"} {"type":"done"} {"type":"chat_setup","input_id":N,"send_id":M}
The browser starts closed: your first action must be goto with the user's URL.
After each action you get DONE (what was done) and the page: numbered elements [N] and visible text. Use those numbers as id.
If you get ERROR, try another way, or ask the user via part1.
When the task is finished, reply with "to":"part1" and {"type":"done"}, and "message" = the final result for the user.
Write messages in the user's language."""

# Lines the user reads (Hindi or English). Technical text goes only to the AI.
MSG = {
    "hi": {
        "now": "अभी", "done": "हो गया", "step": "स्टेप",
        "problem": "कुछ दिक्कत आई, AI दूसरा तरीका आज़मा रहा है।",
        "step_done": "✓ स्टेप {n} पूरा हुआ: {m}",
        "finished": "काम पूरा हुआ।", "stopped": "काम रोक दिया गया।",
        "plan_ok": "मैसेज की योजना मिल गई: {n} मैसेज भेजे जाएँगे।", "msg": "मैसेज", "sent": "भेज दिया",
        "waiting": "इंतज़ार कर रहा हूँ कि ऐसा मैसेज आए: {c}", "found": "वह मैसेज आ गया।",
        "not_found": "ऐसा मैसेज अभी तक नहीं आया।", "no_box": "इस वेबसाइट पर मैसेज लिखने की जगह नहीं मिली।",
        "limit": "40 कदम में भी काम पूरा नहीं हुआ, इसलिए रोक दिया।",
        "open": "वेबसाइट खोल रहा हूँ", "click": "बटन दबा रहा हूँ", "type": "लिख रहा हूँ",
        "press": "कुंजी दबा रहा हूँ", "scroll": "पेज को नीचे ले जा रहा हूँ", "read": "पेज पढ़ रहा हूँ",
    },
    "en": {
        "now": "Now", "done": "Done", "step": "Step",
        "problem": "Something went wrong, the AI is trying another way.",
        "step_done": "✓ Step {n} done: {m}",
        "finished": "Task finished.", "stopped": "Task stopped.",
        "plan_ok": "Message plan received: {n} message(s) will be sent.", "msg": "Message", "sent": "sent",
        "waiting": "Waiting for a message like: {c}", "found": "That message has arrived.",
        "not_found": "That kind of message has not arrived.", "no_box": "Could not find a message box on this website.",
        "limit": "Stopped after 40 steps without finishing.",
        "open": "Opening the website", "click": "Clicking a button", "type": "Typing",
        "press": "Pressing a key", "scroll": "Scrolling down", "read": "Reading the page",
    },
}
WATCH_POLLS = 30        # how many times to look for the message the user waits for
WATCH_EVERY = 3.0       # seconds between two looks
ACTION_KEY = {"goto": "open", "click": "click", "type": "type", "press": "press", "scroll": "scroll"}


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


def split_steps(text) -> list[str]:
    """The user's 'Step by step' text -> list of steps (one per line, numbers/bullets removed)."""
    out = []
    for line in (text or "").splitlines():
        line = re.sub(r"^\s*(?:\d+[.)]|[-*•])\s*", "", line).strip()
        if line:
            out.append(line)
    return out


def lang_of(job: dict) -> str:
    """'hi' if the user wrote in Hindi (Devanagari), otherwise 'en'."""
    text = " ".join(str(job.get(k) or "") for k in ("task", "how", "steps"))
    return "hi" if re.search(r"[\u0900-\u097F]", text) else "en"


def human(a: dict, T: dict) -> str:
    """Plain-language line for an action (used when the AI gave no message)."""
    return T[ACTION_KEY.get(a.get("type"), "read")]


def _page_of(res, label: str):
    """(technical report, page text) from part3.perform's answer (new or old style)."""
    return (res["report"], res["page"]) if isinstance(res, dict) else (label, str(res))


async def handle_plan(job: dict, hub, msgs: list, T: dict) -> None:
    """The Message page: part3 sends the user's messages one by one (no AI for each one), then the AI checks
    whether the kind of message the user waits for has arrived."""
    plan, job["msg_plan"] = job["msg_plan"], None
    n_send = len(plan["send"])
    if n_send:
        hub.say(T["plan_ok"].format(n=n_send))
    if n_send:
        job["chat"] = None
        for _ in range(5):                                  # 1. the AI finds the message box (once)
            if job["stopped"]:
                return
            msgs.append({"role": "user", "content": "MESSAGE PLAN: the user wants messages sent, one by one, in this website's chat. "
                         "Find the message box and how to send. Reply with a chat_setup action."})
            o = await route(msgs)
            a = o.get("action") or {}
            try:
                if a.get("type") == "chat_setup":
                    await part3.chat_setup(job, a)
                    break
                res = await part3.perform(job, a or {"type": "read"})   # anything else: do it, then try again
                report, page = _page_of(res, "step")
                msgs.append({"role": "user", "content": "DONE: " + report + "\nPAGE:\n" + page})
            except Exception as e:
                print(f"[part2] chat setup failed: {e}", flush=True)
                msgs.append({"role": "user", "content": "ERROR: " + str(e)})
        if not job.get("chat"):
            hub.say(T["no_box"])
            return
        for i, text in enumerate(plan["send"], 1):          # 2. part3 sends them one by one
            if job["stopped"]:
                return
            hub.step(f"→ {T['msg']} {i}/{n_send}: {text}")
            try:
                await part3.send_chat(job, text)
            except Exception as e:
                print(f"[part2] sending failed: {e}", flush=True)
                hub.step("✗ " + T["problem"])
                break
            hub.step(f"✓ {T['msg']} {i}/{n_send} {T['sent']}")
    if plan["notify"]:                                      # 3. has the kind of message the user waits for arrived?
        hub.step(T["waiting"].format(c=plan["notify"]))
        last = None
        for _ in range(WATCH_POLLS):
            if job["stopped"]:
                return
            try:
                res = await part3.perform(job, {"type": "read"})
                _, page = _page_of(res, "read")
            except Exception as e:
                print(f"[part2] watching failed: {e}", flush=True)
                break
            if page != last:                                # ask the AI only when the page changed
                last = page
                check = [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": f'MESSAGE CHECK: has a message like this arrived in the chat? "{plan["notify"]}"\nPAGE:\n{page}'}]
                o = await route(check)
                if o.get("notify"):
                    hub.say(o.get("message") or T["found"])  # part2 -> part1 -> user
                    return
            await asyncio.sleep(WATCH_EVERY)
        hub.say(T["not_found"])


async def run(job: dict, hub) -> None:
    T = MSG[lang_of(job)]
    steps = split_steps(job.get("steps")) if job.get("step_by_step") else []   # only when the user chose Step by step
    steps_text = "\n".join(f"{i}. {t}" for i, t in enumerate(steps, 1)) or "-"
    idx = 0                                             # how many of the user's steps are done
    msgs = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"URL: {job['url']}\nTask: {job['task']}\n"
                                    f"How: {job['how'] or '-'}\n{(job.get('choice') or {}).get('text', '')}\nSteps:\n{steps_text}"},
    ]
    n = 0
    if steps:
        hub.step(f"→ {T['step']} 1/{len(steps)}: {steps[0]}")      # part2 -> part1 -> user: first step starts
    try:
        while n < 40 and not job["stopped"]:
            n += 1
            while job["pending"]:
                msgs.append({"role": "user", "content": "User says: " + job["pending"].pop(0)})
            if job.get("msg_plan") and job.get("br") is not None:      # the user filled in the Message page
                await handle_plan(job, hub, msgs, T)
                msgs.append({"role": "user", "content": "The message plan is done. Continue the task, or reply done if it is finished."})
                continue
            o = await route(msgs)
            if job["stopped"]:
                break
            if o.get("watch"):
                job["watch"] = True                     # the user asked to be told about something: only then report
            quiet = bool(steps) or bool(job.get("watch"))   # steps or a condition: no per-action lines
            action = o.get("action") or {}
            if action.get("type") == "done":            # finished: AI said part1 -> the user is told
                hub.say(o.get("message") or T["finished"])
                return
            if o.get("step_done"):                      # one of the user's steps is finished
                if steps and idx < len(steps):
                    hub.say(T["step_done"].format(n=idx + 1, m=str(o.get("message") or steps[idx])))   # part2 -> part1 -> user
                    idx += 1
                    if idx < len(steps):                # the next step starts
                        hub.step(f"→ {T['step']} {idx + 1}/{len(steps)}: {steps[idx]}")
                        msgs.append({"role": "user", "content": f"Step {idx} is done. Now do step {idx + 1}: {steps[idx]}"})
                    else:
                        msgs.append({"role": "user", "content": "All steps are done. Reply with done and the final result."})
                else:
                    hub.say(o.get("message") or T["finished"])
                    msgs.append({"role": "user", "content": "The user was told. Continue the task."})
                continue
            if o.get("notify"):                         # what the user wanted to know has happened
                hub.say(o.get("message") or T["finished"])
                msgs.append({"role": "user", "content": "The user was told. Continue the task."})
                continue
            if o["to"] == "part1":                      # the AI wants to ask the user
                a = await hub.ask(o.get("message", ""))
                if a is None:
                    break
                msgs.append({"role": "user", "content": "User answered: " + a})
                continue
            action = action or {"type": "read"}
            label = str(o.get("message") or human(action, T))
            job["step_no"] = min(idx + 1, len(steps)) if steps else None   # part3 tags its reports with this
            job["step_total"] = len(steps)
            if not quiet:
                hub.step(f"→ {T['now']}: {label}")      # user sees plain language
            try:
                res = await part3.perform(job, action)  # part3 works; the technical report goes to part2
                if isinstance(res, dict):               # new part3: report + page
                    report, page = res["report"], res["page"]
                else:                                   # old part3: only the page text
                    report, page = label, str(res)
                if not quiet:
                    hub.step(f"✓ {T['done']}: {label}")  # user: plain language, no technical text
                msgs.append({"role": "user", "content": "DONE: " + report + "\nPAGE:\n" + page})   # technical text: only to the AI
            except Exception as e:
                print(f"[part2] step failed: {e}", flush=True)   # technical error: server log + AI only
                hub.step("✗ " + T["problem"])
                msgs.append({"role": "user", "content": "ERROR: " + str(e)})
        if job["stopped"]:
            hub.say(T["stopped"])
        elif n >= 40:
            hub.say(T["limit"])
    finally:
        await part3.close(job)
