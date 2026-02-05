"""
Fatigue Detection Module
Detects velocity degradation indicating fatigue using an 11% threshold.
Includes velocity-based rep state machine with cooldown grouping.
"""

import logging
import statistics
import time
from typing import Optional, List, Dict
from collections import deque
from enum import Enum
from backend.models import FatigueWarning

logger = logging.getLogger(__name__)


class VelocityRepState(Enum):
    """Rep state based on velocity direction."""
    IDLE = "idle"               # Waiting for movement
    DESCENDING = "descending"   # Bar going DOWN (negative velocity)
    ASCENDING = "ascending"     # Bar going UP (positive velocity)


class VelocityRepTracker:
    """
    Direction-based rep counting using signed velocity.
    
    Tracks velocity sign changes to detect complete reps:
    - Squat/Bench: IDLE → DESCENDING → ASCENDING → IDLE = 1 rep
    - Deadlift: IDLE → ASCENDING → DESCENDING → IDLE = 1 rep
    
    A rep is complete when the bar returns to rest after both phases.
    """

    MOVEMENT_THRESHOLD = 0.10   # m/s — minimum velocity to count as movement
    REST_THRESHOLD = 0.05       # m/s — velocity below this = at rest
    MIN_PHASE_DURATION = 0.15   # seconds — minimum time in a phase to count
    SET_TIMEOUT_SECONDS = 5.0   # seconds — time at rest to end the set
    MIN_REP_INTERVAL = 0.5      # seconds — minimum time between rep completions (debounce)
    
    # Stationary detection (variance based)
    STATIONARY_WINDOW_SIZE = 50 # samples (approx 1 sec at 50Hz)
    STATIONARY_STD_DEV_THRESHOLD = 0.02 # m/s — if std dev < this, assume stationary

    def __init__(self):
        self.state = VelocityRepState.IDLE
        self.rep_count = 0
        self.peak_velocity_current_rep = 0.0
        self.peak_velocities: List[float] = []

        # Phase tracking
        self._has_descended = False  # Saw descending phase this rep
        self._has_ascended = False   # Saw ascending phase this rep
        
        # Timing
        self._rep_start_time: Optional[float] = None
        self._phase_start_time: Optional[float] = None
        self._rest_start_time: Optional[float] = None
        self._last_rep_completed_time: float = 0.0  # Debounce for rep counting
        
        # Stationary detection
        self._recent_velocities: deque = deque(maxlen=self.STATIONARY_WINDOW_SIZE)

        # Velocity samples collected during the rep
        self._velocity_samples: List[float] = []
        
        # Peak velocities per phase
        self._peak_ascending = 0.0
        self._peak_descending = 0.0

        # Last completed rep metrics
        self.last_rep_duration: float = 0.0
        self.last_rep_avg_velocity: float = 0.0
        self.last_peak_ascending: float = 0.0
        self.last_peak_descending: float = 0.0

    def update(self, velocity_ms: float) -> Dict:
        """
        Update state machine with signed velocity.
        """
        now = time.time()
        rep_just_completed = False
        set_completed = False
        peak_velocity = None
        
        abs_velocity = abs(velocity_ms)
        is_moving = abs_velocity > self.MOVEMENT_THRESHOLD
        
        # Update stationary detection window
        self._recent_velocities.append(velocity_ms)
        
        # Determine if "physically stationary" based on variance
        # Even if sensor has offset (e.g. reads -0.15 steadily), variance will be low.
        is_stationary = False
        if len(self._recent_velocities) >= self.STATIONARY_WINDOW_SIZE:
            try:
                std_dev = statistics.stdev(self._recent_velocities)
                if std_dev < self.STATIONARY_STD_DEV_THRESHOLD:
                    is_stationary = True
            except statistics.StatisticsError as e:
                logger.debug(f"Stdev calculation failed (expected with insufficient data): {e}")

        # "At Rest" condition: Either absolute low velocity OR physically stationary (variance check)
        is_at_rest = abs_velocity < self.REST_THRESHOLD or is_stationary
        
        if is_stationary:
            # If we are stationary, force 'is_moving' to False to prevent false rep starts
            is_moving = False

        is_going_up = velocity_ms > self.MOVEMENT_THRESHOLD and not is_stationary
        is_going_down = velocity_ms < -self.MOVEMENT_THRESHOLD and not is_stationary

        # Timeout detection (auto-end set)
        if is_at_rest:
            if self._rest_start_time is None:
                self._rest_start_time = now
            elif now - self._rest_start_time > self.SET_TIMEOUT_SECONDS and self.rep_count > 0:
                # Timed out sitting at rest -> End Set
                set_completed = True
        else:
            self._rest_start_time = None

        if self.state == VelocityRepState.IDLE:
            if is_going_down:
                # Started descending (squat/bench pattern)
                self.state = VelocityRepState.DESCENDING
                self._rep_start_time = now
                self._phase_start_time = now
                self._has_descended = True
                self._peak_descending = abs_velocity
                self._velocity_samples = [velocity_ms]
                
            elif is_going_up:
                # Started ascending (deadlift pattern)
                self.state = VelocityRepState.ASCENDING
                self._rep_start_time = now
                self._phase_start_time = now
                self._has_ascended = True
                self._peak_ascending = abs_velocity
                self._velocity_samples = [velocity_ms]

        elif self.state == VelocityRepState.DESCENDING:
            self._velocity_samples.append(velocity_ms)
            
            # Track peak descending velocity
            if abs_velocity > self._peak_descending:
                self._peak_descending = abs_velocity
            
            # Only allow direction switch if we've been descending long enough
            phase_duration = now - self._phase_start_time if self._phase_start_time else 0
            
            if is_going_up and phase_duration >= self.MIN_PHASE_DURATION:
                # Direction switch: DOWN → UP (hit bottom, now ascending)
                self.state = VelocityRepState.ASCENDING
                self._phase_start_time = now
                self._has_ascended = True
                self._peak_ascending = abs_velocity
                
            elif is_at_rest:
                # Came to rest
                if self._has_ascended:
                    # Both phases done → rep complete (deadlift pattern)
                    rep_just_completed = self._complete_rep(now)
                    if rep_just_completed:
                        peak_velocity = self.peak_velocities[-1]

        elif self.state == VelocityRepState.ASCENDING:
            self._velocity_samples.append(velocity_ms)
            
            # Track peak ascending velocity
            if abs_velocity > self._peak_ascending:
                self._peak_ascending = abs_velocity
                
            # Only allow direction switch if we've been ascending long enough
            phase_duration = now - self._phase_start_time if self._phase_start_time else 0
            
            if is_going_down and phase_duration >= self.MIN_PHASE_DURATION:
                # Direction switch: UP → DOWN
                if self._has_descended:
                    # Already descended → squat/bench pattern complete!
                    # Count the rep NOW on this direction switch
                    rep_just_completed = self._complete_rep(now)
                    if rep_just_completed:
                        peak_velocity = self.peak_velocities[-1]
                    # Start new rep going down
                    self.state = VelocityRepState.DESCENDING
                    self._rep_start_time = now
                    self._phase_start_time = now
                    self._rest_start_time = None # Movement started
                    self._has_descended = True
                    self._has_ascended = False
                    self._peak_descending = abs_velocity
                    self._velocity_samples = [velocity_ms]
                else:
                    # First time descending (deadlift: went up first)
                    self.state = VelocityRepState.DESCENDING
                    self._phase_start_time = now
                    self._has_descended = True
                    self._peak_descending = abs_velocity
            
            # NOTE: No is_at_rest handler here. Brief pauses at top are ignored.
            # Squat pattern counts on direction change (UP → DOWN).
            # Deadlift counts when resting in DESCENDING state.

        # Update overall peak for current rep
        if is_moving:
            self.peak_velocity_current_rep = max(self.peak_velocity_current_rep, abs_velocity)

        return {
            'state': self.state.value,
            'rep_count': self.rep_count,
            'rep_completed': rep_just_completed,
            'set_completed': set_completed,
            'peak_velocity': peak_velocity,
            'current_peak': self.peak_velocity_current_rep,
            'duration': self.last_rep_duration if rep_just_completed else None,
            'avg_velocity': self.last_rep_avg_velocity if rep_just_completed else None,
            # Use saved values if rep just completed (since current values are reset)
            'peak_ascending': self.last_peak_ascending if rep_just_completed else self._peak_ascending,
            'peak_descending': self.last_peak_descending if rep_just_completed else self._peak_descending,
        }


    def _complete_rep(self, now: float) -> bool:
        """Complete a rep and reset for next one."""
        # Only count if we've seen both phases
        if not (self._has_descended and self._has_ascended):
            return False
        
        # Debounce: prevent counting reps too rapidly (catches double-count bugs)
        if now - self._last_rep_completed_time < self.MIN_REP_INTERVAL:
            return False
            
        self._last_rep_completed_time = now
        self.rep_count += 1
        
        # Use the higher of ascending/descending peaks
        peak = max(self._peak_ascending, self._peak_descending)
        self.peak_velocities.append(peak)
        
        # Calculate metrics
        self.last_rep_duration = now - self._rep_start_time if self._rep_start_time else 0
        active_samples = [abs(v) for v in self._velocity_samples if abs(v) > self.REST_THRESHOLD]
        self.last_rep_avg_velocity = (
            sum(active_samples) / len(active_samples) if active_samples else 0.0
        )
        
        # Save peak values BEFORE reset so they can be returned
        self.last_peak_ascending = self._peak_ascending
        self.last_peak_descending = self._peak_descending
        
        # Reset for next rep
        self._reset_rep_state()
        return True

    def _reset_rep_state(self):
        """Reset state for next rep (keeps rep_count and history)."""
        self.state = VelocityRepState.IDLE
        self.peak_velocity_current_rep = 0.0
        self._has_descended = False
        self._has_ascended = False
        self._rep_start_time = None
        self._phase_start_time = None
        self._velocity_samples = []
        self._peak_ascending = 0.0
        self._peak_descending = 0.0

    def reset(self):
        """Full reset including rep count and history."""
        self._reset_rep_state()
        self.rep_count = 0
        self.peak_velocities = []
        self.last_rep_duration = 0.0
        self.last_rep_avg_velocity = 0.0


class FatigueDetector:
    """
    Detects fatigue based on velocity drop from baseline.

    Algorithm:
    1. Baseline is established from first 3 reps (warmup period)
    2. Subsequent reps are compared against baseline
    3. Alert triggered when velocity drops > threshold (default 11%)

    The 11% threshold is based on research showing significant
    fatigue-related performance drops in resistance training.
    """

    def __init__(
        self,
        threshold: float = 0.11,
        baseline_reps: int = 3,
        smoothing_window: int = 3
    ):
        """
        Initialize the fatigue detector.

        Args:
            threshold: Velocity drop threshold (0.11 = 11%)
            baseline_reps: Number of reps to establish baseline
            smoothing_window: Number of reps for moving average
        """
        self.threshold = threshold
        self.baseline_reps = baseline_reps
        self.smoothing_window = smoothing_window

        # State
        self.baseline_velocity: Optional[float] = None
        self.rep_velocities: List[float] = []
        self.in_rep_velocities: deque = deque(maxlen=50)
        self.fatigue_detected_at: Optional[int] = None
        self.current_phase = "standing"

    def reset(self):
        """Reset fatigue detection state."""
        self.baseline_velocity = None
        self.rep_velocities = []
        self.in_rep_velocities.clear()
        self.fatigue_detected_at = None

    def update(
        self,
        velocity: float,
        rep_count: int,
        phase: str
    ) -> Dict:
        """
        Update with current frame velocity.

        Args:
            velocity: Current bar velocity (fused or vision-only)
            rep_count: Current rep count
            phase: Current lift phase

        Returns:
            Dict with 'index' (0-1 fatigue level) and 'alert' (bool)
        """
        self.current_phase = phase

        # Only track velocity during ascending phase (concentric)
        if phase == "ascending":
            self.in_rep_velocities.append(velocity)

        # Calculate fatigue index
        if self.baseline_velocity is None or self.baseline_velocity == 0:
            return {'index': 0.0, 'alert': False}

        # Use recent velocity average for smoother fatigue tracking
        if len(self.in_rep_velocities) > 0:
            recent_avg = sum(self.in_rep_velocities) / len(self.in_rep_velocities)
            drop = (self.baseline_velocity - recent_avg) / self.baseline_velocity
            fatigue_index = max(0.0, min(1.0, drop / self.threshold))

            return {
                'index': fatigue_index,
                'alert': drop >= self.threshold
            }

        return {'index': 0.0, 'alert': False}

    def check_rep_fatigue(
        self,
        peak_velocity: float,
        rep_number: int
    ) -> Optional[FatigueWarning]:
        """
        Check for fatigue after a rep is completed.

        Args:
            peak_velocity: Peak velocity achieved in the rep
            rep_number: The completed rep number

        Returns:
            FatigueWarning if threshold exceeded, None otherwise
        """
        self.rep_velocities.append(peak_velocity)
        self.in_rep_velocities.clear()

        # Establish baseline from first N reps
        if len(self.rep_velocities) == self.baseline_reps:
            self.baseline_velocity = sum(self.rep_velocities) / len(self.rep_velocities)
            logger.info(f"Baseline velocity established: {self.baseline_velocity:.3f} m/s")
            return None

        # Check for fatigue if baseline exists and is non-zero
        if not self.baseline_velocity:
            return None

        # Calculate smoothed velocity (moving average)
        if len(self.rep_velocities) >= self.smoothing_window:
            recent_velocities = self.rep_velocities[-self.smoothing_window:]
            smoothed_velocity = sum(recent_velocities) / len(recent_velocities)
        else:
            smoothed_velocity = peak_velocity

        # Calculate drop percentage
        drop = (self.baseline_velocity - smoothed_velocity) / self.baseline_velocity

        # Check threshold
        if drop >= self.threshold and self.fatigue_detected_at is None:
            self.fatigue_detected_at = rep_number

            return FatigueWarning(
                current_velocity=smoothed_velocity,
                baseline_velocity=self.baseline_velocity,
                drop_percentage=drop * 100,
                rep_number=rep_number,
                message=f"Velocity dropped {drop*100:.1f}% from baseline. Consider ending set."
            )

        return None

    def get_velocity_trend(self) -> List[float]:
        """Get list of peak velocities per rep for charting."""
        return self.rep_velocities.copy()

    def get_current_drop(self) -> float:
        """Get current velocity drop percentage from baseline."""
        if not self.baseline_velocity or len(self.rep_velocities) < self.baseline_reps:
            return 0.0

        if len(self.rep_velocities) >= self.smoothing_window:
            recent = self.rep_velocities[-self.smoothing_window:]
            current = sum(recent) / len(recent)
        else:
            current = self.rep_velocities[-1] if self.rep_velocities else 0

        drop = (self.baseline_velocity - current) / self.baseline_velocity
        return max(0.0, drop)
