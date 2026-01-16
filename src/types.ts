export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  github?: GithubMetadata;
}

export interface GithubMetadata {
  url: string;
  number: number;
  repo: string;
  owner: string;
  state: string;
  title: string;
  type: "issue" | "pull_request";
}

export type TaskStatus = "todo" | "in-progress" | "paused" | "done";

export type TaskPriority = "low" | "medium" | "high";
