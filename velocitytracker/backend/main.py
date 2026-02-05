"""
FastAPI Backend for VeloLift
Provides WebSocket streaming at 50Hz for real-time velocity tracking.
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.ws_manager import ConnectionManager
from backend.session_manager import SessionManager
from backend.velocity_processor import VelocityProcessor
from backend.fatigue_detector import VelocityRepTracker
from backend.models import SessionSummary, CalibrationRequest, ConnectionStatus, SetConfig
import json
import os
import sys
from pathlib import Path

# Add parent directory to path to allow importing config
sys.path.insert(0, str(Path(__file__).parent.parent))
from config import get_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global instances
connection_manager = ConnectionManager()
session_manager: Optional[SessionManager] = None
velocity_processor: Optional[VelocityProcessor] = None
current_set_config: Optional[SetConfig] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle manager."""
    global session_manager, velocity_processor

    # Startup
    logger.info("Starting VeloLift backend...")

    session_manager = SessionManager()

    config = get_config()
    velocity_processor = VelocityProcessor(
        connection_manager=connection_manager,
        serial_port=config.hardware.arduino_port,
        velocity_rep_tracker=session_manager.rep_tracker,
        session_manager=session_manager,
    )

    # Start background velocity processing
    asyncio.create_task(velocity_processor.start())

    logger.info("VeloLift backend started")

    yield

    # Shutdown
    logger.info("Shutting down VeloLift backend...")
    if velocity_processor:
        await velocity_processor.stop()
    logger.info("VeloLift backend stopped")


app = FastAPI(
    title="VeloLift API",
    description="Real-time velocity tracking with WebSocket streaming",
    version="2.0.0",
    lifespan=lifespan
)

# CORS — restrict to configured origins (defaults to Vite dev server)
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    Main WebSocket endpoint for real-time data streaming.
    Streams velocity metrics at 50Hz (20ms intervals).
    """
    await connection_manager.connect(websocket)
    try:
        while True:
            # Receive commands from client
            data = await websocket.receive_json()
            await handle_client_command(websocket, data)
    except WebSocketDisconnect:
        connection_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        connection_manager.disconnect(websocket)


VALID_COMMANDS = {"reset", "recalibrate", "get_summary", "start_set", "get_set", "start_workout", "end_workout", "get_workout"}

async def handle_client_command(websocket: WebSocket, data: dict):
    """Handle commands from the WebSocket client."""
    command = data.get("command")

    # Input sanitization: reject unknown commands
    if not command or not isinstance(command, str) or command not in VALID_COMMANDS:
        await websocket.send_json({"type": "error", "message": "Invalid command"})
        return

    if command == "reset":
        if session_manager:
            session_manager.reset()
        if velocity_processor:
            velocity_processor.fatigue_detector.reset()
            velocity_processor._last_rep_count = 0
        await websocket.send_json({"type": "ack", "command": "reset"})
        logger.info("Session reset via WebSocket command")

    elif command == "recalibrate":
        if session_manager:
            session_manager.recalibrate()
        await websocket.send_json({"type": "ack", "command": "recalibrate"})
        logger.info("Baseline recalibrated via WebSocket command")

    elif command == "get_summary":
        if session_manager:
            summary = session_manager.get_summary()
            await websocket.send_json(summary.model_dump())

    elif command == "start_set":
        global current_set_config
        exercise = data.get("exercise", "Squat")
        weight = data.get("weight", 0.0)
        unit = data.get("unit", "lbs")

        # Input sanitization: validate exercise name and weight
        if not isinstance(exercise, str) or len(exercise) > 100:
            exercise = "Squat"
        exercise = exercise.strip()[:100]  # Limit length

        if not isinstance(weight, (int, float)) or weight < 0 or weight > 2000:
            weight = 0.0

        if unit not in ("lbs", "kg"):
            unit = "lbs"

        current_set_config = SetConfig(exercise=exercise, weight=float(weight), unit=unit)
        
        # Reset session for new set and update config
        if session_manager:
            session_manager.update_config(exercise, weight, unit)
            session_manager.reset()
            
        if velocity_processor:
            velocity_processor.fatigue_detector.reset()
        # Broadcast set config to all clients
        await connection_manager.broadcast(current_set_config.model_dump())
        await websocket.send_json({"type": "ack", "command": "start_set"})
        logger.info(f"Started set: {exercise} @ {weight} {unit}")

    elif command == "get_set":
        if current_set_config:
            await websocket.send_json(current_set_config.model_dump())
        else:
            await websocket.send_json({"type": "set_config", "exercise": None, "weight": 0, "unit": "lbs"})

    elif command == "start_workout":
        workout_name = data.get("name", "Workout")
        workout_date = data.get("date")  # YYYY-MM-DD or None
        if session_manager:
            workout = session_manager.start_workout(workout_name, workout_date)
            await connection_manager.broadcast({
                "type": "workout_started",
                "id": workout.id,
                "name": workout.name,
                "date": workout.date,
                "started_at": workout.started_at
            })
        await websocket.send_json({"type": "ack", "command": "start_workout"})
        logger.info(f"Started workout: {workout_name} ({workout_date})")

    elif command == "end_workout":
        if session_manager:
            workout = session_manager.end_workout()
            if workout:
                await connection_manager.broadcast({
                    "type": "workout_ended",
                    "id": workout.id,
                    "name": workout.name,
                    "set_count": len(workout.sets),
                    "duration": (workout.ended_at - workout.started_at) if workout.ended_at else 0
                })
        await websocket.send_json({"type": "ack", "command": "end_workout"})
        logger.info("Ended workout")

    elif command == "get_workout":
        if session_manager:
            workout_info = session_manager.get_active_workout()
            await websocket.send_json({
                "type": "active_workout",
                "workout": workout_info
            })

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "hardware_connected": velocity_processor.hardware_connected if velocity_processor else False,
        "connections": connection_manager.connection_count
    }


@app.get("/api/status", response_model=ConnectionStatus)
async def get_status():
    """Get detailed status information."""
    return ConnectionStatus(
        hardware_connected=velocity_processor.hardware_connected if velocity_processor else False,
    )


@app.get("/api/history")
async def get_history():
    """Get completed set history (standalone sets only)."""
    history_file = "history.json"
    if not os.path.exists(history_file):
        return []
        
    try:
        with open(history_file, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read history: {e}")
        return []


@app.delete("/api/history/{set_id}")
async def delete_set(set_id: str):
    """Delete a set from history."""
    history_file = "history.json"
    if not os.path.exists(history_file):
        return {"success": False, "error": "No history file"}
        
    try:
        with open(history_file, "r") as f:
            history = json.load(f)
        
        # Filter out the set with matching ID
        original_length = len(history)
        history = [s for s in history if s.get("id") != set_id]
        
        if len(history) == original_length:
            return {"success": False, "error": "Set not found"}
        
        with open(history_file, "w") as f:
            json.dump(history, f, indent=2)
        
        logger.info(f"Deleted set {set_id}")
        return {"success": True}
    except Exception as e:
        logger.error(f"Failed to delete set: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/workouts")
async def get_workouts():
    """Get workout history."""
    workouts_file = "workouts.json"
    if not os.path.exists(workouts_file):
        return []
        
    try:
        with open(workouts_file, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to read workouts: {e}")
        return []

@app.get("/api/session/summary", response_model=SessionSummary)
async def get_session_summary():

    """Get current session summary."""
    if session_manager:
        return session_manager.get_summary()
    return SessionSummary(
        total_reps=0,
        max_velocity=0.0,
        avg_velocity=0.0,
    )


@app.post("/api/session/reset")
async def reset_session():
    """Reset the current lifting session."""
    if session_manager:
        session_manager.reset()
    if velocity_processor:
        velocity_processor.fatigue_detector.reset()
        velocity_processor._last_rep_count = 0
    return {"status": "reset"}


@app.post("/api/calibrate")
async def calibrate(request: CalibrationRequest):
    """Recalibrate baseline measurements."""
    if session_manager:
        session_manager.recalibrate()
    if request.calibrate_hardware and velocity_processor:
        velocity_processor.calibrate_hardware()
    return {"status": "calibrated"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
