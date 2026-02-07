import { LocalStorage, showToast, Toast } from "@raycast/api";
import { Routine, Task, UserStats } from "./types";
import { getDateString } from "./utils";

const USER_STATS_KEY = "user_stats";

export async function getUserStats(): Promise<UserStats> {
    const data = await LocalStorage.getItem<string>(USER_STATS_KEY);
    if (data) {
        try {
            return JSON.parse(data);
        } catch {
            // ignore
        }
    }
    return {
        xp: 0,
        level: 1,
        currentStreak: 0,
        lastCompletedDate: null,
    };
}

export async function saveUserStats(stats: UserStats): Promise<void> {
    await LocalStorage.setItem(USER_STATS_KEY, JSON.stringify(stats));
}

// XP Required for next level = Level * 500
export function getXpRequiredForNextLevel(level: number): number {
    return level * 500;
}

export function calculateTaskXp(task: Task): number {
    let xp = 50; // Base XP

    // Duration Bonus: 1 XP per minute
    if (task.expectedDuration) {
        xp += task.expectedDuration;
    }

    // Priority Bonus
    if (task.priority === "medium") {
        xp += 50;
    } else if (task.priority === "high") {
        xp += 100;
    }

    return xp;
}

export function calculateRoutineXp(routine: Routine): number {
    let xp = 100; // Base XP

    // Duration Bonus: 1 XP per minute
    if (routine.expectedDuration) {
        xp += routine.expectedDuration;
    }

    return xp;
}

export async function addXp(amount: number): Promise<{ stats: UserStats; leveledUp: boolean }> {
    const stats = await getUserStats();
    stats.xp += amount;

    let leveledUp = false;
    let nextLevelXp = getXpRequiredForNextLevel(stats.level);

    // Handle multiple level ups if massive XP gain
    while (stats.xp >= nextLevelXp) {
        stats.xp -= nextLevelXp;
        stats.level += 1;
        leveledUp = true;
        nextLevelXp = getXpRequiredForNextLevel(stats.level);
    }

    // Update streak based on today
    const todayStr = getDateString(new Date());
    if (stats.lastCompletedDate !== todayStr) {
        // Check if yesterday was completed for streak continuity
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getDateString(yesterday);

        if (stats.lastCompletedDate === yesterdayStr) {
            stats.currentStreak += 1;
        } else {
            // Reset streak if we missed a day (unless it's the first time or same day)
            // If last completed date is null, it's 1.
            // If last completed date is older than yesterday, it resets to 1.
            stats.currentStreak = 1;
        }
        stats.lastCompletedDate = todayStr;
    }

    await saveUserStats(stats);
    return { stats, leveledUp };
}

export async function processTaskCompletion(
    task: Task | Routine,
    type: "task" | "routine",
): Promise<{ stats: UserStats; xpAwarded: boolean }> {
    // XP Validation Logic
    if (type === "task") {
        const t = task as Task;
        if (t.xpAwarded) {
            return { stats: await getUserStats(), xpAwarded: false };
        }
    } else {
        const r = task as Routine;
        const today = getDateString(new Date());
        if (r.lastXpAwardedDate === today) {
            return { stats: await getUserStats(), xpAwarded: false };
        }
    }

    const xp = type === "task" ? calculateTaskXp(task as Task) : calculateRoutineXp(task as Routine);
    const { stats, leveledUp } = await addXp(xp);

    if (leveledUp) {
        await showToast({
            style: Toast.Style.Success,
            title: "🎉 Level Up!",
            message: `You are now Level ${stats.level}!`,
        });
    } else {
        await showToast({
            style: Toast.Style.Success,
            title: `+${xp} XP`,
            message: `Streak: ${stats.currentStreak} 🔥`, //  lgtm [nopreview]
        });
    }

    return { stats, xpAwarded: true };
}
