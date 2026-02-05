#!/usr/bin/env python3
"""
Hardware Interface Module for VeloLift
============================================
Arduino-based rotary encoder interface for bar velocity tracking.

Hardware Setup:
    - Arduino Uno/Nano with rotary encoder attached to barbell cable
    - Load cell with HX711 amplifier for weight measurement
    - Serial communication at 115200 baud

Arduino Serial Format:
    Simple: Just velocity as a decimal (e.g., "0.17")
    Complex: "ENC:1234,VEL:45.2,WEIGHT:135.0"
"""

import serial
import serial.tools.list_ports
import threading
import time
import logging
from typing import Optional, Callable
from dataclasses import dataclass
from collections import deque
import re

# Configure logging for hardware interface
logger = logging.getLogger(__name__)


@dataclass
class HardwareReading:
    """Single reading from hardware sensors."""
    encoder_position: int = 0
    encoder_velocity: float = 0.0
    bar_weight_kg: float = 0.0
    timestamp: float = 0.0
    raw_data: str = ""


class ArduinoInterface:
    """
    Interface for Arduino-based sensors.

    Reads serial data from Arduino and provides parsed sensor values.
    """

    def __init__(self,
                 port: str = None,
                 baud_rate: int = 115200,
                 timeout: float = 0.1):
        self.port = port
        self.baud_rate = baud_rate
        self.timeout = timeout
        self.serial: Optional[serial.Serial] = None

        # Reading buffer
        self.readings: deque = deque(maxlen=100)
        self.latest_reading: Optional[HardwareReading] = None

        # Thread control
        self._running = False
        self._thread: Optional[threading.Thread] = None

        # Callbacks
        self._on_reading_callback: Optional[Callable[[HardwareReading], None]] = None

        # Calibration
        self.encoder_ticks_per_cm = 100.0
        self.encoder_offset = 0

        # Error tracking
        self._read_error_count = 0

    @staticmethod
    def find_arduino_port() -> Optional[str]:
        """Auto-detect Arduino port."""
        ports = serial.tools.list_ports.comports()
        for port in ports:
            if 'Arduino' in port.description or \
               'CH340' in port.description or \
               'USB Serial' in port.description or \
               'ttyUSB' in port.device or \
               'ttyACM' in port.device:
                return port.device
        return None

    def connect(self) -> bool:
        """Connect to Arduino."""
        if self.port is None:
            self.port = self.find_arduino_port()
            if self.port is None:
                logger.error("Could not find Arduino. Specify port manually.")
                return False

        try:
            self.serial = serial.Serial(
                port=self.port,
                baudrate=self.baud_rate,
                timeout=self.timeout
            )
            logger.info(f"Connected to Arduino on {self.port}")

            # Wait for Arduino to reset
            time.sleep(2)

            # Clear any startup messages
            self.serial.reset_input_buffer()

            return True
        except serial.SerialException as e:
            logger.error(f"Error connecting to Arduino: {e}")
            return False

    def disconnect(self):
        """Disconnect from Arduino."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)
        if self.serial and self.serial.is_open:
            self.serial.close()
            logger.info("Disconnected from Arduino")

    def _parse_line(self, line: str) -> Optional[HardwareReading]:
        """
        Parse a line of serial data from Arduino.

        Supports two formats:
        1. Simple: Just velocity as a decimal (e.g., "0.17")
        2. Complex: "ENC:1234,VEL:45.2,WEIGHT:135.0"
        """
        reading = HardwareReading(timestamp=time.time(), raw_data=line)

        try:
            # Try simple format first (just a velocity number)
            line_stripped = line.strip()
            if re.match(r'^-?[\d.]+$', line_stripped):
                reading.encoder_velocity = float(line_stripped)
                return reading

            # Try complex format
            enc_match = re.search(r'ENC:(-?\d+)', line)
            if enc_match:
                reading.encoder_position = int(enc_match.group(1))

            vel_match = re.search(r'VEL:(-?[\d.]+)', line)
            if vel_match:
                reading.encoder_velocity = float(vel_match.group(1))

            weight_match = re.search(r'WEIGHT:([\d.]+)', line)
            if weight_match:
                reading.bar_weight_kg = float(weight_match.group(1))

            return reading
        except (ValueError, AttributeError):
            return None

    def _read_loop(self):
        """Background thread for reading serial data."""
        while self._running and self.serial and self.serial.is_open:
            try:
                if self.serial.in_waiting:
                    line = self.serial.readline().decode('utf-8').strip()
                    if line:
                        logger.debug(f"[Arduino RAW] {line}")

                        reading = self._parse_line(line)
                        if reading:
                            logger.debug(f"[Arduino PARSED] vel={reading.encoder_velocity:.3f} m/s, pos={reading.encoder_position}")

                            self.latest_reading = reading
                            self.readings.append(reading)

                            if self._on_reading_callback:
                                self._on_reading_callback(reading)
            except (serial.SerialException, UnicodeDecodeError) as e:
                self._read_error_count += 1
                logger.warning(f"Serial read error (count: {self._read_error_count}): {e}")

            time.sleep(0.001)

    def start_reading(self, callback: Callable[[HardwareReading], None] = None):
        """Start background reading thread."""
        if not self.serial or not self.serial.is_open:
            logger.error("Not connected to Arduino")
            return

        self._on_reading_callback = callback
        self._running = True
        self._thread = threading.Thread(target=self._read_loop, daemon=True)
        self._thread.start()
        logger.info("Started reading from Arduino")

    def stop_reading(self):
        """Stop background reading thread."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=1.0)
        logger.info("Stopped reading from Arduino")

    def get_latest(self) -> Optional[HardwareReading]:
        """Get the latest reading."""
        return self.latest_reading

    def send_command(self, command: str):
        """Send a command to Arduino."""
        if self.serial and self.serial.is_open:
            self.serial.write(f"{command}\n".encode('utf-8'))

    def calibrate_encoder(self):
        """Calibrate encoder zero position."""
        if self.latest_reading:
            self.encoder_offset = self.latest_reading.encoder_position
            logger.info(f"Encoder calibrated. Offset: {self.encoder_offset}")

    def get_bar_height_cm(self) -> float:
        """Get bar height in cm relative to calibration point."""
        if self.latest_reading is None:
            return 0.0

        ticks = self.latest_reading.encoder_position - self.encoder_offset
        return ticks / self.encoder_ticks_per_cm


if __name__ == '__main__':
    print("Testing Arduino Interface...")

    port = ArduinoInterface.find_arduino_port()
    if port:
        print(f"\nArduino detected on: {port}")

        arduino = ArduinoInterface(port=port)
        if arduino.connect():
            def print_reading(r: HardwareReading):
                print(f"  vel={r.encoder_velocity:.3f} m/s, pos={r.encoder_position}")

            arduino.start_reading(callback=print_reading)
            try:
                while True:
                    time.sleep(0.1)
            except KeyboardInterrupt:
                arduino.disconnect()
    else:
        print("\nNo Arduino detected. Connect hardware and try again.")
