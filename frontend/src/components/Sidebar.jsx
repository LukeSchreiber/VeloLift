import { useState, useMemo } from 'react';
import { format, parseISO, isToday, isThisWeek, isThisMonth, startOfMonth, getYear, getMonth } from 'date-fns';
import { Activity, Calendar as CalendarIcon, List, Plus, ChevronLeft, ChevronRight, Search } from 'lucide-react';

export default function Sidebar({ workoutDates, selectedDate, onSelectDate, onNewWorkout, searchQuery, onSearchChange, searchResults }) {
  const [view, setView] = useState('list');
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newWorkoutDate, setNewWorkoutDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const displayDates = searchResults || workoutDates;

  const grouped = useMemo(() => {
    if (!displayDates) return {};
    const groups = {};
    for (const w of displayDates) {
      const d = parseISO(w.date);
      let label;
      if (isToday(d)) label = 'TODAY';
      else if (isThisWeek(d, { weekStartsOn: 1 })) label = 'THIS WEEK';
      else if (isThisMonth(d)) label = 'THIS MONTH';
      else label = format(d, 'MMM yyyy').toUpperCase();
      if (!groups[label]) groups[label] = [];
      groups[label].push(w);
    }
    return groups;
  }, [displayDates]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth);
    const year = getYear(start);
    const month = getMonth(start);
    const firstDay = start.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const workoutSet = new Set((workoutDates || []).map((w) => w.date));

    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({ day: d, date: dateStr, hasWorkout: workoutSet.has(dateStr) });
    }
    return days;
  }, [calendarMonth, workoutDates]);

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="flex flex-col h-full glass-panel w-[280px]">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 bg-white flex items-center justify-center rounded-full">
            <Activity className="w-4 h-4 text-[#050505]" strokeWidth={1.5} />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-sm tracking-tight text-white leading-none">LIFTING<span className="text-[#a1a1aa]">DATA</span></span>
            <span className="font-mono text-[10px] text-[#52525b] mt-1">v2.5.0</span>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 mb-6">
          <button
            onClick={() => setView('list')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-[11px] font-medium tracking-wide uppercase transition-all rounded-full ${view === 'list'
              ? 'bg-white/10 text-white'
              : 'text-[#52525b] hover:text-[#a1a1aa]'
              }`}
          >
            <List className="w-3.5 h-3.5" strokeWidth={1.25} />
            Logs
          </button>
          <button
            onClick={() => setView('calendar')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-[11px] font-medium tracking-wide uppercase transition-all rounded-full ${view === 'calendar'
              ? 'bg-white/10 text-white'
              : 'text-[#52525b] hover:text-[#a1a1aa]'
              }`}
          >
            <CalendarIcon className="w-3.5 h-3.5" strokeWidth={1.25} />
            Cal
          </button>
        </div>

        {/* Search */}
        <div className="relative group">
          <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525b] group-focus-within:text-white transition-colors" strokeWidth={1.25} />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full bg-transparent border-b border-white/10 text-xs text-white placeholder-[#52525b] py-2.5 pl-6 outline-none focus:border-white/30 transition-colors"
          />
        </div>
      </div>

      {/* New Workout Button */}
      <div className="px-6 pb-4">
        {showDatePicker ? (
          <div className="space-y-3">
            <input
              type="date"
              value={newWorkoutDate}
              onChange={(e) => setNewWorkoutDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white text-xs font-mono px-4 py-2.5 rounded-full outline-none focus:border-white/30"
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onNewWorkout(newWorkoutDate);
                  setShowDatePicker(false);
                  setNewWorkoutDate(format(new Date(), 'yyyy-MM-dd'));
                }}
                className="flex-1 px-4 py-2.5 bg-white text-[#050505] font-medium text-xs tracking-wide rounded-full hover:opacity-90 transition-all"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowDatePicker(false);
                  setNewWorkoutDate(format(new Date(), 'yyyy-MM-dd'));
                }}
                className="px-4 py-2.5 text-[#a1a1aa] text-xs hover:text-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDatePicker(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white text-[#050505] font-medium text-xs tracking-wide rounded-full hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} />
            New Workout
          </button>
        )}
      </div>

      {/* Log Stream */}
      <div className="flex-1 overflow-y-auto px-6 py-2">
        {view === 'list' ? (
          <div className="space-y-8">
            {Object.entries(grouped).map(([label, items]) => (
              <div key={label}>
                <div className="text-[10px] font-mono text-[#52525b] mb-3 tracking-widest">{label}</div>
                <div className="space-y-0.5">
                  {items.map((w) => {
                    const isSelected = selectedDate === w.date;
                    return (
                      <button
                        key={w.id}
                        onClick={() => onSelectDate(w.date)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-mono transition-all rounded-lg group ${isSelected
                          ? 'bg-white/5 text-white'
                          : 'text-[#a1a1aa] hover:text-white hover:bg-white/5'
                          }`}
                      >
                        {/* Active Pill Indicator */}
                        <div className={`w-0.5 h-4 rounded-full transition-all ${isSelected ? 'bg-white' : 'bg-transparent group-hover:bg-white/30'}`} />
                        <span className="flex-1 text-left">{format(parseISO(w.date), 'EEE, MMM d')}</span>
                        {w.label && (
                          <span className="text-[9px] text-[#52525b] tracking-wider">{w.label}</span>
                        )}
                        {w.date === todayStr && (
                          <span className="w-1.5 h-1.5 bg-white rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="pt-2">
            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setCalendarMonth(new Date(getYear(calendarMonth), getMonth(calendarMonth) - 1))} className="text-[#52525b] hover:text-white transition-colors p-1">
                <ChevronLeft className="w-4 h-4" strokeWidth={1.25} />
              </button>
              <span className="font-mono text-xs text-white tracking-wide">{format(calendarMonth, 'MMMM yyyy')}</span>
              <button onClick={() => setCalendarMonth(new Date(getYear(calendarMonth), getMonth(calendarMonth) + 1))} className="text-[#52525b] hover:text-white transition-colors p-1">
                <ChevronRight className="w-4 h-4" strokeWidth={1.25} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={i} className="text-center font-mono text-[9px] text-[#52525b]">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((d, i) => (
                <div key={i} className="aspect-square flex items-center justify-center">
                  {d ? (
                    <button
                      onClick={() => d.hasWorkout && onSelectDate(d.date)}
                      disabled={!d.hasWorkout}
                      className={`w-full h-full flex items-center justify-center font-mono text-[10px] transition-all rounded-full ${d.date === selectedDate
                        ? 'bg-white text-[#050505]'
                        : d.hasWorkout
                          ? 'text-white hover:bg-white/10'
                          : 'text-[#52525b]'
                        }`}
                    >
                      {d.day}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5">
        <div className="flex justify-between items-center font-mono text-[10px] text-[#52525b]">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
            Online
          </span>
          <span>{workoutDates?.length || 0} logs</span>
        </div>
      </div>
    </div>
  );
}
