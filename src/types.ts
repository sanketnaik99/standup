export interface Task {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  github?: GithubMetadata;
  deadline?: number | null;
  expectedDuration?: number; // in minutes
  xpAwarded?: boolean;
}

export type TaskWithDate = Task & { date: string };

export type PRReviewState = "approved" | "changes_requested" | "pending_review";

export interface LinkedPR {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "CLOSED" | "MERGED";
  reviewState?: PRReviewState;
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
  reviewState?: PRReviewState;
}

export type TaskStatus = "todo" | "in-progress" | "paused" | "done" | "waiting-for-review" | "ready-to-merge";

export type TaskPriority = "low" | "medium" | "high";

export interface Routine {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  createdAt: number;
  expectedDuration?: number; // in minutes
  lastXpAwardedDate?: string; // YYYY-MM-DD
}

export interface UserStats {
  xp: number;
  level: number;
  currentStreak: number;
  lastCompletedDate: string | null; // YYYY-MM-DD
}
