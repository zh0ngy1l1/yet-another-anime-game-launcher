#!/usr/bin/env python3
"""REST/WS regression tests with fake tasks; never touches a game or network."""
import asyncio
import importlib
import json
import pathlib
import sys
import threading
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "sophon_server"))
from fastapi.testclient import TestClient
from models import TaskStatus, UpdateRequest, RepairRequest
from utils import ConnectionManager, run_task_in_thread

fake_tasks = types.ModuleType("tasks")
for name in ("perform_install", "perform_repair", "perform_update", "fetch_online_game_info"):
    setattr(fake_tasks, name, lambda *args: None)
with patch.dict(sys.modules, {"tasks": fake_tasks}):
    server = importlib.import_module("server")


class ServerTests(unittest.TestCase):
    def setUp(self):
        server.tasks.clear()
        server.task_cancel_events.clear()
        self.context = TestClient(server.app)
        self.client = self.context.__enter__()

    def tearDown(self):
        self.context.__exit__(None, None, None)

    def test_route_preserves_operation_specific_fields(self):
        seen = []
        def capture(kind, request):
            seen.append((kind, request))
            return dict(task_id="task", status="pending", message="started")
        with patch.object(server, "run_task", capture):
            self.assertEqual(self.client.post("/api/update", json={"gamedir": "/fake", "game_type": "hk4e", "predownload": True}).status_code, 200)
            self.assertEqual(self.client.post("/api/repair", json={"gamedir": "/fake", "game_type": "hk4e", "repair_mode": "reliable"}).status_code, 200)
            self.assertEqual(self.client.post("/api/install", json={"gamedir": "/fake", "game_type": "hk4e"}).status_code, 422)
        self.assertIsInstance(seen[0][1], UpdateRequest)
        self.assertTrue(seen[0][1].predownload)
        self.assertIsInstance(seen[1][1], RepairRequest)
        self.assertEqual(seen[1][1].repair_mode, "reliable")

    def test_rejects_concurrent_operations_and_metadata(self):
        server.operation_lock.acquire()
        try:
            self.assertEqual(self.client.post("/api/update", json={"gamedir": "/fake", "game_type": "hk4e"}).status_code, 409)
            self.assertEqual(self.client.get("/api/game/online_info?game=hk4e&reltype=os").status_code, 409)
        finally:
            server.operation_lock.release()
        self.assertEqual(server.tasks, {})

    def test_terminal_event_replayed_to_late_websocket(self):
        response = self.client.post("/api/update", json={"gamedir": "/fake", "game_type": "hk4e"})
        task_id = response.json()["task_id"]
        with self.client.websocket_connect(f"/ws/{task_id}") as websocket:
            self.assertEqual(websocket.receive_json()["type"], "completed")
        self.assertEqual(self.client.get(f"/api/tasks/{task_id}/status").json()["status"], "completed")

    def test_unknown_task_is_explicit_error(self):
        self.assertEqual(self.client.get("/api/tasks/absent/status").status_code, 404)
        with self.client.websocket_connect("/ws/absent") as websocket:
            self.assertEqual(websocket.receive_json()["type"], "error")


class ManagerTests(unittest.IsolatedAsyncioTestCase):
    async def test_bounded_progress_retains_terminal_and_reconnect(self):
        manager = ConnectionManager(asyncio.get_running_loop())
        for i in range(1000):
            manager.send_message_threadsafe({"type": "update_stage", "completed_files": i}, "task")
        manager.send_message_threadsafe({"type": "completed"}, "task")
        await asyncio.sleep(0)
        messages = []
        class Socket:
            async def send_text(self, text): messages.append(json.loads(text))
        socket = Socket()
        manager.connect("task", socket)
        await asyncio.sleep(0)
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[-1]["type"], "completed")
        self.assertEqual(messages[0]["completed_files"], 999)
        manager.stop_worker()

    async def test_old_disconnect_does_not_drop_replacement_socket(self):
        manager = ConnectionManager(asyncio.get_running_loop())
        class Socket:
            async def send_text(self, text): pass
        old, new = Socket(), Socket()
        manager.connect("task", old)
        manager.connect("task", new)
        manager.disconnect("task", old)
        self.assertIs(manager.active_connections["task"], new)
        manager.stop_worker()


class WorkerTests(unittest.TestCase):
    def test_cancellation_and_failure_release_operation_lock(self):
        for cancel in (False, True):
            with self.subTest(cancel=cancel):
                tasks = {"task": TaskStatus(task_id="task", status="pending")}
                event = threading.Event()
                if cancel: event.set()
                lock = threading.Lock()
                lock.acquire()
                messages = []
                class Manager:
                    def send_message_threadsafe(self, message, task_id):
                        messages.append((tasks[task_id].status, message["type"]))
                def fail(): raise ValueError("checksum mismatch")
                thread = run_task_in_thread(Manager(), tasks, "task", fail, operation_lock=lock, cancel_event=event)
                thread.join(timeout=2)
                expected = "cancelled" if cancel else "failed"
                self.assertEqual(tasks["task"].status, expected)
                self.assertEqual(messages, [(expected, "error")])
                self.assertFalse(lock.locked())


if __name__ == "__main__":
    unittest.main()
