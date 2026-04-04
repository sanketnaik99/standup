import { LocalStorage, showToast, Toast, confirmAlert, Alert } from "@raycast/api";
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
        xp += 100;
    } else if (task.priority === "high") {
        xp += 200;
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

export function getProgressBar(currentXp: number, nextLevelXp: number, length = 10): string {
    const progress = Math.min(Math.max(currentXp / nextLevelXp, 0), 1);
    const filledLength = Math.round(length * progress);
    const emptyLength = length - filledLength;

    // using clean blocks
    const filled = "█".repeat(filledLength);
    const empty = "□".repeat(emptyLength);

    return `${filled}${empty}`;
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

const BONUS_DROP_CHANCE = 0.3;
const BONUS_XP_AMOUNT = 300;

export async function processTaskCompletion(
    task: Task | Routine,
    type: "task" | "routine",
): Promise<{ stats: UserStats; xpAwarded: boolean; leveledUp?: boolean; bonusXp?: number }> {
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

    let xp = type === "task" ? calculateTaskXp(task as Task) : calculateRoutineXp(task as Routine);

    // Check for random bonus drop
    let bonusXp = 0;
    if (Math.random() < BONUS_DROP_CHANCE) {
        bonusXp = BONUS_XP_AMOUNT;
        xp += bonusXp;
    }

    const { stats, leveledUp } = await addXp(xp);

    if (leveledUp) {
        // Level up toast removed, handled by UI popup
    } else {
        await showToast({
            style: Toast.Style.Success,
            title: `+${xp} XP`,
            message: `Streak: ${stats.currentStreak} 🔥`, //  lgtm [nopreview]
        });
    }

    return { stats, xpAwarded: true, leveledUp, bonusXp: bonusXp > 0 ? bonusXp : undefined };
}

export async function showGamificationAlerts(leveledUp: boolean, bonusXp?: number) {
    if (leveledUp && bonusXp) {
        await confirmAlert({
            title: "🎉 Level Up & Random Drop! 🎁",
            message: `You reached the next level AND found a random drop of ${bonusXp} XP! Outstanding!`,
            primaryAction: { title: "Let's Go!" },
            dismissAction: { title: "Close" },
        });
    } else if (leveledUp) {
        await confirmAlert({
            title: "🎉 Level Up!",
            message: `You reached the next level! Keep up the great work!`,
            primaryAction: { title: "Let's Go!" },
            dismissAction: { title: "Close" },
        });
    } else if (bonusXp) {
        await confirmAlert({
            title: "Random Drop! 🎁",
            message: `You found a random XP drop of ${bonusXp} XP!`,
            primaryAction: { title: "Awesome!" },
            dismissAction: { title: "Close" },
        });
    }
}

export function generateTaskGarden(history: Record<string, number>): string {
    const today = new Date();
    const days: { label: string; plant: string; count: number }[] = [];

    // Last 7 days for the garden
    for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = getDateString(date);
        const count = history[dateStr] || 0;

        let plant = "🪨"; // Rock/Empty
        if (count > 0) {
            if (count < 5) plant = "🌱";
            else if (count < 10) plant = "🌿";
            else if (count < 15) plant = "🌳";
            else plant = "🍎";
        }

        const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
        const dayNum = date.getDate().toString();

        days.push({ label: `${dayName} ${dayNum}`, plant, count });
    }

    // Build Markdown Table
    const headerRow = `| ${days.map((d) => d.label).join(" | ")} |`;
    const separatorRow = `| ${days.map(() => ":---:").join(" | ")} |`;
    const plantRow = `| ${days.map((d) => d.plant).join(" | ")} |`;
    const countRow = `| ${days.map((d) => d.count).join(" | ")} |`;

    return [headerRow, separatorRow, plantRow, countRow].join("\n");
}
