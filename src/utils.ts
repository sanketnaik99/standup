import { LocalStorage } from "@raycast/api";
import { Task } from "./types";
import { syncDailyNote } from "./apple-notes";

const TASKS_KEY_PREFIX = "tasks_";
export const DEFAULT_PROFILE = "Work";
const PROFILES_KEY = "profiles";

export function getDateString(date: Date): string {
  return date.toISOString().split("T")[0];
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
  // Only sync default profile to Apple Notes for now (or strictly follow current behavior)
  // Fire and forget sync to avoid blocking UI
  syncDailyNote(date, tasks, profile).catch((e) => console.error("Background sync failed", e));
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

export async function migrateTasksToToday(profile: string = DEFAULT_PROFILE): Promise<number> {
  const today = new Date();
  const todayStr = getDateString(today);
  const allItems = await LocalStorage.allItems();
  let migratoryCount = 0;
  const migratedTasks: Task[] = [];

  // Construct a prefix that matches this profile's keys
  // Default: "tasks_"
  // Custom: "tasks_MyProfile_"
  let searchPrefix = TASKS_KEY_PREFIX;
  if (profile !== DEFAULT_PROFILE) {
    searchPrefix = `${TASKS_KEY_PREFIX}${profile}_`;
  }

  for (const [key, value] of Object.entries(allItems)) {
    if (!key.startsWith(searchPrefix)) continue;

    // Check if it belongs strictly to this profile
    // If we are looking for default profile (tasks_), we must ensure it's NOT a custom profile key (tasks_Work_...)
    // Actually, getTaskKey logic:
    // Default: tasks_2023-01-01
    // Custom: tasks_Work_2023-01-01
    // So if profile is default, we want keys that start with "tasks_" followed immediately by a digit (start of date)
    // RegExp check might be safer or just string manipulation

    let dateStr = "";
    if (profile === DEFAULT_PROFILE) {
      // key is tasks_YYYY-MM-DD
      // The checking logic: the character after "tasks_" should be a digit for a date.
      // Or we can rely on split/length.
      // tasks_Work_2023... -> split(_) -> [tasks, Work, 2023...] (3 parts)
      // tasks_2023... -> split(_) -> [tasks, 2023...] (2 parts)
      // But profiles can have underscores? Let's assume Profile names are simple for now or we just iterate carefully.
      // Safer:
      // formatted key for a date is exactly what getTaskKey returns.
      // But we are iterating ALL keys.

      // Easier logic:
      // We know the prefix.
      const suffix = key.slice(searchPrefix.length);
      // If it's the default profile, the suffix MUST look like a date "YYYY-MM-DD".
      // If it's a custom profile, the suffix MUST look like a date "YYYY-MM-DD".
      // AND for default profile, we must ensure we aren't picking up "tasks_Work_..." which also starts with "tasks_"

      // If profile is default, searchPrefix is "tasks_".
      // "tasks_Work_2023-01-01" starts with "tasks_".
      // But the suffix "Work_2023-01-01" does not look like a date.

      if (!/^\d{4}-\d{2}-\d{2}$/.test(suffix)) {
        continue;
      }
      dateStr = suffix;
    } else {
      // Custom profile. Search prefix is "tasks_{Profile}_".
      // The suffix shoud be the date.
      const suffix = key.slice(searchPrefix.length);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(suffix)) {
        continue;
      }
      dateStr = suffix;
    }

    if (dateStr >= todayStr) continue; // Skip today and future

    try {
      const tasks: Task[] = JSON.parse(value);
      let hasChanges = false;
      const remainingTasks: Task[] = [];

      for (const task of tasks) {
        if (task.status !== "done") {
          migratedTasks.push(task);
          migratoryCount++;
          hasChanges = true;
        } else {
          remainingTasks.push(task);
        }
      }

      if (hasChanges) {
        await LocalStorage.setItem(key, JSON.stringify(remainingTasks));
      }
    } catch (e) {
      console.error(`Failed to parse tasks for key ${key}`, e);
    }
  }

  if (migratedTasks.length > 0) {
    const todayTasks = await getTasks(today, profile);
    // Avoid duplicates by ID
    const existingIds = new Set(todayTasks.map((t) => t.id));
    const uniqueMigrated = migratedTasks.filter((t) => !existingIds.has(t.id));

    if (uniqueMigrated.length > 0) {
      const newTaskList = [...todayTasks, ...uniqueMigrated];
      await saveTasks(today, newTaskList, profile);
    }
  }

  return migratoryCount;
}
