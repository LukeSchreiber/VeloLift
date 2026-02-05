import Dexie from 'dexie';

export const db = new Dexie('LiftingData');

db.version(1).stores({
  workouts: '++id, date',
  exercises: '++id, workoutId, name, order',
  sets: '++id, exerciseId, order',
});

// Version 2 adds notes field to workouts (no migration needed, just stores the field)
db.version(2).stores({
  workouts: '++id, date',
  exercises: '++id, workoutId, name, order',
  sets: '++id, exerciseId, order',
});

// --- Workout operations ---

export async function createWorkout(date) {
  const existing = await db.workouts.where('date').equals(date).first();
  if (existing) return existing.id;
  return db.workouts.add({ date, createdAt: Date.now() });
}

export async function getWorkoutByDate(date) {
  return db.workouts.where('date').equals(date).first();
}

export async function updateWorkoutNotes(workoutId, notes) {
  return db.workouts.update(workoutId, { notes });
}

export async function getAllWorkoutDates() {
  const workouts = await db.workouts.orderBy('date').reverse().toArray();
  const seen = new Set();
  const unique = [];

  // Pre-fetch all exercises to avoid N+1 queries
  const allExercises = await db.exercises.toArray();
  const exercisesByWorkout = {};
  for (const ex of allExercises) {
    if (!exercisesByWorkout[ex.workoutId]) exercisesByWorkout[ex.workoutId] = [];
    exercisesByWorkout[ex.workoutId].push(ex.name.toLowerCase());
  }

  for (const w of workouts) {
    if (w.date.startsWith('__')) continue;
    if (!seen.has(w.date)) {
      seen.add(w.date);

      // Classify
      const names = exercisesByWorkout[w.id] || [];
      let label = '';

      let push = 0;
      let pull = 0;
      let legs = 0;

      for (const name of names) {
        if (/\b(squat|leg|deadlift|calf|lunge|rdl)\b/i.test(name)) legs++;
        else if (/\b(bench|press|push|dip|fly|raise|tricep|skull\s*crush)\b/i.test(name)) push++;
        else if (/\b(row|pull|chin|curl|shrug|lat|face|bicep)\b/i.test(name)) pull++;
      }

      if (names.length === 0) label = '';
      else if (legs > Math.max(push, pull)) label = 'LEGS';
      else if (push > 0 && pull > 0 && legs === 0) label = 'UPPER';
      else if (push > 0 && pull === 0 && legs === 0) label = 'PUSH';
      else if (pull > 0 && push === 0 && legs === 0) label = 'PULL';
      else label = 'HYBRID';

      unique.push({ id: w.id, date: w.date, label });
    }
  }
  return unique;
}

export async function deleteWorkout(workoutId) {
  const exercises = await db.exercises.where('workoutId').equals(workoutId).toArray();
  const exerciseIds = exercises.map((e) => e.id);
  await db.transaction('rw', db.workouts, db.exercises, db.sets, async () => {
    await db.sets.where('exerciseId').anyOf(exerciseIds).delete();
    await db.exercises.where('workoutId').equals(workoutId).delete();
    await db.workouts.delete(workoutId);
  });
}

// --- Exercise operations ---

export async function addExercise(workoutId, name) {
  const count = await db.exercises.where('workoutId').equals(workoutId).count();
  return db.exercises.add({ workoutId, name: name.trim(), order: count });
}

export async function getExercisesForWorkout(workoutId) {
  return db.exercises.where('workoutId').equals(workoutId).sortBy('order');
}

export async function deleteExercise(exerciseId) {
  await db.transaction('rw', db.exercises, db.sets, async () => {
    await db.sets.where('exerciseId').equals(exerciseId).delete();
    await db.exercises.delete(exerciseId);
  });
}

export async function updateExerciseName(exerciseId, name) {
  return db.exercises.update(exerciseId, { name: name.trim() });
}

// --- Set operations ---

export async function addSet(exerciseId, weight, reps, rpe = null, avgVelocity = null, repDetails = null) {
  const count = await db.sets.where('exerciseId').equals(exerciseId).count();
  return db.sets.add({
    exerciseId,
    weight: Number(weight),
    reps: Number(reps),
    rpe: rpe ? Number(rpe) : null,
    avgVelocity: avgVelocity ? Number(avgVelocity) : null,
    repDetails: repDetails || null, // Array of { repNumber, avgVelocity, peakVelocity, duration }
    order: count,
    timestamp: Date.now(),
  });
}

export async function getSetsForExercise(exerciseId) {
  return db.sets.where('exerciseId').equals(exerciseId).sortBy('order');
}

export async function updateSet(setId, fields) {
  const update = {};
  if (fields.weight !== undefined) update.weight = Number(fields.weight);
  if (fields.reps !== undefined) update.reps = Number(fields.reps);
  if (fields.rpe !== undefined) update.rpe = fields.rpe ? Number(fields.rpe) : null;
  return db.sets.update(setId, update);
}

export async function deleteSet(setId) {
  return db.sets.delete(setId);
}

// --- Search / autocomplete ---

export async function getAllExerciseNames() {
  const exercises = await db.exercises.toArray();
  const names = [...new Set(exercises.map((e) => e.name))];
  return names.sort();
}

// Rename all instances of an exercise to a new name
export async function renameExercise(oldName, newName) {
  const exercises = await db.exercises
    .filter((e) => e.name.toLowerCase() === oldName.toLowerCase())
    .toArray();

  await db.transaction('rw', db.exercises, async () => {
    for (const ex of exercises) {
      await db.exercises.update(ex.id, { name: newName });
    }
  });

  return exercises.length;
}

// Normalize common exercise name variations
export async function normalizeExerciseNames() {
  const normalizations = [
    ['Back Squat', 'Squat'],
    ['Barbell Squat', 'Squat'],
    ['BB Squat', 'Squat'],
  ];

  for (const [oldName, newName] of normalizations) {
    await renameExercise(oldName, newName);
  }
}

export async function searchWorkoutsByExercise(exerciseName) {
  const query = exerciseName.toLowerCase();
  const matches = await db.exercises
    .filter((e) => e.name.toLowerCase().includes(query))
    .toArray();

  const workoutIds = [...new Set(matches.map((e) => e.workoutId))];
  const workouts = await db.workouts.bulkGet(workoutIds);
  return workouts
    .filter(Boolean)
    .sort((a, b) => (b.date > a.date ? 1 : -1));
}

// --- Full session load (optimized single call) ---

export async function getFullSession(workoutId) {
  const exercises = await getExercisesForWorkout(workoutId);

  // Batch fetch all sets for all exercises in this workout (fixes N+1)
  const exerciseIds = exercises.map((ex) => ex.id);
  const allSets = await db.sets
    .where('exerciseId')
    .anyOf(exerciseIds)
    .toArray();

  // Group sets by exerciseId
  const setsByExercise = {};
  for (const set of allSets) {
    if (!setsByExercise[set.exerciseId]) {
      setsByExercise[set.exerciseId] = [];
    }
    setsByExercise[set.exerciseId].push(set);
  }

  // Sort sets within each exercise by order
  return exercises.map((ex) => ({
    ...ex,
    sets: (setsByExercise[ex.id] || []).sort((a, b) => a.order - b.order),
  }));
}

// --- Seed from backup data ---

export async function seedDatabase(seedWorkouts) {
  const count = await db.workouts.count();
  if (count > 0) return false; // already seeded

  await db.transaction('rw', db.workouts, db.exercises, db.sets, async () => {
    for (const workout of seedWorkouts) {
      const workoutId = await db.workouts.add({
        date: workout.date,
        createdAt: Date.now(),
      });

      for (const exercise of workout.exercises) {
        const exerciseId = await db.exercises.add({
          workoutId,
          name: exercise.name,
          order: exercise.order,
        });

        for (const set of exercise.sets) {
          await db.sets.add({
            exerciseId,
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
            order: set.order,
          });
        }
      }
    }
  });

  return true;
}
