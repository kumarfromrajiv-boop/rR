# Part 1: talks to the user. Takes the task, shows steps, asks the user's questions, handles Stop.
import asyncio
import json
import re
import sys
from types import SimpleNamespace

from fastapi import Request
from fastapi.responses import StreamingResponse

clients: set[asyncio.Queue] = set()
history: list[dict] = []
job = None
waiter: asyncio.Future | None = None
_task = None


def _send(q: asyncio.Queue, m: dict) -> None:
    q.put_nowait(m)


def emit(role: str, text: str) -> None:
    m = {"role": role, "text": text}
    history.append(m)
    for c in list(clients):
        _send(c, m)


def state() -> None:
    m = {"role": "state", "running": job is not None, "waiting": waiter is not None}
    for c in list(clients):
        _send(c, m)


def is_busy() -> bool:
    return job is not None


def attach(request: Request) -> StreamingResponse:
    q: asyncio.Queue = asyncio.Queue()
    for m in history:
        _send(q, m)
    _send(q, {"role": "state", "running": job is not None, "waiting": waiter is not None})
    clients.add(q)

    async def gen():
        try:
            while not await request.is_disconnected():
                try:
                    m = await asyncio.wait_for(q.get(), 15)
                    yield f"data: {json.dumps(m)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            clients.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def start(info: dict, run) -> None:
    global job, _task
    history.clear()
    job = {**info, "stopped": False, "pending": [], "br": None}
    emit("user", f"{info['task']}\n{info['url']}")
    state()
    _task = asyncio.create_task(_run(job, run))


async def _run(j: dict, run) -> None:
    global job, waiter
    try:
        await run(j, SimpleNamespace(say=say, step=step, ask=ask))
    except Exception as e:
        print(f"[part1] task failed: {e}", flush=True)           # technical reason: server log only
        hi = bool(re.search(r"[\u0900-\u097F]", str(j.get("task", ""))))
        emit("ai", "कुछ गड़बड़ हो गई और काम रुक गया। कृपया फिर से कोशिश कीजिए।" if hi
             else "Something went wrong and the task stopped. Please try again.")
    finally:
        job = None
        waiter = None
        state()


def reply(text: str) -> None:
    """The user typed a reply: an answer to an AI question, or a message during the task."""
    global waiter
    text = text.strip()
    if not text:
        return
    emit("user", text)
    if waiter is not None and not waiter.done():
        w, waiter = waiter, None
        w.set_result(text)
        state()
    elif job:
        job["pending"].append(text)


def stop() -> None:
    global waiter
    if not job:
        return
    job["stopped"] = True
    if waiter is not None and not waiter.done():
        w, waiter = waiter, None
        w.set_result(None)


def say(t) -> None:
    emit("ai", str(t))


def step(t) -> None:
    emit("step", str(t))


async def ask(q):
    """The AI wants to ask the user something; returns the answer (None if Stop was pressed)."""
    global waiter
    emit("ai", str(q))
    waiter = asyncio.get_running_loop().create_future()
    state()
    return await waiter


def set_plan(plan: dict) -> bool:
    """The user filled in the Message page: keep the plan for the running task (Part 2 picks it up)."""
    if job is None:
        return False
    job["msg_plan"] = plan
    emit("user", plan["text"])
    return True
