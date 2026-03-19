import { Detail, ActionPanel, Action } from "@raycast/api";
import { useEffect, useState } from "react";
import { getUserStats, getProgressBar, getXpRequiredForNextLevel, generateTaskGarden } from "./gamification";
import { getTaskCompletionHistory } from "./utils";
import { UserStats } from "./types";

export default function ViewProfile() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [gardenMarkdown, setGardenMarkdown] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const userStats = await getUserStats();
      const history = await getTaskCompletionHistory();

      const garden = generateTaskGarden(history);

      setStats(userStats);
      setGardenMarkdown(garden);
      setIsLoading(false);
    }
    loadData();
  }, []);

  if (isLoading || !stats) {
    return <Detail isLoading={true} markdown="Loading profile..." />;
  }

  const nextLevelXp = getXpRequiredForNextLevel(stats.level);
  const progressBar = getProgressBar(stats.xp, nextLevelXp, 20);

  const markdown = `
# User Profile

## Level ${stats.level}
${progressBar} ${stats.xp} / ${nextLevelXp} XP

**Current Streak:** ${stats.currentStreak} 🔥

---

## Your Garden (Last 7 Days)
${gardenMarkdown}


`;

  return (
    <Detail
      markdown={markdown}
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.OpenInBrowser
            title="Open GitHub Profile"
            url="https://github.com"
            shortcut={{ modifiers: ["cmd"], key: "g" }}
          />
        </ActionPanel>
      }
    />
  );
}
