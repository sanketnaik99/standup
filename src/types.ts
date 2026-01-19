export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  github?: GithubMetadata;
  deadline?: number | null;
}

export interface LinkedPR {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
}

export interface GithubMetadata {
  url: string;
  number: number;
  repo: string;
  owner: string;
  state: string;
  title: string;
  type: "issue" | "pull_request";
  linkedPRs?: LinkedPR[];
}

export type TaskStatus = "todo" | "in-progress" | "paused" | "done";

export type TaskPriority = "low" | "medium" | "high";
