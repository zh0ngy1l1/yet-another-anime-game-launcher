import asyncio, os, uuid, threading
from datetime import datetime
from asyncio import AbstractEventLoop
from typing import Dict, Literal, Union

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from utils import ConnectionManager, run_task_in_thread
from models import InstallRequest, RepairRequest, UpdateRequest, TaskStatus, TaskResponse, OnlineGameInfo
from tasks import perform_install, perform_repair, perform_update, fetch_online_game_info

app = FastAPI(title="Sophon Game Updater", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

main_event_loop: AbstractEventLoop = None
manager: ConnectionManager = None
tasks: Dict[str, TaskStatus] = {}
task_cancel_events: Dict[str, threading.Event] = {}
# Legacy install/repair/metadata clients still share sophon_api.OPT.
operation_lock = threading.Lock()


def terminate_with_process(pid: int):
    print(f"Monitoring process {pid} for termination...")
    def _worker(target_pid: int):
        import os, time, psutil, signal
        while True:
            if not psutil.pid_exists(target_pid):
                # daemon threads somehow doesn't die with SIGTERM
                # TODO: Terminate gracefully: event based termination
                os.kill(os.getpid(), signal.SIGKILL)
            time.sleep(1)
    threading.Thread(target=_worker, args=(pid,), daemon=True).start()


def run_task(task_type: Literal["install", "repair", "update"], request: Union[InstallRequest, RepairRequest, UpdateRequest]):
    operation = {"install": perform_install, "repair": perform_repair, "update": perform_update}[task_type]
    if not operation_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another Sophon operation is already running")
    task_id = str(uuid.uuid4())

    tasks[task_id] = TaskStatus(
        task_id=task_id,
        status="pending",
    )
    task_cancel_events[task_id] = threading.Event()

    try:
        run_task_in_thread(
            manager, tasks, task_id, operation, manager, tasks, task_id, request,
            task_cancel_events[task_id], operation_lock=operation_lock,
            cancel_event=task_cancel_events[task_id],
        )
    except BaseException:
        operation_lock.release()
        del tasks[task_id]
        del task_cancel_events[task_id]
        raise
    return TaskResponse(
        task_id=task_id,
        status="pending",
        message="Task started"
    )

# Separate request schemas prevent a permissive Union from parsing an update
# or repair body as a different operation and silently dropping its fields.
@app.post("/api/install")
async def install_game(request: InstallRequest) -> TaskResponse:
    return run_task("install", request)

@app.post("/api/repair")
async def repair_game(request: RepairRequest) -> TaskResponse:
    return run_task("repair", request)

@app.post("/api/update")
async def update_game(request: UpdateRequest) -> TaskResponse:
    return run_task("update", request)

@app.get("/api/tasks/{task_id}/status")
async def get_task_status(task_id: str) -> TaskStatus:
    if task_id not in tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    return tasks[task_id]


@app.delete("/api/tasks/{task_id}")
async def cancel_task(task_id: str):
    if task_id in tasks:
        task_cancel_events[task_id].set()
    return {"message": f"Task {task_id} cancelled"}

@app.get("/api/game/online_info")
def get_online_game_info(reltype: str, game: Literal["nap", "hk4e"]) -> OnlineGameInfo:
    if not operation_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another Sophon operation is already running")
    try:
        return fetch_online_game_info(reltype, game)
    finally:
        operation_lock.release()

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    }

@app.websocket("/ws/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    await websocket.accept()
    if task_id not in tasks:
        await websocket.send_json({"type": "error", "task_id": task_id, "error": "Task not found"})
        await websocket.close()
        return
    manager.connect(task_id, websocket)

    try:
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                continue
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(task_id, websocket)


@app.on_event("startup")
def startup_event():
    global main_event_loop
    global tasks
    global manager
    global task_cancel_events
    main_event_loop = asyncio.get_event_loop()
    manager = ConnectionManager(main_event_loop)
    if os.environ.get("TERMINATE_WITH_PID"):
        pid = int(os.environ["TERMINATE_WITH_PID"])
        terminate_with_process(pid)

@app.on_event("shutdown")
async def shutdown_event():
    for event in task_cancel_events.values():
        event.set()
    manager.stop_worker()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SOPHON_PORT", 8000))
    host = os.environ.get("SOPHON_HOST", "127.0.0.1")
    uvicorn.run(app, host=host, port=port, workers=1)
