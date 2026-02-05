"""
Arduino Velocity Processor.
Reads velocity data from Arduino encoder and streams to WebSocket clients.
"""

import asyncio
import time
import logging
from typing import Optional
from pathlib import Path
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from hardware_interface import ArduinoInterface, HardwareReading

from backend.ws_manager import ConnectionManager
from backend.fatigue_detector import FatigueDetector, VelocityRepTracker
from backend.models import FrameData, RepCompleted, LiftPhase

logger = logging.getLogger(__name__)


class VelocityProcessor:
    """
    Pure velocity processor using Arduino encoder.
    Streams velocity, rep count, and fatigue data at 50Hz.
    """

    STREAM_INTERVAL = 0.020  # 20ms = 50Hz

    def __init__(
        self,
        connection_manager: ConnectionManager,
        serial_port: Optional[str] = "/dev/cu.usbmodem14201",
        velocity_rep_tracker: Optional[VelocityRepTracker] = None,
        session_manager = None,
    ):
        self.connection_manager = connection_manager
        self.serial_port = serial_port

        # Velocity-based rep tracking
        self.velocity_rep_tracker = velocity_rep_tracker or VelocityRepTracker()

        # Hardware interface (Arduino for velocity)
        self.arduino: Optional[ArduinoInterface] = None
        self.latest_hardware: Optional[HardwareReading] = None

        # Fatigue detector
        self.fatigue_detector = FatigueDetector(threshold=0.11)

        # State
        self.is_running = False
        self.hardware_connected = False
        self._last_tracker_result: dict = {}
        
        # Session manager (injected to avoid circular import)
        self._session_manager = session_manager

    async def start(self):
        """Start the velocity processing loop."""
        self._init_hardware()
        self.is_running = True
        logger.info("Velocity processor started (Arduino encoder)")
        await self._processing_loop()

    async def stop(self):
        """Stop processing and clean up resources."""
        self.is_running = False
        if self.arduino:
            self.arduino.disconnect()
        logger.info("Velocity processor stopped")

    def _init_hardware(self):
        """Initialize Arduino hardware interface."""
        if not self.serial_port:
            logger.warning("No serial port specified")
            return

        try:
            self.arduino = ArduinoInterface(port=self.serial_port)
            if self.arduino.connect():
                self.hardware_connected = True
                self.arduino.start_reading(callback=self._on_hardware_reading)
                logger.info(f"Arduino connected on {self.serial_port}")
            else:
                logger.warning("Arduino connection failed")
        except Exception as e:
            logger.warning(f"Arduino init error: {e}")
            self.hardware_connected = False

    def _on_hardware_reading(self, reading: HardwareReading):
        """Callback for hardware readings (runs in separate thread)."""
        self.latest_hardware = reading

    def calibrate_hardware(self):
        """Calibrate hardware encoder."""
        if self.arduino:
            self.arduino.calibrate_encoder()

    async def _processing_loop(self):
        """Main processing loop — streams at 50Hz."""
        last_stream_time = 0

        while self.is_running:
            try:
                # Process velocity data
                frame_data = self._process()

                # Stream at 50Hz
                current_time = time.time()
                if current_time - last_stream_time >= self.STREAM_INTERVAL:
                    if frame_data:
                        await self.connection_manager.broadcast(frame_data.model_dump())
                    last_stream_time = current_time

                # Check for completed rep
                await self._check_rep_completed()
            except Exception as e:
                logger.error(f"Processing loop error: {e}")

            # Yield to event loop
            await asyncio.sleep(0.001)

    def _process(self) -> Optional[FrameData]:
        """Process velocity data from Arduino."""
        hardware_velocity = 0.0
        bar_weight = 0.0
        if self.latest_hardware:
            hardware_velocity = self.latest_hardware.encoder_velocity
            bar_weight = self.latest_hardware.bar_weight_kg

        # Update velocity state machine for rep detection
        self._last_tracker_result = self.velocity_rep_tracker.update(hardware_velocity)

        # Determine phase from velocity sign and magnitude
        # Positive = bar going UP (ascending/concentric)
        # Negative = bar going DOWN (descending/eccentric)
        abs_velocity = abs(hardware_velocity)
        tracker_state = self.velocity_rep_tracker.state.value
        
        if tracker_state == "idle" or abs_velocity < 0.05:
            phase = LiftPhase.STANDING
        elif hardware_velocity > 0:
            phase = LiftPhase.ASCENDING  # Bar going UP
        else:
            phase = LiftPhase.DESCENDING  # Bar going DOWN

        fatigue_result = self.fatigue_detector.update(
            abs_velocity,  # Use absolute for fatigue tracking
            self.velocity_rep_tracker.rep_count,
            phase.value
        )

        return FrameData(
            timestamp=time.time(),
            rep_count=self.velocity_rep_tracker.rep_count,
            phase=phase,
            bar_velocity=hardware_velocity * 1000,  # Keep sign for display
            hardware_velocity=hardware_velocity,    # Keep sign for display
            bar_weight_kg=bar_weight,
            fatigue_index=fatigue_result['index'],
            fatigue_alert=fatigue_result['alert']
        )

    async def _check_rep_completed(self):
        """Check if a rep was just completed or set timed out."""
        result = self._last_tracker_result
        if not result:
            return

        # Handle Set Auto-End (Timeout)
        if result.get('set_completed'):
            logger.info("Set auto-ended due to inactivity")
            # Get final summary before reset
            if self._session_manager:
                summary = self._session_manager.get_summary()
                await self.connection_manager.broadcast(summary.model_dump())
                self._session_manager.reset()

            # Reset tracker state
            self.velocity_rep_tracker.reset()
            self.fatigue_detector.reset()
            self._last_tracker_result = {}

            # Notify clients
            await self.connection_manager.broadcast({"type": "ack", "command": "auto_end_set"})
            return

        # Handle Rep Completion
        if not result['rep_completed']:
            return

        peak_velocity = result['peak_velocity'] or 0.0
        duration = result['duration'] or 0.0
        avg_velocity = result['avg_velocity'] or 0.0
        
        peak_ascending = result.get('peak_ascending', 0.0)
        peak_descending = result.get('peak_descending', 0.0)

        rep_data = RepCompleted(
            rep_number=result['rep_count'],
            max_velocity=peak_velocity * 1000,
            avg_velocity=avg_velocity * 1000,
            duration=round(duration, 2),
            is_clean=True,
            peak_ascending=peak_ascending * 1000,
            peak_descending=peak_descending * 1000,
        )
        await self.connection_manager.broadcast(rep_data.model_dump())

        # Check fatigue
        fatigue_warning = self.fatigue_detector.check_rep_fatigue(
            peak_velocity,
            result['rep_count']
        )
        if fatigue_warning:
            await self.connection_manager.broadcast(fatigue_warning.model_dump())
