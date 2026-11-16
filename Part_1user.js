# Part 1: talks to the user. Takes the task, shows steps, asks the user's questions, handles Stop.
import asyncio
import json
import sys
from types import SimpleNamespace

from fastapi import Request
from fastapi.responses import StreamingResponse

clients: set[asyncio.Queue] = set()
history: list[dict] = []
job = None
waiter: asyncio.Future | None = None


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
