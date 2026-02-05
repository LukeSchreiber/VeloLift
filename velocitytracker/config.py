#!/usr/bin/env python3
"""
Configuration Management for VeloLift
=========================================
Handles loading/saving configuration from JSON file with sensible defaults.
"""

import json
from pathlib import Path
from dataclasses import dataclass, asdict, field
from typing import Optional


@dataclass
class OutputSettings:
    """Output and export settings."""
    output_dir: str = "processed"
    logs_dir: str = "logs"
    export_csv: bool = False
    generate_charts: bool = False


@dataclass
class HardwareSettings:
    """Arduino hardware settings."""
    arduino_port: str = "/dev/cu.usbmodem14201"
    baud_rate: int = 115200
    enabled: bool = True


@dataclass
class StateMachineSettings:
    """Velocity state machine thresholds."""
    start_velocity_threshold: float = 0.15
    reset_velocity_threshold: float = 0.05
    fatigue_drop_percent: int = 11


@dataclass
class Config:
    """Main configuration container."""
    output: OutputSettings = field(default_factory=OutputSettings)
    hardware: HardwareSettings = field(default_factory=HardwareSettings)
    state_machine: StateMachineSettings = field(default_factory=StateMachineSettings)


class ConfigManager:
    """Manages loading, saving, and accessing configuration."""

    DEFAULT_CONFIG_PATH = Path(__file__).parent / "config.json"

    def __init__(self, config_path: Optional[Path] = None):
        self.config_path = config_path or self.DEFAULT_CONFIG_PATH
        self.config = self._load_or_create()

    def _load_or_create(self) -> Config:
        """Load config from file or create with defaults."""
        if self.config_path.exists():
            try:
                return self._load()
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                print(f"Warning: Could not parse config file ({e}). Using defaults.")
                return Config()
        else:
            config = Config()
            self._save(config)
            return config

    def _load(self) -> Config:
        """Load config from JSON file."""
        with open(self.config_path, 'r') as f:
            data = json.load(f)

        return Config(
            output=OutputSettings(**data.get("output", {})),
            hardware=HardwareSettings(**data.get("hardware", {})),
            state_machine=StateMachineSettings(**data.get("state_machine", {})),
        )

    def _save(self, config: Config):
        """Save config to JSON file."""
        data = {
            "output": asdict(config.output),
            "hardware": asdict(config.hardware),
            "state_machine": asdict(config.state_machine),
        }
        with open(self.config_path, 'w') as f:
            json.dump(data, f, indent=2)

    def save(self):
        """Save current config to file."""
        self._save(self.config)

    def reset_to_defaults(self):
        """Reset config to defaults and save."""
        self.config = Config()
        self._save(self.config)


# Global config instance (lazy loaded)
_config_manager: Optional[ConfigManager] = None


def get_config() -> Config:
    """Get the global configuration."""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager.config


def get_config_manager() -> ConfigManager:
    """Get the config manager for saving changes."""
    global _config_manager
    if _config_manager is None:
        _config_manager = ConfigManager()
    return _config_manager
