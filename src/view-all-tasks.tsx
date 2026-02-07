import { Action, ActionPanel, Color, Icon, List, showToast, Toast } from "@raycast/api";
import TaskListView, { TaskDetail } from "./TaskListView";
import { useEffect, useState } from "react";
import { TaskWithDate } from "./types";
import {
  DEFAULT_PROFILE,
  formatDuration,
  getAllUndoneTasks,
  sortTasks,
  createTask,
  deleteTask,
  getDateString,
  migrateAllTasksToToday,
} from "./utils";

export default function ViewAllTasks() {
  const [isLoading, setIsLoading] = useState(true);
  const [tasksByProfile, setTasksByProfile] = useState<Record<string, TaskWithDate[]>>({});
  const [undoStack, setUndoStack] = useState<
    { task: TaskWithDate; sourceDate: string; targetDate: string; profile: string }[]
  >([]);
  const [isShowingDetail, setIsShowingDetail] = useState(false);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      await migrateAllTasksToToday();
      const data = await getAllUndoneTasks();
      setTasksByProfile(data);
      setIsLoading(false);
    }
    load();
  }, []);

  const handlePushToNextDay = async (task: TaskWithDate, profile: string) => {
    const sourceDateStr = task.date;
    const [y, m, d] = sourceDateStr.split("-").map(Number);
    const sourceDate = new Date(y, m - 1, d);

    const targetDate = new Date(sourceDate);
    targetDate.setDate(targetDate.getDate() + 1);
    const targetDateStr = getDateString(targetDate);

    // Optimistic update
    const updatedTasksByProfile = { ...tasksByProfile };
    if (updatedTasksByProfile[profile]) {
      const idx = updatedTasksByProfile[profile].findIndex((t) => t.id === task.id);
      if (idx !== -1) {
        updatedTasksByProfile[profile] = [
          ...updatedTasksByProfile[profile].slice(0, idx),
          { ...task, date: targetDateStr },
          ...updatedTasksByProfile[profile].slice(idx + 1),
        ];
      }
    }
    setTasksByProfile(updatedTasksByProfile);
    setUndoStack((prev) => [...prev, { task, sourceDate: sourceDateStr, targetDate: targetDateStr, profile }]);

    try {
      await deleteTask(task.id, sourceDate, profile);
      await createTask(task, targetDate, profile);
      await showToast({ style: Toast.Style.Success, title: "Task pushed to next day" });
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to push task", message: String(error) });
      // Revert optimistic update? For now assume success or redo via undo
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastOp = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));

    const { task, sourceDate: originalDateStr, targetDate: movedDateStr, profile } = lastOp;

    const [y, m, d] = movedDateStr.split("-").map(Number);
    const movedDate = new Date(y, m - 1, d);

    const [oy, om, od] = originalDateStr.split("-").map(Number);
    const originalDate = new Date(oy, om - 1, od);

    // Optimistic update
    setTasksByProfile((prev) => {
      const newMap = { ...prev };
      if (newMap[profile]) {
        const idx = newMap[profile].findIndex((t) => t.id === task.id);
        if (idx !== -1) {
          newMap[profile] = [
            ...newMap[profile].slice(0, idx),
            { ...task, date: originalDateStr },
            ...newMap[profile].slice(idx + 1),
          ];
        } else {
          newMap[profile] = [...newMap[profile], { ...task, date: originalDateStr }];
        }
      }
      return newMap;
    });

    try {
      await deleteTask(task.id, movedDate, profile);
      await createTask(task, originalDate, profile);
      await showToast({ style: Toast.Style.Success, title: "Undone: Task moved back" });
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to undo", message: String(error) });
    }
  };

  const getSortedProfiles = () => {
    const profiles = Object.keys(tasksByProfile);
    return profiles.sort((a, b) => {
      if (a === DEFAULT_PROFILE) return -1;
      if (b === DEFAULT_PROFILE) return 1;
      return a.localeCompare(b);
    });
  };

  const getSortedTasksForProfile = (profile: string) => {
    const tasks = tasksByProfile[profile] || [];
    const todayStr = getDateString(new Date());
    const visibleTasks = tasks.filter((t) => t.date <= todayStr);

    // Buckets
    const inProgress = sortTasks(visibleTasks.filter((t) => t.status === "in-progress"));
    const paused = sortTasks(visibleTasks.filter((t) => t.status === "paused"));
    const waiting = sortTasks(visibleTasks.filter((t) => t.status === "waiting-for-review"));
    const ready = sortTasks(visibleTasks.filter((t) => t.status === "ready-to-merge"));
    const todo = sortTasks(visibleTasks.filter((t) => t.status === "todo"));

    return [...inProgress, ...paused, ...waiting, ...ready, ...todo];
  };

  const toggleDetail = () => {
    setIsShowingDetail((prev) => !prev);
  };

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter tasks..." isShowingDetail={isShowingDetail}>
      {getSortedProfiles().map((profile) => {
        const sortedTasks = getSortedTasksForProfile(profile);
        if (sortedTasks.length === 0) return null;

        return (
          <List.Section key={profile} title={profile} subtitle={`${sortedTasks.length} tasks`}>
            {sortedTasks.map((task) => (
              <ReadOnlyTaskItem
                key={task.id}
                task={task}
                profile={profile}
                onPushToNextDay={() => handlePushToNextDay(task, profile)}
                onUndo={undoStack.length > 0 ? handleUndo : undefined}
                isShowingDetail={isShowingDetail}
                onToggleDetail={toggleDetail}
              />
            ))}
          </List.Section>
        );
      })}
      {!isLoading && Object.keys(tasksByProfile).length === 0 && (
        <List.EmptyView title="No incomplete tasks found across any profile." />
      )}
    </List>
  );
}

function ReadOnlyTaskItem({
  task,
  profile,
  onPushToNextDay,
  onUndo,
  isShowingDetail,
  onToggleDetail,
}: {
  task: TaskWithDate;
  profile: string;
  onPushToNextDay?: () => void;
  onUndo?: () => void;
  isShowingDetail: boolean;
  onToggleDetail: () => void;
}) {
  const priorityColor = task.priority === "high" ? Color.Red : task.priority === "medium" ? Color.Orange : Color.Green;

  const icon =
    task.status === "done"
      ? { source: Icon.CheckCircle, tintColor: Color.Green }
      : task.status === "paused"
        ? { source: Icon.Pause, tintColor: Color.Yellow }
        : task.status === "in-progress"
          ? { source: Icon.CircleProgress50, tintColor: Color.Blue }
          : task.status === "waiting-for-review"
            ? { source: Icon.Eye, tintColor: Color.Magenta }
            : task.status === "ready-to-merge"
              ? { source: Icon.Checkmark, tintColor: Color.Orange }
              : { source: Icon.Circle };

  const accessories: List.Item.Accessory[] = [{ tag: { value: task.priority, color: priorityColor } }];
  if (task.expectedDuration) {
    accessories.unshift({
      icon: Icon.Stopwatch,
      tag: { value: formatDuration(task.expectedDuration), color: Color.SecondaryText },
      tooltip: "Expected Duration",
    });
  }

  if (task.github) {
    let stateColor = Color.Green;
    if (task.github.state === "closed") stateColor = Color.Red;
    if (task.github.state === "merged") stateColor = Color.Purple;
    if (task.github.state === "changes_requested") stateColor = Color.Orange;

    if (task.github.linkedPRs && task.github.linkedPRs.length > 0) {
      for (const pr of task.github.linkedPRs) {
        let prColor = Color.Green;
        if (pr.state === "CLOSED") prColor = Color.Red;
        if (pr.state === "MERGED") prColor = Color.Purple;
        if (pr.state === "OPEN" && pr.reviewState === "changes_requested") prColor = Color.Orange;
        if (pr.state === "OPEN" && pr.reviewState === "approved") prColor = Color.Green;
        if (pr.state === "OPEN" && pr.reviewState === "pending_review") prColor = Color.Yellow;

        accessories.unshift({
          icon: { source: "pull-request-icon.svg", tintColor: prColor },
          tag: { value: `#${pr.number}`, color: prColor },
          tooltip: `Linked PR: ${pr.title}`,
        });
      }
    }

    const isIssue = task.github.type === "issue";
    accessories.unshift({
      icon: { source: isIssue ? "issue-icon.svg" : "pull-request-icon.svg", tintColor: stateColor },
      tag: { value: `#${task.github.number}`, color: stateColor },
      tooltip: `GitHub ${isIssue ? "Issue" : "PR"}: ${task.github.state.replace(/_/g, " ")}`,
    });
  }

  const detailMetadata = (
    <List.Item.Detail.Metadata>
      <List.Item.Detail.Metadata.TagList title="Status">
        <List.Item.Detail.Metadata.TagList.Item
          text={
            task.status === "in-progress"
              ? "In Progress"
              : task.status.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
          }
          color={
            task.status === "done"
              ? Color.Green
              : task.status === "paused"
                ? Color.Yellow
                : task.status === "in-progress"
                  ? Color.Blue
                  : task.status === "waiting-for-review"
                    ? Color.Magenta
                    : task.status === "ready-to-merge"
                      ? Color.Orange
                      : Color.SecondaryText
          }
        />
      </List.Item.Detail.Metadata.TagList>
      <List.Item.Detail.Metadata.TagList title="Priority">
        <List.Item.Detail.Metadata.TagList.Item
          text={task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
          color={task.priority === "high" ? Color.Red : task.priority === "medium" ? Color.Orange : Color.Green}
        />
      </List.Item.Detail.Metadata.TagList>
      <List.Item.Detail.Metadata.Label title="Created" text={new Date(task.createdAt).toLocaleString()} />
      {task.github && (
        <>
          <List.Item.Detail.Metadata.Separator />
          <List.Item.Detail.Metadata.Label title="GitHub" text={`#${task.github.number}`} />
          <List.Item.Detail.Metadata.TagList title="State">
            <List.Item.Detail.Metadata.TagList.Item
              text={task.github.state.replace(/_/g, " ")}
              color={
                task.github.state === "merged"
                  ? Color.Purple
                  : task.github.state === "changes_requested"
                    ? Color.Orange
                    : task.github.state === "closed"
                      ? Color.Red
                      : Color.Green
              }
            />
          </List.Item.Detail.Metadata.TagList>
          <List.Item.Detail.Metadata.Link title="Link" target={task.github.url} text="Open" />
          {task.github.linkedPRs && task.github.linkedPRs.length > 0 && (
            <>
              <List.Item.Detail.Metadata.Separator />
              <List.Item.Detail.Metadata.Label title="Linked PRs" text={`${task.github.linkedPRs.length} PR(s)`} />
              {task.github.linkedPRs.map((pr) => (
                <List.Item.Detail.Metadata.Link
                  key={pr.number}
                  title={`PR #${pr.number}`}
                  target={pr.url}
                  text={`${pr.title} (${pr.state.toLowerCase()})`}
                />
              ))}
            </>
          )}
        </>
      )}
      {task.deadline && (
        <List.Item.Detail.Metadata.Label title="Deadline" text={new Date(task.deadline).toLocaleDateString()} />
      )}
      {task.expectedDuration && (
        <List.Item.Detail.Metadata.Label title="Expected Duration" text={formatDuration(task.expectedDuration)} />
      )}
    </List.Item.Detail.Metadata>
  );

  return (
    <List.Item
      title={task.title}
      icon={icon}
      accessories={
        !isShowingDetail
          ? [
              ...(task.deadline ? [{ icon: Icon.Calendar, date: new Date(task.deadline), tooltip: "Deadline" }] : []),
              ...accessories,
            ]
          : undefined
      }
      detail={<List.Item.Detail markdown={`# ${task.title}\n\n${task.description}`} metadata={detailMetadata} />}
      actions={
        <ActionPanel>
          <Action
            title={isShowingDetail ? "Close Side View" : "Show Side View"}
            icon={Icon.Sidebar}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={onToggleDetail}
          />
          <Action.Push
            title="Show Full Details"
            icon={Icon.Eye}
            target={
              <TaskDetail
                task={task}
                date={new Date()}
                selectedProfile={profile}
                isDefaultProfile={profile === DEFAULT_PROFILE}
              />
            }
          />
          {onPushToNextDay && (
            <Action
              title="Push to Next Day"
              icon={Icon.ArrowRight}
              shortcut={{ modifiers: ["opt"], key: "enter" }}
              onAction={onPushToNextDay}
            />
          )}
          <Action.Push
            title="Go to Profile View"
            icon={Icon.List}
            shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
            target={<TaskListView date={new Date()} initialProfile={profile} />}
          />
          {task.github && (
            <Action.OpenInBrowser
              url={task.github.url}
              title="Open in GitHub"
              shortcut={{ modifiers: ["opt"], key: "enter" }}
            />
          )}
          <Action.CopyToClipboard content={task.title} title="Copy Title" />
          {onUndo && (
            <Action title="Undo" icon={Icon.Undo} shortcut={{ modifiers: ["cmd"], key: "z" }} onAction={onUndo} />
          )}
        </ActionPanel>
      }
    />
  );
}
