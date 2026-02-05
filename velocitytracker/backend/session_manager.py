"""
Session Manager
Manages lifting session state for velocity-based tracking.
"""

import json
import logging
import time
import uuid
from typing import Optional, List
from backend.models import SessionSummary, CompletedSet, Workout
from backend.fatigue_detector import VelocityRepTracker, FatigueDetector

logger = logging.getLogger(__name__)


class SessionManager:
    """Manages the lifting session and provides state access."""

    def __init__(self, storage_file: str = "workouts.json"):
        self.rep_tracker = VelocityRepTracker()
        self.fatigue_detector = FatigueDetector(threshold=0.11)
        self.storage_file = storage_file
        self.current_set_config = {"exercise": "Squat", "weight": 0.0, "unit": "lbs"}
        
        # Workout state
        self.active_workout: Optional[Workout] = None

    def start_workout(self, name: str = "Workout", date: str = None) -> Workout:
        """Start a new workout session."""
        if date is None:
            date = time.strftime("%Y-%m-%d")
        self.active_workout = Workout(
            id=str(uuid.uuid4()),
            name=name,
            date=date,
            started_at=time.time(),
            sets=[]
        )
        logger.info(f"Started workout: {name} ({date})")
        return self.active_workout

    def end_workout(self) -> Optional[Workout]:
        """End current workout and save to history."""
        if not self.active_workout:
            return None
            
        self.active_workout.ended_at = time.time()
        self._save_workout()
        
        workout = self.active_workout
        self.active_workout = None
        logger.info(f"Ended workout: {workout.name} ({len(workout.sets)} sets)")
        return workout

    def update_config(self, exercise: str, weight: float, unit: str):
        """Update current set configuration."""
        self.current_set_config = {"exercise": exercise, "weight": weight, "unit": unit}

    def reset(self):
        """Reset the session and save set to current workout."""
        if self.rep_tracker.rep_count > 0:
            self._save_set()

        self.rep_tracker.reset()
        self.fatigue_detector.reset()
        logger.info("Session reset")

    def _save_set(self):
        """Save completed set to active workout (or standalone if no workout)."""
        summary = self.get_summary()
        
        entry = CompletedSet(
            id=str(uuid.uuid4()),
            timestamp=time.time(),
            exercise=self.current_set_config.get("exercise", "Unknown"),
            weight=self.current_set_config.get("weight", 0),
            unit=self.current_set_config.get("unit", "lbs"),
            reps=summary.total_reps,
            avg_velocity=summary.avg_velocity,
            max_velocity=summary.max_velocity,
            peak_velocities=summary.velocity_trend,
            fatigue_dropped_at=summary.fatigue_detected_at_rep
        )
        
        if self.active_workout:
            # Add to current workout
            self.active_workout.sets.append(entry)
            logger.info(f"Added set to workout: {entry.exercise} x{entry.reps}")
        else:
            # No active workout - save as standalone set (legacy behavior)
            self._save_standalone_set(entry)

    def _save_standalone_set(self, entry: CompletedSet):
        """Save a standalone set (when no workout is active)."""
        try:
            try:
                with open("history.json", "r") as f:
                    history = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                history = []

            history.append(entry.model_dump())

            with open("history.json", "w") as f:
                json.dump(history, f, indent=2)
            
            logger.info("Saved standalone set to history.json")
        except Exception as e:
            logger.error(f"Failed to save set: {e}")

    def _save_workout(self):
        """Save workout to JSON file."""
        if not self.active_workout:
            return
            
        try:
            try:
                with open(self.storage_file, "r") as f:
                    workouts = json.load(f)
            except (FileNotFoundError, json.JSONDecodeError):
                workouts = []

            workouts.append(self.active_workout.model_dump())

            with open(self.storage_file, "w") as f:
                json.dump(workouts, f, indent=2)
            
            logger.info(f"Saved workout to {self.storage_file}")
        except Exception as e:
            logger.error(f"Failed to save workout: {e}")

    def get_active_workout(self) -> Optional[dict]:
        """Get active workout info for frontend."""
        if not self.active_workout:
            return None
        return {
            "id": self.active_workout.id,
            "name": self.active_workout.name,
            "started_at": self.active_workout.started_at,
            "set_count": len(self.active_workout.sets)
        }

    def recalibrate(self):
        """Recalibrate baseline measurements."""
        self.fatigue_detector.reset()
        logger.info("Baseline recalibrated")

    def get_summary(self) -> SessionSummary:
        """Get current session summary."""
        peak_velocities = self.rep_tracker.peak_velocities

        max_vel = max(peak_velocities) if peak_velocities else 0.0
        avg_vel = (sum(peak_velocities) / len(peak_velocities)) if peak_velocities else 0.0

        return SessionSummary(
            total_reps=self.rep_tracker.rep_count,
            max_velocity=max_vel,
            avg_velocity=avg_vel,
            velocity_trend=peak_velocities,
            fatigue_detected_at_rep=self.fatigue_detector.fatigue_detected_at
        )
