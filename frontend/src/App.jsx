import { useState, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import Sidebar from './components/Sidebar';
import SessionView from './components/SessionView';
import VelocityView from './components/VelocityView';
import Logger from './components/Logger';
import ErrorBoundary from './components/ErrorBoundary';
import { useLiveQuery } from './hooks/useLiveQuery';
import { getAllWorkoutDates, searchWorkoutsByExercise, createWorkout, seedDatabase, normalizeExerciseNames } from './db';
import { seedWorkouts } from './seedData';

function App() {
  const [selectedDate, setSelectedDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [trackerConnected, setTrackerConnected] = useState(false);
  const [activeView, setActiveView] = useState('session'); // 'session' or 'velocity'

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Check if velocity tracker is running
  useEffect(() => {
    const checkTracker = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/health', { method: 'GET' });
        if (res.ok) {
          const data = await res.json();
          setTrackerConnected(data.status === 'healthy');
        } else {
          setTrackerConnected(false);
        }
      } catch {
        setTrackerConnected(false);
      }
    };

    checkTracker();
    const interval = setInterval(checkTracker, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    seedDatabase(seedWorkouts)
      .then(() => normalizeExerciseNames())
      .then(() => {
        refresh();
      });
  }, []);

  const workoutDates = useLiveQuery(getAllWorkoutDates, [refreshKey], []);

  const searchResults = useLiveQuery(
    async () => {
      if (!searchQuery.trim()) return null;
      const results = await searchWorkoutsByExercise(searchQuery);
      return results.map((w) => ({ id: w.id, date: w.date }));
    },
    [searchQuery, refreshKey],
    null
  );

  const handleNewWorkout = async (date) => {
    const workoutDate = date || format(new Date(), 'yyyy-MM-dd');
    await createWorkout(workoutDate);
    setSelectedDate(workoutDate);
    refresh();
  };

  const handleDeleted = () => {
    setSelectedDate(null);
    refresh();
  };

  const activeDate = selectedDate || (workoutDates?.length > 0 ? workoutDates[0].date : null);

  return (
    <div className="flex h-screen bg-bg-primary">
      {/* Left Sidebar */}
      <div className="w-[280px] min-w-[280px] border-r border-border flex flex-col">
        <Sidebar
          workoutDates={workoutDates}
          selectedDate={activeDate}
          onSelectDate={setSelectedDate}
          onNewWorkout={handleNewWorkout}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchResults={searchResults}
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* View Toggle - minimal, blends into header */}
        {trackerConnected && (
          <div className="flex items-center gap-1 px-10 py-4 border-b border-white/5">
            <button
              onClick={() => setActiveView('session')}
              className={`px-5 py-2 text-[11px] font-medium tracking-widest uppercase rounded-full transition-all ${activeView === 'session'
                ? 'bg-white/10 text-white'
                : 'text-[#52525b] hover:text-[#a1a1aa]'
                }`}
            >
              Session
            </button>
            <button
              onClick={() => setActiveView('velocity')}
              className={`px-5 py-2 text-[11px] font-medium tracking-widest uppercase rounded-full transition-all ${activeView === 'velocity'
                ? 'bg-white text-[#050505]'
                : 'text-[#52525b] hover:text-[#a1a1aa]'
                }`}
            >
              Velocity
            </button>
          </div>
        )}

        {/* Conditional View Rendering */}
        <ErrorBoundary>
          {activeView === 'velocity' && trackerConnected ? (
            <VelocityView date={activeDate} onSetLogged={refresh} />
          ) : (
            <>
              <SessionView
                date={activeDate}
                onDeleted={handleDeleted}
                refreshKey={refreshKey}
                trackerConnected={trackerConnected}
              />
              {activeDate && (
                <Logger
                  date={activeDate}
                  onLogged={refresh}
                />
              )}
            </>
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default App;
