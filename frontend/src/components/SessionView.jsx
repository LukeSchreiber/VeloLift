import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { Trash2, AlertCircle, X, Check, FileText } from 'lucide-react';
import { getWorkoutByDate, getFullSession, deleteExercise, deleteSet, updateSet, deleteWorkout, updateWorkoutNotes } from '../db';
import SetDetailView from './SetDetailView';

export default function SessionView({ date, onDeleted, refreshKey, trackerConnected = false }) {
  const [session, setSession] = useState(null);
  const [workout, setWorkout] = useState(null);
  const [editingSet, setEditingSet] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [detailSet, setDetailSet] = useState(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const load = useCallback(async () => {
    const w = await getWorkoutByDate(date);
    if (!w) {
      setWorkout(null);
      setSession(null);
      setNotes('');
      return;
    }
    setWorkout(w);
    setNotes(w.notes || '');
    const data = await getFullSession(w.id);
    setSession(data);
  }, [date]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleNotesChange = async (newNotes) => {
    setNotes(newNotes);
    if (workout) {
      await updateWorkoutNotes(workout.id, newNotes);
    }
  };

  const handleDeleteExercise = async (exerciseId) => {
    await deleteExercise(exerciseId);
    load();
  };

  const handleDeleteSet = async (setId) => {
    await deleteSet(setId);
    load();
  };

  const handleEditSet = (set) => {
    setEditingSet(set.id);
    setEditValues({ weight: set.weight, reps: set.reps, rpe: set.rpe || '' });
  };

  const handleSaveSet = async (setId) => {
    await updateSet(setId, editValues);
    setEditingSet(null);
    load();
  };

  const handleDeleteWorkout = async () => {
    if (!workout) return;
    await deleteWorkout(workout.id);
    onDeleted?.();
  };

  if (!date || !workout) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#52525b]">
        <AlertCircle className="w-6 h-6 mb-4 opacity-30" strokeWidth={1.25} />
        <span className="text-xs tracking-widest uppercase">
          {date ? 'No data' : 'Select a date'}
        </span>
      </div>
    );
  }

  const totalSets = session?.reduce((acc, ex) => acc + ex.sets.length, 0) || 0;

  return (
    <div className="h-full flex flex-col bg-[#050505] text-white relative overflow-hidden">
      {/* Subtle Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-30" style={{
        backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px'
      }} />

      {/* Top Bar */}
      <div className="flex items-center justify-between px-10 py-6 border-b border-white/5 bg-[#050505] z-10 relative">
        <div className="flex flex-col">
          <span className="text-sm font-medium tracking-tight text-white">LIFTING<span className="text-[#a1a1aa]">DATA</span></span>
          <div className="flex items-center gap-2 mt-1">
            <div className={`w-1.5 h-1.5 rounded-full ${trackerConnected ? 'bg-white' : 'bg-[#52525b]'}`} />
            <span className="text-[10px] text-[#52525b] tracking-widest uppercase">
              {trackerConnected ? 'Tracker Online' : 'Data Logging'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-white text-sm font-light tracking-wide">
            {date ? format(parseISO(date), 'EEEE, MMMM d') : ''}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-[10px] text-[#52525b] tracking-widest uppercase">{totalSets} sets</span>
          <button
            onClick={() => setShowNotes(!showNotes)}
            className={`p-2 rounded-full transition-colors ${showNotes || notes ? 'text-white bg-white/10' : 'text-[#52525b] hover:text-white hover:bg-white/5'}`}
            title="Session notes"
          >
            <FileText className="w-4 h-4" strokeWidth={1.25} />
          </button>
          <button
            onClick={handleDeleteWorkout}
            className="p-2 text-[#52525b] hover:text-white hover:bg-white/5 rounded-full transition-colors"
            title="Delete workout"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.25} />
          </button>
        </div>
      </div>

      {/* Notes Section */}
      {showNotes && (
        <div className="px-10 py-4 border-b border-white/5 bg-white/[0.02]">
          <textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add session notes..."
            className="w-full bg-transparent text-white text-sm resize-none outline-none placeholder-[#52525b] min-h-[60px]"
            rows={3}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-10 py-8 relative z-10">
        {session?.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32">
            <h1 className="text-6xl font-extralight text-[#1a1a1a] tracking-tight">No Data</h1>
            <span className="text-[11px] text-[#52525b] tracking-widest mt-4">
              {trackerConnected ? 'Waiting for telemetry...' : 'Use the logger to add sets'}
            </span>
          </div>
        )}

        {/* Exercise List - Clean Divider Style */}
        <div className="space-y-10">
          {session?.map((exercise) => (
            <div key={exercise.id} className="group">
              {/* Exercise Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/10">
                <h3 className="text-xs font-medium text-[#a1a1aa] tracking-widest uppercase">
                  {exercise.name}
                </h3>
                <button
                  onClick={() => handleDeleteExercise(exercise.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/5 rounded-full transition-all text-[#52525b] hover:text-white"
                >
                  <X className="w-3 h-3" strokeWidth={1.25} />
                </button>
              </div>

              {/* Sets Table */}
              {exercise.sets.length > 0 ? (
                <div className="space-y-0">
                  {exercise.sets.map((set, idx) => (
                    <div
                      key={set.id}
                      className="group/row flex items-center py-4 border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                    >
                      {/* Set Number */}
                      <div className="w-12 text-xs font-mono text-[#52525b]">
                        {(idx + 1).toString().padStart(2, '0')}
                      </div>

                      {editingSet === set.id ? (
                        <>
                          <div className="flex-1 flex items-center gap-6">
                            <input
                              type="number"
                              value={editValues.weight}
                              onChange={(e) => setEditValues((v) => ({ ...v, weight: e.target.value }))}
                              className="w-20 bg-white/5 text-white text-right border border-white/20 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/40"
                              autoFocus
                            />
                            <span className="text-[#52525b] text-xs">×</span>
                            <input
                              type="number"
                              value={editValues.reps}
                              onChange={(e) => setEditValues((v) => ({ ...v, reps: e.target.value }))}
                              className="w-16 bg-white/5 text-white text-right border border-white/20 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-white/40"
                            />
                          </div>
                          <button onClick={() => handleSaveSet(set.id)} className="p-2 text-white hover:bg-white/10 rounded-full">
                            <Check className="w-4 h-4" strokeWidth={1.25} />
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Weight & Reps */}
                          <div
                            className="flex-1 flex items-center gap-6 cursor-pointer group/edit"
                            onClick={() => handleEditSet(set)}
                          >
                            <span className="text-lg font-light font-mono-nums text-white group-hover/edit:text-[#a1a1aa] transition-colors">
                              {set.weight}
                            </span>
                            <span className="text-[#52525b]">lbs</span>
                            <span className="text-[#52525b]">×</span>
                            <span className="text-lg font-light font-mono-nums text-white group-hover/edit:text-[#a1a1aa] transition-colors">
                              {set.reps}
                            </span>
                            <span className="text-[#52525b]">reps</span>
                          </div>

                          {/* Velocity */}
                          <div className="w-24 text-right">
                            {set.avgVelocity ? (
                              <button
                                onClick={() => setDetailSet({ set, exerciseName: exercise.name })}
                                className="font-mono-nums text-sm text-[#a1a1aa] hover:text-white px-3 py-1.5 hover:bg-white/5 rounded-full transition-all"
                              >
                                {typeof set.avgVelocity === 'number' && Number.isFinite(set.avgVelocity) ? set.avgVelocity.toFixed(2) : '—'}
                              </button>
                            ) : (
                              <span className="text-sm text-[#2a2a2a]">—</span>
                            )}
                          </div>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteSet(set.id)}
                            className="opacity-0 group-hover/row:opacity-100 p-2 text-[#52525b] hover:text-white hover:bg-white/5 rounded-full transition-all ml-2"
                          >
                            <X className="w-3 h-3" strokeWidth={1.25} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <span className="text-xs text-[#52525b]">No sets</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Set Detail Modal */}
      {detailSet && (
        <SetDetailView
          set={detailSet.set}
          exerciseName={detailSet.exerciseName}
          onClose={() => setDetailSet(null)}
        />
      )}
    </div>
  );
}
