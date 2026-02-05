# VeloLift — System Overview

> Technical reference for the workout logger and velocity tracking system.

---

## Architecture

```
VeloLift/
├── frontend/                          # React workout logger (port 5173)
│   └── src/
│       ├── App.jsx                    # Root layout, seeding, state
│       ├── db.js                      # Dexie IndexedDB (workouts/exercises/sets)
│       ├── components/
│       │   ├── SessionView.jsx        # Bento grid + velocity display
│       │   ├── SetDetailView.jsx      # Rep-by-rep detail modal
│       │   ├── VelocityView.jsx       # Real-time velocity tracking UI
│       │   ├── Sidebar.jsx            # Calendar, search, workout list
│       │   ├── Logger.jsx             # Terminal-style set entry
│       │   └── ErrorBoundary.jsx      # Catch rendering errors
│       └── hooks/
│           └── useLiveQuery.js        # Async query hook with deps
│
├── velocitytracker/                   # Python FastAPI backend (port 8000)
│   ├── run_server.py                  # Entry point (uvicorn)
│   ├── hardware_interface.py          # Arduino serial reader
│   ├── config.py / config.json        # Settings (hardware, thresholds)
│   └── backend/
│       ├── main.py                    # FastAPI app, WebSocket, REST
│       ├── velocity_processor.py      # 50Hz processing loop
│       ├── fatigue_detector.py        # Rep counting + fatigue state machine
│       ├── session_manager.py         # Workout/set lifecycle + persistence
│       ├── models.py                  # Pydantic models
│       └── ws_manager.py              # WebSocket connection manager
│
├── hardware/                          # 3D-printable enclosure files (.scad/.stl)
├── scripts/start-all.js               # Launches both services
└── package.json                       # Monorepo root
```

---

## Operational Modes

| Command | What runs | Hardware needed |
|---------|-----------|-----------------|
| `npm run dev` | Frontend only | None |
| `npm run track` | Frontend + Velocity Tracker | Arduino + encoder |

`start-all.js` spawns both processes with colored output: `[FRONTEND]` (cyan) and `[VELOCITY]` (green).

---

## Frontend

**Stack:** React 19, Vite 7, Tailwind 4, Dexie (IndexedDB), date-fns, lucide-react

### Database Schema (v2)

```
workouts:  ++id, date                  (+ notes field)
exercises: ++id, workoutId, name, order
sets:      ++id, exerciseId, order     (+ repData JSON for velocity)
```

### Key Functions (`db.js`)

| Function | Description |
|----------|-------------|
| `createWorkout(date)` | Create new workout |
| `getWorkoutByDate(date)` | Fetch workout by date |
| `addExercise(workoutId, name)` | Add exercise to workout |
| `addSet(exerciseId, weight, reps, rpe)` | Add set to exercise |
| `updateSet(id, fields)` | Update set fields |
| `updateWorkoutNotes(workoutId, notes)` | Save session notes |
| `getFullSession(workoutId)` | Load workout with nested data |
| `getAllWorkoutDates()` | Get dates classified by muscle group |
| `searchWorkoutsByExercise(name)` | Cross-date search |

### Components

| Component | Purpose |
|-----------|---------|
| **App.jsx** | Root layout, seeds DB, manages selected date |
| **SessionView.jsx** | Bento grid of exercises, inline editing, notes toggle |
| **SetDetailView.jsx** | Rep-by-rep velocity breakdown modal |
| **VelocityView.jsx** | Real-time velocity display, rep tracking, peak velocity |
| **Sidebar.jsx** | Calendar/list views, search, workout type labels |
| **Logger.jsx** | Fixed bottom bar, terminal-style input with autocomplete |
| **ErrorBoundary.jsx** | Catches rendering errors with recovery UI |

### Theme (Premium Monochrome)

```
Background:     #050505 (rich black)
Card surface:   rgba(255,255,255,0.02-0.05) (glass panels)
Borders:        rgba(255,255,255,0.05-0.10)
Text primary:   #FFFFFF
Text secondary: #A1A1AA
Text muted:     #52525b
Accent:         #FFFFFF (pills, buttons)
Font:           JetBrains Mono / Fira Code
```

---

## Velocity Tracker

**Stack:** Python 3.9+, FastAPI, pyserial, uvicorn, pydantic

### Hardware Layer (`hardware_interface.py`)

**ArduinoInterface** class:
- Auto-detects Arduino port (scans for Arduino/CH340/USB Serial/ttyUSB/ttyACM)
- Serial at 115200 baud, 0.1s timeout
- Background thread reads continuously

**Serial formats:**
- Simple: `0.17` (velocity m/s)
- Complex: `ENC:1234,VEL:0.17,WEIGHT:60.0`

**Convention:** Positive = bar up (concentric), Negative = bar down (eccentric)

### Processing Pipeline

**VelocityProcessor** (50Hz loop):
1. Reads latest `HardwareReading` from Arduino
2. Updates rep tracker state machine
3. Checks fatigue thresholds
4. Broadcasts `FrameData` to all WebSocket clients

### Key Algorithms

**1. Velocity State Machine (`VelocityRepTracker`):**

States: `IDLE`, `DESCENDING`, `ASCENDING`

```
Squat/Bench:  IDLE → DESCENDING → ASCENDING → IDLE = 1 rep
Deadlift:     IDLE → ASCENDING → DESCENDING → IDLE = 1 rep
```

- Movement threshold: 0.10 m/s (velocity above this = moving)
- Rest threshold: 0.05 m/s (velocity below this = at rest)
- Min phase duration: 0.15s (debounce short spikes)
- Set timeout: 5s at rest ends the set
- Stationary detection via variance (std dev < 0.02 m/s over 50 samples)

**2. Fatigue Detection (11% Threshold):**

```python
# Baseline from first 3 reps
baseline = mean(rep_velocities[:3])

# Check each subsequent rep
for rep in rep_velocities[3:]:
    smoothed = moving_average(last_3_reps)
    drop = (baseline - smoothed) / baseline

    if drop >= 0.11:  # 11% threshold
        trigger_fatigue_alert()
```

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Status, hardware connection, connections |
| `/api/status` | GET | Hardware connected status |
| `/api/workouts` | GET | All workouts from storage |
| `/api/history` | GET | Standalone sets |
| `/api/history/{set_id}` | DELETE | Remove set from history |
| `/api/session/summary` | GET | Session metrics |
| `/api/session/reset` | POST | Reset current session |
| `/api/calibrate` | POST | Recalibrate encoder |
| `/docs` | GET | OpenAPI documentation |

### WebSocket (`/ws`)

**Server broadcasts (50Hz):**

```json
{ "type": "frame", "rep_count": 5, "phase": "ascending",
  "bar_velocity": 1234.5, "hardware_velocity": 1.23,
  "fatigue_index": 0.35, "fatigue_alert": false }
```

```json
{ "type": "rep_completed", "rep_number": 5, "max_velocity": 1500.0,
  "avg_velocity": 1200.0, "duration": 2.34 }
```

```json
{ "type": "fatigue_warning", "drop_percentage": 25.0,
  "current_velocity": 900.0, "baseline_velocity": 1200.0 }
```

**Client commands:**

```json
{ "command": "start_set", "exercise": "Squat", "weight": 225, "unit": "lbs" }
{ "command": "start_workout", "name": "Leg Day", "date": "2025-02-04" }
{ "command": "end_workout" }
{ "command": "reset" }
{ "command": "recalibrate" }
```

### Configuration (`config.json`)

```json
{
  "output": { "output_dir": "processed", "logs_dir": "logs" },
  "hardware": { "arduino_port": null, "baud_rate": 115200, "enabled": true },
  "state_machine": { "start_velocity_threshold": 0.15, "reset_velocity_threshold": 0.05, "fatigue_drop_percent": 11 }
}
```

`arduino_port: null` enables auto-detection (scans for Arduino/CH340/USB Serial devices). Set a specific port string to override.

---

## Data Flow

```
┌─────────────┐    Serial 115200     ┌──────────────────┐    WebSocket 50Hz    ┌─────────────────┐
│   Arduino    │ ──────────────────► │  Velocity Tracker │ ──────────────────► │    Frontend      │
│   Encoder    │   velocity data     │  (FastAPI :8000)  │   FrameData JSON    │  (React :5173)   │
└─────────────┘                      └──────────────────┘                      └─────────────────┘
                                             │                                         │
                                             ▼                                         ▼
                                      workouts.json                              IndexedDB (Dexie)
                                      history.json                           workouts/exercises/sets
```

**Flow:**
1. Arduino reads encoder ticks, sends velocity over serial
2. ArduinoInterface parses readings in background thread
3. VelocityProcessor runs at 50Hz: updates rep tracker, checks fatigue, broadcasts
4. Frontend polls `/api/workouts` every 3s (today's date)
5. SessionView renders velocity in exercise cards
6. Logger writes to IndexedDB independently — velocity overlays via exercise+weight matching
