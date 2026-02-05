"""
Pydantic models for API and WebSocket payloads.
Velocity-only data models.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from enum import Enum


class LiftPhase(str, Enum):
    """Phases of a lifting rep."""
    STANDING = "standing"
    DESCENDING = "descending"
    BOTTOM = "bottom"
    ASCENDING = "ascending"


class FrameData(BaseModel):
    """
    Real-time frame data streamed at 50Hz.
    Primary message type sent to WebSocket clients.
    """
    type: Literal["frame"] = "frame"
    timestamp: float

    # Rep state
    rep_count: int
    phase: LiftPhase

    # Velocity
    bar_velocity: float
    hardware_velocity: Optional[float] = None
    bar_weight_kg: Optional[float] = None

    # Fatigue tracking
    fatigue_index: float = 0.0
    fatigue_alert: bool = False


class RepCompleted(BaseModel):
    """Sent when a rep is completed."""
    type: Literal["rep_completed"] = "rep_completed"
    rep_number: int
    max_velocity: float
    avg_velocity: float
    duration: float
    is_clean: bool
    # Phase-specific peaks (in mm/s for display)
    peak_ascending: float = 0.0   # Bar going UP
    peak_descending: float = 0.0  # Bar going DOWN


class FatigueWarning(BaseModel):
    """Sent when fatigue threshold (11%) is exceeded."""
    type: Literal["fatigue_warning"] = "fatigue_warning"
    current_velocity: float
    baseline_velocity: float
    drop_percentage: float
    rep_number: int
    message: str


class SessionSummary(BaseModel):
    """Session summary data."""
    type: Literal["summary"] = "summary"
    total_reps: int
    max_velocity: float
    avg_velocity: float
    fatigue_detected_at_rep: Optional[int] = None
    velocity_trend: List[float] = Field(default_factory=list)


class ConnectionStatus(BaseModel):
    """Connection status update."""
    type: Literal["status"] = "status"
    hardware_connected: bool


class CalibrationRequest(BaseModel):
    """Request to recalibrate baselines."""
    calibrate_hardware: bool = True


class SetConfig(BaseModel):
    """Active set configuration."""
    type: Literal["set_config"] = "set_config"
    exercise: str = "Squat"
    weight: float = 0.0
    unit: Literal["lbs", "kg"] = "lbs"


class SessionConfig(BaseModel):
    """Session configuration."""
    fatigue_threshold: float = 0.11
    serial_port: Optional[str] = "/dev/cu.usbmodem14201"


class CompletedSet(BaseModel):
    """Completed set record for history."""
    id: str
    timestamp: float
    exercise: str
    weight: float
    unit: str
    reps: int
    avg_velocity: float
    max_velocity: float
    peak_velocities: List[float]
    fatigue_dropped_at: Optional[int]


class Workout(BaseModel):
    """Workout containing multiple sets."""
    id: str
    name: str
    date: str  # YYYY-MM-DD format
    started_at: float
    ended_at: Optional[float] = None
    sets: List[CompletedSet] = []
    notes: str = ""
