export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
}

export type TaskStatus = "todo" | "in-progress" | "paused" | "done";

export type TaskPriority = "low" | "medium" | "high";
