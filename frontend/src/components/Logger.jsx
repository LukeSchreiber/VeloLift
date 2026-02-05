import { useState, useEffect, useRef } from 'react';

import { createWorkout, getWorkoutByDate, addExercise, addSet, getAllExerciseNames, getExercisesForWorkout } from '../db';

export default function Logger({ date, onLogged }) {
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const [allNames, setAllNames] = useState([]);
  const [isAdding, setIsAdding] = useState(false);

  const exerciseRef = useRef(null);
  const weightRef = useRef(null);

  useEffect(() => {
    getAllExerciseNames().then(setAllNames);
  }, []);

  const refreshNames = async () => {
    const names = await getAllExerciseNames();
    setAllNames(names);
  };

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

  const handleAddSet = async () => {
    const weightNum = Number(weight);
    const repsNum = Number(reps);

    if (!exerciseName.trim() || isAdding) return;
    if (!Number.isFinite(weightNum) || weightNum < 0) return;
    if (!Number.isInteger(repsNum) || repsNum <= 0) return;

    setIsAdding(true);
    try {
      await createWorkout(date);
      const workout = await getWorkoutByDate(date);

      const exercises = await getExercisesForWorkout(workout.id);
      let exercise = exercises.find(
        (e) => e.name.toLowerCase() === exerciseName.trim().toLowerCase()
      );

      if (!exercise) {
        const exId = await addExercise(workout.id, exerciseName.trim());
        exercise = { id: exId, name: exerciseName.trim() };
      }

      await addSet(exercise.id, weightNum, repsNum, null);

      setWeight('');
      setReps('');
      weightRef.current?.focus();

      await refreshNames();
      onLogged?.();
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAddSet();
  };

  const weightNum = Number(weight);
  const repsNum = Number(reps);
  const isValid = exerciseName.trim() && Number.isFinite(weightNum) && weightNum >= 0 && Number.isInteger(repsNum) && repsNum > 0;

  return (
    <div className="fixed bottom-0 left-[280px] right-0 glass-panel z-20 border-t border-white/5">
      <div className="px-10 py-6 flex items-end gap-8">
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
              className="w-full bg-transparent border-b border-white/10 px-0 py-2 text-white text-sm outline-none focus:border-white/40 transition-colors uppercase placeholder-[#52525b]"
              placeholder="Exercise name..."
            />

            {showSuggestions && (
              <div className="absolute bottom-full left-0 mb-2 w-full bg-[#0a0a0a] border border-white/10 rounded-lg overflow-hidden shadow-2xl z-30">
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

        {/* Weight & Reps */}
        <div className="flex gap-6 w-[260px]">
          <div className="flex-1">
            <label className="block text-[10px] text-[#52525b] tracking-widest mb-3 uppercase">Load (lbs)</label>
            <input
              ref={weightRef}
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent border-b border-white/10 px-0 py-2 text-white text-sm text-center outline-none focus:border-white/40 transition-colors font-mono-nums"
              placeholder="225"
            />
          </div>
          <div className="w-20">
            <label className="block text-[10px] text-[#52525b] tracking-widest mb-3 uppercase">Reps</label>
            <input
              type="number"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent border-b border-white/10 px-0 py-2 text-white text-sm text-center outline-none focus:border-white/40 transition-colors font-mono-nums"
              placeholder="8"
            />
          </div>
        </div>

        {/* Log Button */}
        <button
          onClick={handleAddSet}
          disabled={!isValid || isAdding}
          className="h-12 px-10 bg-white text-[#050505] text-xs font-medium tracking-widest uppercase rounded-full hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {isAdding ? 'Logging...' : 'Log Set'}
        </button>
      </div>
    </div>
  );
}
