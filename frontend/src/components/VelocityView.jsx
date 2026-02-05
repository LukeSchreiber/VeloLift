import { useState, useEffect, useRef } from 'react';
import { Square, Check, AlertCircle } from 'lucide-react';
import { createWorkout, getWorkoutByDate, addExercise, addSet, getAllExerciseNames, getExercisesForWorkout, getFullSession } from '../db';

export default function VelocityView({ date, onSetLogged }) {
  const [connected, setConnected] = useState(false);
  const [velocity, setVelocity] = useState(0);
  const [phase, setPhase] = useState('idle');
  const [repCount, setRepCount] = useState(0);
  const [peakVelocity, setPeakVelocity] = useState(0);
  const [lastRep, setLastRep] = useState(null);
  const [lastLoggedSet, setLastLoggedSet] = useState(null);
  const wsRef = useRef(null);

  // Exercise/Set tracking
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [isTracking, setIsTracking] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [allNames, setAllNames] = useState([]);
  const exerciseRef = useRef(null);
  const weightRef = useRef(null);

  // Track rep details for full analytics
  const [repDetails, setRepDetails] = useState([]);
  const autoEndTimerRef = useRef(null);
  const AUTO_END_DELAY = 5000;

  // Error state
  const [error, setError] = useState(null);

  // Session history
  const [sessionHistory, setSessionHistory] = useState([]);

  useEffect(() => {
    getAllExerciseNames().then(setAllNames);
  }, []);

  const loadSessionHistory = async () => {
    if (!date) {
      setSessionHistory([]);
      return;
    }
    const workout = await getWorkoutByDate(date);
    if (!workout) {
      setSessionHistory([]);
      return;
    }
    const session = await getFullSession(workout.id);
    setSessionHistory(session || []);
  };

  useEffect(() => {
    loadSessionHistory();
  }, [date]);

  const mountedRef = useRef(true);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    const connectWs = () => {
      if (!mountedRef.current) return;

      let ws;
      try {
        ws = new WebSocket('ws://localhost:8000/ws');
      } catch (err) {
        console.error('WebSocket creation failed:', err);
        setConnected(false);
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connectWs, 2000);
        }
        return;
      }

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        if (mountedRef.current) {
          reconnectTimerRef.current = setTimeout(connectWs, 2000);
        }
      };

      ws.onerror = () => {
        setConnected(false);
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type === 'frame') {
          setVelocity(data.hardware_velocity || 0);
          setPhase(data.phase || 'idle');
          setRepCount(data.rep_count || 0);
        } else if (data.type === 'rep_completed') {
          const repData = {
            number: data.rep_number,
            maxVelocity: data.max_velocity / 1000,  // Convert mm/s to m/s
            avgVelocity: data.avg_velocity / 1000,  // Convert mm/s to m/s
            duration: data.duration
          };
          setLastRep(repData);

          // Update peak velocity if this rep's max is higher (convert mm/s to m/s)
          if (data.max_velocity) {
            setPeakVelocity(prev => Math.max(prev, data.max_velocity / 1000));
          }

          if (data.avg_velocity) {
            setRepDetails(prev => {
              if (prev.some(r => r.repNumber === data.rep_number)) {
                return prev;
              }
              return [...prev, {
                repNumber: data.rep_number,
                avgVelocity: data.avg_velocity / 1000,  // Convert mm/s to m/s
                peakVelocity: (data.max_velocity || data.avg_velocity) / 1000,  // Convert mm/s to m/s
                duration: data.duration || 0
              }];
            });
          }
        }
      };

      wsRef.current = ws;
    };

    connectWs();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      if (autoEndTimerRef.current) {
        clearTimeout(autoEndTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!isTracking || repDetails.length === 0) return;

    if (autoEndTimerRef.current) {
      clearTimeout(autoEndTimerRef.current);
    }

    autoEndTimerRef.current = setTimeout(() => {
      if (isTracking && repDetails.length > 0) {
        handleEndSet();
      }
    }, AUTO_END_DELAY);

    return () => {
      if (autoEndTimerRef.current) {
        clearTimeout(autoEndTimerRef.current);
      }
    };
  }, [repDetails.length, isTracking]);

  const handleExerciseChange = (value) => {
    setExerciseName(value);
    if (value.trim().length > 0) {
      const query = value.toLowerCase();
      const matches = allNames.filter((n) => n.toLowerCase().includes(query));
      setSuggestions(matches.slice(0, 8));
      setShowSuggestions(matches.length > 0);
    } else {
      setSuggestions(allNames.slice(0, 8));
      setShowSuggestions(allNames.length > 0);
    }
    setSelectedSuggestion(-1);
  };

  const selectSuggestion = (name) => {
    setExerciseName(name);
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
    weightRef.current?.focus();
  };

  const handleExerciseKeyDown = (e) => {
    if (!showSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestion((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (selectedSuggestion >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[selectedSuggestion]);
      } else if (suggestions.length > 0) {
        e.preventDefault();
        selectSuggestion(suggestions[0]);
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleStartSet = () => {
    if (!exerciseName.trim() || !weight) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        command: 'start_set',
        exercise: exerciseName.trim(),
        weight: parseFloat(weight),
        unit: 'lbs'
      }));
    }

    setIsTracking(true);
    setRepCount(0);
    setLastRep(null);
    setPeakVelocity(0);
    setRepDetails([]);
  };

  const handleEndSet = async () => {
    if (autoEndTimerRef.current) {
      clearTimeout(autoEndTimerRef.current);
      autoEndTimerRef.current = null;
    }

    const actualReps = repDetails.length > 0 ? repDetails.length : repCount;

    if (!isTracking || actualReps === 0) {
      setIsTracking(false);
      setRepDetails([]);
      return;
    }

    const savedReps = actualReps;
    const savedExercise = exerciseName.trim();
    const savedWeight = weight;
    const savedRepDetails = [...repDetails];

    const avgVelocity = repDetails.length > 0
      ? repDetails.reduce((sum, r) => sum + r.avgVelocity, 0) / repDetails.length
      : null;

    try {
      await createWorkout(date);
      const workout = await getWorkoutByDate(date);

      const exercises = await getExercisesForWorkout(workout.id);
      let exercise = exercises.find(
        (e) => e.name.toLowerCase() === savedExercise.toLowerCase()
      );

      if (!exercise) {
        const exId = await addExercise(workout.id, savedExercise);
        exercise = { id: exId, name: savedExercise };
      }

      await addSet(exercise.id, savedWeight, savedReps, null, avgVelocity, savedRepDetails);

      const names = await getAllExerciseNames();
      setAllNames(names);

      setLastLoggedSet({
        exercise: savedExercise,
        weight: savedWeight,
        reps: savedReps,
        avgVelocity: avgVelocity
      });
      setTimeout(() => setLastLoggedSet(null), 4000);

      await loadSessionHistory();
      onSetLogged?.();
    } catch (err) {
      console.error('Failed to log set:', err);
      setError('Failed to log set. Tap to retry.');
      return; // Don't reset tracking state so user can retry
    }

    setIsTracking(false);
    setRepCount(0);
    setRepDetails([]);
    setLastRep(null);
    setPeakVelocity(0);
  };

  const getPhaseLabel = () => {
    switch (phase) {
      case 'ascending': return 'CONCENTRIC';
      case 'descending': return 'ECCENTRIC';
      default: return 'READY';
    }
  };

  const isValid = exerciseName.trim() && weight !== '';

  return (
    <div className="h-full flex flex-col bg-[#050505] text-white relative overflow-hidden">
      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-30" style={{
        backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* Exercise Input Bar */}
      {!isTracking && (
        <div className="relative z-20 px-10 py-8 border-b border-white/5">
          <div className="flex items-end gap-8 max-w-3xl mx-auto">
            {/* Exercise Input */}
            <div className="relative flex-1">
              <label className="block text-[10px] text-[#52525b] tracking-widest mb-3 uppercase">Exercise</label>
              <div className="relative">
                <input
                  ref={exerciseRef}
                  type="text"
                  value={exerciseName}
                  onChange={(e) => handleExerciseChange(e.target.value)}
                  onKeyDown={handleExerciseKeyDown}
                  onFocus={() => {
                    if (exerciseName.trim() === '' && allNames.length > 0) {
                      setSuggestions(allNames.slice(0, 8));
                      setShowSuggestions(true);
                    } else if (suggestions.length > 0) {
                      setShowSuggestions(true);
                    }
                  }}
                  onBlur={() => { setTimeout(() => setShowSuggestions(false), 200); }}
                  className="w-full bg-transparent border-b border-white/10 px-0 py-3 text-white text-lg outline-none focus:border-white/40 transition-colors uppercase placeholder-[#52525b] font-light"
                  placeholder="Squat..."
                />

                {showSuggestions && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-[#0a0a0a] border border-white/10 rounded-lg overflow-hidden shadow-2xl z-30">
                    {suggestions.map((name, i) => (
                      <button
                        key={name}
                        onMouseDown={() => selectSuggestion(name)}
                        className={`block w-full text-left px-4 py-3 text-sm uppercase tracking-wide transition-colors ${i === selectedSuggestion
                          ? 'bg-white text-[#050505]'
                          : 'text-[#a1a1aa] hover:bg-white/5 hover:text-white'
                          }`}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Weight Input */}
            <div className="w-32">
              <label className="block text-[10px] text-[#52525b] tracking-widest mb-3 uppercase">Load (lbs)</label>
              <input
                ref={weightRef}
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="w-full bg-transparent border-b border-white/10 px-0 py-3 text-white text-lg text-center outline-none focus:border-white/40 transition-colors font-mono-nums font-light"
                placeholder="225"
              />
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartSet}
              disabled={!isValid}
              className="h-12 px-10 bg-white text-[#050505] text-xs font-medium tracking-widest uppercase rounded-full hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Start Set
            </button>
          </div>
        </div>
      )}

      {/* Tracking Header */}
      {isTracking && (
        <div className="relative z-20 px-10 py-5 bg-white/5 border-b border-white/10">
          <div className="flex items-center justify-between max-w-3xl mx-auto">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-white font-medium uppercase tracking-wide">{exerciseName}</span>
              <span className="text-[#52525b]">@</span>
              <span className="text-white font-mono-nums">{weight} lbs</span>
            </div>
            <button
              onClick={handleEndSet}
              className="flex items-center gap-2 px-6 py-2.5 bg-white text-[#050505] text-[11px] font-medium tracking-widest uppercase rounded-full hover:opacity-90 transition-all"
            >
              <Square className="w-3 h-3 fill-current" strokeWidth={1.25} />
              End Set
            </button>
          </div>
        </div>
      )}

      {/* Set Logged Confirmation */}
      {lastLoggedSet && (
        <div className="relative z-20 px-10 py-4 bg-white/10 border-b border-white/10">
          <div className="flex items-center justify-center gap-3 max-w-3xl mx-auto">
            <Check className="w-4 h-4 text-white" strokeWidth={1.25} />
            <span className="text-white text-xs font-medium tracking-wide uppercase">
              Set Logged: {lastLoggedSet.exercise} — {lastLoggedSet.weight} lbs × {lastLoggedSet.reps} reps
              {lastLoggedSet.avgVelocity && ` @ ${lastLoggedSet.avgVelocity.toFixed(2)} m/s`}
            </span>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <button
          onClick={() => { setError(null); handleEndSet(); }}
          className="relative z-20 w-full px-10 py-4 bg-red-500/10 border-b border-red-500/20 hover:bg-red-500/20 transition-colors"
        >
          <div className="flex items-center justify-center gap-3 max-w-3xl mx-auto">
            <AlertCircle className="w-4 h-4 text-red-400" strokeWidth={1.25} />
            <span className="text-red-400 text-xs font-medium tracking-wide uppercase">
              {error}
            </span>
          </div>
        </button>
      )}

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 p-8">
        {/* Connection Status */}
        <div className="absolute top-8 right-10 flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-white' : 'bg-[#52525b]'}`} />
          <span className="text-[10px] text-[#52525b] tracking-widest uppercase">
            {connected ? 'Streaming' : 'Connecting...'}
          </span>
        </div>



        {/* Main Velocity Display */}
        <div className="text-center mb-16">
          <div className={`text-[160px] font-extralight leading-none tracking-tighter font-mono-nums ${isTracking ? 'text-white velocity-active-glow' : 'text-[#1a1a1a] velocity-glow'}`}>
            {velocity.toFixed(2)}
          </div>
          <div className="text-[#52525b] text-xs tracking-[0.4em] uppercase mt-4">
            Meters / Second
          </div>
        </div>

        {/* Phase Indicator */}
        <div className={`text-xl font-light tracking-[0.3em] uppercase mb-16 ${isTracking ? 'text-[#a1a1aa]' : 'text-[#2a2a2a]'}`}>
          {getPhaseLabel()}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-20">
          {/* Rep Count */}
          <div className="text-center">
            <div className={`text-5xl font-extralight font-mono-nums mb-2 ${isTracking ? 'text-white' : 'text-[#1a1a1a]'}`}>{repCount}</div>
            <div className="text-[10px] text-[#52525b] tracking-widest uppercase">Reps</div>
          </div>

          {/* Last Rep Velocity */}
          <div className="text-center">
            <div className={`text-5xl font-extralight font-mono-nums mb-2 ${lastRep ? 'text-white' : 'text-[#1a1a1a]'}`}>
              {lastRep ? lastRep.avgVelocity.toFixed(2) : '—'}
            </div>
            <div className="text-[10px] text-[#52525b] tracking-widest uppercase">Last Rep Avg</div>
          </div>

          {/* Peak Velocity */}
          <div className="text-center">
            <div className={`text-5xl font-extralight font-mono-nums mb-2 ${peakVelocity > 0 ? 'text-white' : 'text-[#1a1a1a]'}`}>
              {peakVelocity > 0 ? peakVelocity.toFixed(2) : '—'}
            </div>
            <div className="text-[10px] text-[#52525b] tracking-widest uppercase">Peak</div>
          </div>
        </div>

        {/* Instructions */}
        {!isTracking && sessionHistory.length === 0 && (
          <div className="absolute bottom-10 text-center">
            <span className="text-[11px] text-[#52525b] tracking-widest">
              Enter exercise and weight, then start set
            </span>
          </div>
        )}
      </div>

      {/* Session History Log */}
      {sessionHistory.length > 0 && (
        <div className="relative z-10 border-t border-white/5 bg-[#050505]">
          <div className="px-10 py-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-[10px] text-[#52525b] tracking-widest uppercase">Session Log</span>
              <span className="text-[10px] text-[#2a2a2a]">—</span>
              <span className="text-[10px] text-[#52525b]">
                {sessionHistory.reduce((acc, ex) => acc + ex.sets.length, 0)} sets
              </span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {sessionHistory.flatMap(exercise =>
                exercise.sets.map((set) => (
                  <div
                    key={`${exercise.id}-${set.id}`}
                    className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/5 rounded-full text-xs"
                  >
                    <span className="text-[#a1a1aa] uppercase">{exercise.name}</span>
                    <span className="text-white font-mono-nums">{set.weight}</span>
                    <span className="text-[#52525b]">×</span>
                    <span className="text-white font-mono-nums">{set.reps}</span>
                    {set.avgVelocity && (
                      <span className="text-[#a1a1aa] font-mono-nums text-[10px]">
                        {set.avgVelocity.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
