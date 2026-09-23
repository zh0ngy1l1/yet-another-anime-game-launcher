import asyncio
import json
import threading
from collections import OrderedDict
from typing import Dict

from fastapi import WebSocket
from models import TaskStatus


class ConnectionManager:
    """Deliver ordered events and retain a bounded snapshot for late clients.

    All socket/queue state lives on the server event loop. Slow clients may miss
    intermediate progress, but terminal state is retained for reconnects and is
    independently available from the task status endpoint.
    """
    def __init__(self, event_loop: asyncio.AbstractEventLoop):
        self.active_connections = {}
        self._queues = {}
        self._writers = {}
        self._snapshots = {}
        self._event_loop = event_loop

    def connect(self, client_id: str, websocket: WebSocket):
        self.disconnect(client_id)
        self.active_connections[client_id] = websocket
        messages = asyncio.Queue(maxsize=128)
        self._queues[client_id] = messages
        for message in self._snapshots.get(client_id, {}).values():
            messages.put_nowait(message)
        self._writers[client_id] = self._event_loop.create_task(
            self._write_messages(client_id, websocket, messages)
        )

    def disconnect(self, client_id: str, websocket=None):
        if websocket is not None and self.active_connections.get(client_id) is not websocket:
            return
        self.active_connections.pop(client_id, None)
        self._queues.pop(client_id, None)
        writer = self._writers.pop(client_id, None)
        if writer is not None and writer is not asyncio.current_task():
            writer.cancel()

    async def _write_messages(self, client_id, websocket, messages):
        try:
            while True:
                message = await messages.get()
                await websocket.send_text(json.dumps(message))
        except (Exception, asyncio.CancelledError):
            self.disconnect(client_id, websocket)

    def _publish(self, message, client_id):
        snapshot = self._snapshots.setdefault(client_id, OrderedDict())
        if "completed" in snapshot or "error" in snapshot:
            return
        kind = message["type"]
        snapshot.pop(kind, None)
        snapshot[kind] = message
        while len(snapshot) > 32:
            snapshot.popitem(last=False)
        messages = self._queues.get(client_id)
        if messages is not None:
            if messages.full():
                messages.get_nowait()
            messages.put_nowait(message)

    def send_message_threadsafe(self, message: dict, client_id: str):
        self._event_loop.call_soon_threadsafe(self._publish, dict(message), client_id)

    def stop_worker(self):
        for client_id in list(self.active_connections):
            self.disconnect(client_id)


def run_task_in_thread(manager: ConnectionManager, tasks: Dict[str, TaskStatus],
                       task_id: str, operation_func, *args,
                       operation_lock=None, cancel_event=None):
    def task_runner():
        try:
            tasks[task_id].status = "running"
            if cancel_event is not None and cancel_event.is_set():
                raise InterruptedError("Operation cancelled")
            result = operation_func(*args)
            if cancel_event is not None and cancel_event.is_set():
                raise InterruptedError("Operation cancelled")
            # Publish authoritative status before announcing completion.
            tasks[task_id].status = "completed"
            manager.send_message_threadsafe({
                "type": "completed", "task_id": task_id, "result": result,
            }, task_id)
        except Exception as error:
            cancelled = cancel_event is not None and cancel_event.is_set()
            tasks[task_id].status = "cancelled" if cancelled else "failed"
            tasks[task_id].error = str(error)
            manager.send_message_threadsafe({
                "type": "error", "task_id": task_id, "error": str(error),
            }, task_id)
        finally:
            if operation_lock is not None:
                operation_lock.release()

    thread = threading.Thread(target=task_runner, daemon=True)
    thread.start()
    return thread
