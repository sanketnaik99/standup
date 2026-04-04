import { LocalStorage } from "@raycast/api";
import { Task, TaskWithDate, Routine } from "./types";
import { syncDailyNote } from "./apple-notes";

const TASKS_KEY_PREFIX = "tasks_";
const ROUTINES_KEY = "routines";
const ROUTINE_COMPLETIONS_KEY = "routine_completions";
const LAST_ROUTINE_RESET_DATE_KEY = "last_routine_reset_date";
export const DEFAULT_PROFILE = "Work";
const PROFILES_KEY = "profiles";

export function getDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTaskKey(date: Date, profile: string): string {
  const dateStr = getDateString(date);
  if (profile === DEFAULT_PROFILE) {
    return `${TASKS_KEY_PREFIX}${dateStr}`;
  }
  return `${TASKS_KEY_PREFIX}${profile}_${dateStr}`;
}

export async function getProfiles(): Promise<string[]> {
  const data = await LocalStorage.getItem<string>(PROFILES_KEY);
  if (!data) return [DEFAULT_PROFILE];
  try {
    const profiles = JSON.parse(data);
    return profiles.length > 0 ? profiles : [DEFAULT_PROFILE];
  } catch {
    return [DEFAULT_PROFILE];
  }
}

export async function saveProfiles(profiles: string[]): Promise<void> {
  await LocalStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export async function createProfile(name: string): Promise<void> {
  const profiles = await getProfiles();
  if (!profiles.includes(name)) {
    profiles.push(name);
    await saveProfiles(profiles);
  }
}

export async function deleteProfile(name: string): Promise<void> {
  if (name === DEFAULT_PROFILE) return;
  const profiles = await getProfiles();
  const newProfiles = profiles.filter((p) => p !== name);
  await saveProfiles(newProfiles);
}

export async function getTasks(date: Date, profile: string = DEFAULT_PROFILE): Promise<Task[]> {
  const dateKey = getTaskKey(date, profile);

  // Migration logic only for default profile: Check for old "tasks" key
  if (profile === DEFAULT_PROFILE) {
    const oldData = await LocalStorage.getItem<string>("tasks");
    if (oldData) {
      const todayKey = getTaskKey(new Date(), DEFAULT_PROFILE);
      await LocalStorage.removeItem("tasks");
      await LocalStorage.setItem(todayKey, oldData);
      if (dateKey === todayKey) {
        try {
          return JSON.parse(oldData);
        } catch {
          return [];
        }
      }
    }
  }

  const data = await LocalStorage.getItem<string>(dateKey);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveTasks(date: Date, tasks: Task[], profile: string = DEFAULT_PROFILE): Promise<void> {
  const dateKey = getTaskKey(date, profile);
  await LocalStorage.setItem(dateKey, JSON.stringify(tasks));

  // Fire and forget sync to avoid blocking UI
  // Gather all profiles tasks for the sync
  const profiles = await getProfiles();
  const tasksMap: Record<string, Task[]> = {};

  for (const p of profiles) {
    if (p === profile) {
      tasksMap[p] = tasks;
    } else {
      tasksMap[p] = await getTasks(date, p);
    }
  }

  syncDailyNote(date, tasksMap).catch((e) => console.error("Background sync failed", e));
}

export async function createTask(
  task: Task,
  date: Date = new Date(),
  profile: string = DEFAULT_PROFILE,
): Promise<void> {
  const tasks = await getTasks(date, profile);
  tasks.push(task);
  await saveTasks(date, tasks, profile);
}

export async function updateTask(
  updatedTask: Task,
  date: Date = new Date(),
  profile: string = DEFAULT_PROFILE,
): Promise<void> {
  const tasks = await getTasks(date, profile);
  const index = tasks.findIndex((t) => t.id === updatedTask.id);
  if (index !== -1) {
    tasks[index] = updatedTask;
    await saveTasks(date, tasks, profile);
  }
}

export async function deleteTask(
  taskId: string,
  date: Date = new Date(),
  profile: string = DEFAULT_PROFILE,
): Promise<void> {
  const tasks = await getTasks(date, profile);
  const newTasks = tasks.filter((t) => t.id !== taskId);
  await saveTasks(date, newTasks, profile);
}

export async function migrateAllTasksToToday(): Promise<number> {
  const today = new Date();
  const todayStr = getDateString(today);

  // Check if migration already ran today
  const lastMigrationDate = await LocalStorage.getItem<string>("last_migration_date");
  if (lastMigrationDate === todayStr) {
    return 0;
  }

  const allItems = await LocalStorage.allItems();
  let totalMigratedCount = 0;
  const migrationUpdates: Record<string, Task[]> = {}; // key -> new task list json string
  const targetUpdates: Record<string, Task[]> = {}; // profile -> tasks to add to today

  // First pass: scanning all keys to find what to move
  for (const [key, value] of Object.entries(allItems)) {
    if (!key.startsWith(TASKS_KEY_PREFIX)) continue;

    let profile = DEFAULT_PROFILE;
    let dateStr = "";
    const suffix = key.slice(TASKS_KEY_PREFIX.length);

    // Check for default profile keys: tasks_YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(suffix)) {
      profile = DEFAULT_PROFILE;
      dateStr = suffix;
    } else {
      // Check for custom profile keys: tasks_ProfileName_YYYY-MM-DD
      const parts = suffix.split("_");
      const datePart = parts[parts.length - 1];

      if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) continue;

      // Reconstruct profile name (everything before the date)
      profile = parts.slice(0, -1).join("_");
      dateStr = datePart;
    }

    if (dateStr >= todayStr) continue; // Skip today and future

    try {
      const tasks: Task[] = JSON.parse(value);
      const remainingTasks: Task[] = [];
      const tasksToMigrate: Task[] = [];

      for (const task of tasks) {
        if (task.status !== "done") {
          tasksToMigrate.push(task);
        } else {
          remainingTasks.push(task);
        }
      }

      if (tasksToMigrate.length > 0) {
        // Schedule update for the old key (removing moved tasks)
        migrationUpdates[key] = remainingTasks;

        // Schedule adding to today's list for this profile
        if (!targetUpdates[profile]) {
          targetUpdates[profile] = [];
        }
        targetUpdates[profile].push(...tasksToMigrate);
        totalMigratedCount += tasksToMigrate.length;
      }
    } catch (e) {
      console.error(`Failed to parse tasks for key ${key}`, e);
    }
  }

  // Second pass: apply updates
  // 1. Update old keys (remove moved tasks)
  for (const [key, remainingTasks] of Object.entries(migrationUpdates)) {
    await LocalStorage.setItem(key, JSON.stringify(remainingTasks));
  }

  // 2. Add moved tasks to today's lists
  if (totalMigratedCount > 0) {
    for (const [profile, movedTasks] of Object.entries(targetUpdates)) {
      const todayTasks = await getTasks(today, profile);

      // Avoid duplicates by ID (sanity check, though logic shouldn't produce them if date keys are unique)
      const existingIds = new Set(todayTasks.map((t) => t.id));
      const uniqueMoved = movedTasks.filter((t) => !existingIds.has(t.id));

      if (uniqueMoved.length > 0) {
        const newTaskList = [...todayTasks, ...uniqueMoved];
        await saveTasks(today, newTaskList, profile);
      }
    }
  }

  // Mark migration as done for today
  await LocalStorage.setItem("last_migration_date", todayStr);

  return totalMigratedCount;
}

export function formatDuration(minutes: number): string {
  if (!minutes) return "";
  if (minutes < 60) {
    return `${minutes} min`;
  }

  const days = Math.floor(minutes / (60 * 24));
  const remainingMinutesAfterDays = minutes % (60 * 24);
  const hours = Math.floor(remainingMinutesAfterDays / 60);
  const remainingMinutes = remainingMinutesAfterDays % 60;

  const parts = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hr" : "hrs"}`);
  if (remainingMinutes > 0) parts.push(`${remainingMinutes} min`);

  return parts.join(" ");
}

export async function getAllUndoneTasks(): Promise<Record<string, TaskWithDate[]>> {
  const allItems = await LocalStorage.allItems();
  const activeProfiles = await getProfiles();
  const activeProfilesSet = new Set(activeProfiles);
  const tasksByProfile: Record<string, TaskWithDate[]> = {};

  // Helper to add task to profile bucket
  const addTaskToProfile = (profile: string, task: Task, date: string) => {
    if (!tasksByProfile[profile]) {
      tasksByProfile[profile] = [];
    }
    if (task.status !== "done") {
      tasksByProfile[profile].push({ ...task, date });
    }
  };

  for (const [key, value] of Object.entries(allItems)) {
    if (!key.startsWith(TASKS_KEY_PREFIX)) continue;

    let profile = DEFAULT_PROFILE;
    let dateStr = "";
    const suffix = key.slice(TASKS_KEY_PREFIX.length);

    // Check for default profile keys: tasks_YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(suffix)) {
      profile = DEFAULT_PROFILE;
      dateStr = suffix;
    } else {
      // Check for custom profile keys: tasks_ProfileName_YYYY-MM-DD
      const parts = suffix.split("_");
      const datePart = parts[parts.length - 1];

      if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) continue;

      // Reconstruct profile name (everything before the date)
      profile = parts.slice(0, -1).join("_");
      dateStr = datePart;
    }

    if (!activeProfilesSet.has(profile)) continue;

    try {
      const tasks: Task[] = JSON.parse(value);
      tasks.forEach((task) => addTaskToProfile(profile, task, dateStr));
    } catch (e) {
      console.error(`Failed to parse tasks for key ${key}`, e);
    }
  }

  return tasksByProfile;
}

export const priorityOrder = { high: 3, medium: 2, low: 1 };
export const sortTasks = <T extends Task>(taskList: T[]) => {
  return [...taskList].sort((a, b) => {
    // 1. Priority
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;

    // 2. Earliest Deadline
    if (a.deadline && !b.deadline) return -1;
    if (!a.deadline && b.deadline) return 1;
    if (a.deadline && b.deadline) {
      const deadlineDiff = a.deadline - b.deadline;
      if (deadlineDiff !== 0) return deadlineDiff;
    }

    // 3. Shortest Expected Duration
    if (a.expectedDuration && !b.expectedDuration) return -1;
    if (!a.expectedDuration && b.expectedDuration) return 1;
    if (a.expectedDuration && b.expectedDuration) {
      return a.expectedDuration - b.expectedDuration;
    }

    return 0;
  });
};

export async function getRoutines(): Promise<Routine[]> {
  // 1. Check if reset needed
  const todayStr = getDateString(new Date());
  const lastResetDate = await LocalStorage.getItem<string>(LAST_ROUTINE_RESET_DATE_KEY);

  let routines: Routine[] = [];
  const data = await LocalStorage.getItem<string>(ROUTINES_KEY);
  if (data) {
    try {
      routines = JSON.parse(data);
    } catch {
      routines = [];
    }
  }

  if (lastResetDate !== todayStr) {
    // Reset all routines to 'todo'
    routines = routines.map((r) => ({ ...r, status: "todo" }));
    await LocalStorage.setItem(ROUTINES_KEY, JSON.stringify(routines));
    await LocalStorage.setItem(LAST_ROUTINE_RESET_DATE_KEY, todayStr);
  }

  return routines;
}

export async function saveRoutines(routines: Routine[]): Promise<void> {
  await LocalStorage.setItem(ROUTINES_KEY, JSON.stringify(routines));
}

export async function createRoutine(routine: Routine): Promise<void> {
  const routines = await getRoutines();
  routines.push(routine);
  await saveRoutines(routines);
}

export async function updateRoutine(updatedRoutine: Routine): Promise<void> {
  const routines = await getRoutines();
  const index = routines.findIndex((r) => r.id === updatedRoutine.id);
  if (index !== -1) {
    routines[index] = updatedRoutine;
    await saveRoutines(routines);
  }
}

export async function deleteRoutine(id: string): Promise<void> {
  const routines = await getRoutines();
  const newRoutines = routines.filter((r) => r.id !== id);
  await saveRoutines(newRoutines);
}

export async function logRoutineCompletion(date: Date, increment: boolean): Promise<void> {
  const dateStr = getDateString(date);
  const data = await LocalStorage.getItem<string>(ROUTINE_COMPLETIONS_KEY);
  let completions: Record<string, number> = {};
  if (data) {
    try {
      completions = JSON.parse(data);
    } catch {
      completions = {};
    }
  }

  const currentCount = completions[dateStr] || 0;
  if (increment) {
    completions[dateStr] = currentCount + 1;
  } else {
    completions[dateStr] = Math.max(0, currentCount - 1);
  }

  await LocalStorage.setItem(ROUTINE_COMPLETIONS_KEY, JSON.stringify(completions));
}

export async function getTaskCompletionHistory(): Promise<Record<string, number>> {
  const allItems = await LocalStorage.allItems();
  const history: Record<string, number> = {};

  // 1. Scan Tasks
  for (const [key, value] of Object.entries(allItems)) {
    if (!key.startsWith(TASKS_KEY_PREFIX)) continue;

    // Extract date from key
    let dateStr = "";
    const suffix = key.slice(TASKS_KEY_PREFIX.length);

    if (/^\d{4}-\d{2}-\d{2}$/.test(suffix)) {
      dateStr = suffix;
    } else {
      const parts = suffix.split("_");
      const datePart = parts[parts.length - 1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        dateStr = datePart;
      }
    }

    if (!dateStr) continue;

    try {
      const tasks: Task[] = JSON.parse(value);
      const completedCount = tasks.filter((t) => t.status === "done").length;
      if (completedCount > 0) {
        history[dateStr] = (history[dateStr] || 0) + completedCount;
      }
    } catch {
      // ignore
    }
  }

  // 2. Scan Routine Completions
  const routineData = await LocalStorage.getItem<string>(ROUTINE_COMPLETIONS_KEY);
  if (routineData) {
    try {
      const routineCompletions: Record<string, number> = JSON.parse(routineData);
      for (const [dateStr, count] of Object.entries(routineCompletions)) {
        history[dateStr] = (history[dateStr] || 0) + count;
      }
    } catch {
      // ignore
    }
  }

  return history;
}
