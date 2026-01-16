import { LocalStorage } from "@raycast/api";
import { Task } from "./types";

const TASKS_KEY_PREFIX = "tasks_";

export function getDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function getTasks(date: Date): Promise<Task[]> {
  const dateKey = `${TASKS_KEY_PREFIX}${getDateString(date)}`;
  
  // Migration logic: Check for old "tasks" key
  const oldData = await LocalStorage.getItem<string>("tasks");
  if (oldData) {
    const todayKey = `${TASKS_KEY_PREFIX}${getDateString(new Date())}`;
    await LocalStorage.removeItem("tasks");
    await LocalStorage.setItem(todayKey, oldData);
    if (dateKey === todayKey) {
        try {
            return JSON.parse(oldData);
        } catch { return []; } 
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

import { syncDailyNote } from "./apple-notes";

export async function saveTasks(date: Date, tasks: Task[]): Promise<void> {
  const dateKey = `${TASKS_KEY_PREFIX}${getDateString(date)}`;
  await LocalStorage.setItem(dateKey, JSON.stringify(tasks));
  
  // Fire and forget sync to avoid blocking UI
  syncDailyNote(date, tasks).catch(e => console.error("Background sync failed", e));
}

export async function createTask(task: Task, date: Date = new Date()): Promise<void> {
  const tasks = await getTasks(date);
  tasks.push(task);
  await saveTasks(date, tasks);
}

export async function updateTask(updatedTask: Task, date: Date = new Date()): Promise<void> {
  const tasks = await getTasks(date);
  const index = tasks.findIndex((t) => t.id === updatedTask.id);
  if (index !== -1) {
    tasks[index] = updatedTask;
    await saveTasks(date, tasks);
  }
}

export async function deleteTask(taskId: string, date: Date = new Date()): Promise<void> {
  const tasks = await getTasks(date);
  const newTasks = tasks.filter((t) => t.id !== taskId);
  await saveTasks(date, newTasks);
}
