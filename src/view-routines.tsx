import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
  confirmAlert,
  Alert,
  Detail,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { Routine, TaskStatus } from "./types";
import { getRoutines, createRoutine, updateRoutine, deleteRoutine, formatDuration, getDateString } from "./utils";
import RoutineForm from "./RoutineForm";
import { v4 as uuidv4 } from "uuid";
import { getUserStats, getXpRequiredForNextLevel, processTaskCompletion } from "./gamification";
import { UserStats } from "./types";

export default function RoutineListView() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const [userStats, setUserStats] = useState<UserStats | null>(null);

  const refreshUserStats = async () => {
    const stats = await getUserStats();
    setUserStats(stats);
  };

  async function loadRoutines() {
    setIsLoading(true);
    const data = await getRoutines();
    setRoutines(data);
    setIsLoading(false);
  }

  useEffect(() => {
    loadRoutines();
    refreshUserStats();
  }, []);

  async function handleCreateRoutine(values: { title: string; description: string; expectedDuration?: number }) {
    try {
      await createRoutine({
        id: uuidv4(),
        title: values.title,
        description: values.description,
        status: "todo",
        expectedDuration: values.expectedDuration,
        createdAt: Date.now(),
      });
      await showToast({ style: Toast.Style.Success, title: "Routine created" });
      loadRoutines();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Failed to create routine", message: String(error) });
    }
  }

  async function handleUpdateRoutine(routine: Routine) {
    await updateRoutine(routine);
    loadRoutines();
  }

  async function handleDeleteRoutine(id: string) {
    if (
      await confirmAlert({
        title: "Delete Routine?",
        primaryAction: {
          title: "Delete",
          style: Alert.ActionStyle.Destructive,
        },
      })
    ) {
      await deleteRoutine(id);
      await showToast({ style: Toast.Style.Success, title: "Routine deleted" });
      loadRoutines();
    }
  }

  const inProgress = routines.filter((r) => r.status === "in-progress");
  const paused = routines.filter((r) => r.status === "paused");
  const waiting = routines.filter((r) => r.status === "waiting-for-review");
  const ready = routines.filter((r) => r.status === "ready-to-merge");
  const todo = routines.filter((r) => r.status === "todo");
  const done = routines.filter((r) => r.status === "done");

  const sections = [
    { title: "In Progress", data: inProgress },
    { title: "Paused", data: paused },
    { title: "Waiting for Review", data: waiting },
    { title: "Ready to Merge", data: ready },
    { title: "To-do", data: todo },
    { title: "Done", data: done },
  ];

  const toggleDetail = () => {
    setIsShowingDetail((prev) => !prev);
  };

  const navTitle = userStats
    ? `Routines | Lvl ${userStats.level} • ${userStats.xp}/${getXpRequiredForNextLevel(userStats.level)} XP 🔥 ${userStats.currentStreak}`
    : `Daily Routines`;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter routines..."
      isShowingDetail={isShowingDetail}
      navigationTitle={navTitle}
    >
      {routines.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No routines found"
          description="Create a daily routine to get started"
          actions={
            <ActionPanel>
              <Action.Push
                title="Create Routine"
                icon={Icon.Plus}
                target={<RoutineForm onSubmit={handleCreateRoutine} />}
              />
            </ActionPanel>
          }
        />
      ) : (
        sections.map(
          (section) =>
            section.data.length > 0 && (
              <List.Section key={section.title} title={section.title} subtitle={`${section.data.length}`}>
                {section.data.map((routine) => (
                  <RoutineItem
                    key={routine.id}
                    routine={routine}
                    onUpdate={handleUpdateRoutine}
                    onDelete={handleDeleteRoutine}
                    isShowingDetail={isShowingDetail}
                    onToggleDetail={toggleDetail}
                    onStatsChange={refreshUserStats}
                  />
                ))}
              </List.Section>
            ),
        )
      )}
      <List.Section title="Actions">
        <List.Item
          title="Add New Routine"
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action.Push
                title="Create Routine"
                icon={Icon.Plus}
                target={<RoutineForm onSubmit={handleCreateRoutine} />}
              />
            </ActionPanel>
          }
        />
      </List.Section>
    </List>
  );
}

function RoutineItem({
  routine,
  onUpdate,
  onDelete,
  isShowingDetail,
  onToggleDetail,
  onStatsChange,
}: {
  routine: Routine;
  onUpdate: (r: Routine) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  isShowingDetail: boolean;
  onToggleDetail: () => void;
  onStatsChange: () => void;
}) {
  async function handleToggleStatus() {
    let newStatus: TaskStatus = "done";
    if (routine.status === "done") newStatus = "todo";
    else if (routine.status === "todo") newStatus = "in-progress";
    else if (routine.status === "in-progress") newStatus = "done";
    else if (routine.status === "paused") newStatus = "in-progress";

    if (newStatus === "done" && routine.status !== "done") {
      const { xpAwarded } = await processTaskCompletion(routine, "routine");
      if (xpAwarded) {
        await onUpdate({ ...routine, status: newStatus, lastXpAwardedDate: getDateString(new Date()) });
        onStatsChange(); //  lgtm [nopreview]
        return;
      }
    }

    await onUpdate({ ...routine, status: newStatus });
  }

  async function handleSetStatus(status: TaskStatus) {
    if (status === "done" && routine.status !== "done") {
      const { xpAwarded } = await processTaskCompletion(routine, "routine");
      if (xpAwarded) {
        await onUpdate({ ...routine, status, lastXpAwardedDate: getDateString(new Date()) });
        onStatsChange();
        return;
      }
    }
    await onUpdate({ ...routine, status });
  }

  const accessories: List.Item.Accessory[] = [];
  if (routine.expectedDuration) {
    accessories.push({
      icon: Icon.Stopwatch,
      tag: { value: formatDuration(routine.expectedDuration), color: Color.SecondaryText },
      tooltip: "Expected Duration",
    });
  }

  const icon =
    routine.status === "done"
      ? { source: Icon.CheckCircle, tintColor: Color.Green }
      : routine.status === "paused"
        ? { source: Icon.Pause, tintColor: Color.Yellow }
        : routine.status === "in-progress"
          ? { source: Icon.CircleProgress50, tintColor: Color.Blue }
          : { source: Icon.Circle };

  return (
    <List.Item
      title={routine.title}
      icon={icon}
      accessories={!isShowingDetail ? accessories : undefined}
      detail={
        <List.Item.Detail markdown={`# ${routine.title}\n\n${(routine.description || "").replace(/\n/g, "  \n")}`} />
      }
      actions={
        <ActionPanel>
          <Action title="Toggle Status" icon={Icon.Circle} onAction={handleToggleStatus} />
          <Action
            title={isShowingDetail ? "Close Side View" : "Show Side View"}
            icon={Icon.Sidebar}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            onAction={onToggleDetail}
          />
          <Action.Push
            title="Show Full Details"
            icon={Icon.Eye}
            shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
            target={<RoutineDetail routine={routine} onUpdate={onUpdate} onDelete={onDelete} />}
          />
          <Action
            title="Start Routine"
            icon={Icon.Play}
            shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
            onAction={() => handleSetStatus("in-progress")}
          />
          <Action
            title="Pause Routine"
            icon={Icon.Pause}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={() => handleSetStatus("paused")}
          />
          <ActionPanel.Submenu title="Change Status" icon={Icon.Pencil}>
            <Action title="In Progress" onAction={() => handleSetStatus("in-progress")} />
            <Action title="Paused" onAction={() => handleSetStatus("paused")} />
            <Action title="Done" onAction={() => handleSetStatus("done")} />
            <Action title="To-Do" onAction={() => handleSetStatus("todo")} />
          </ActionPanel.Submenu>
          <Action.Push
            title="Edit Routine"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "i" }}
            target={
              <RoutineForm
                initialValues={{
                  title: routine.title,
                  description: routine.description,
                  expectedDuration: routine.expectedDuration,
                }}
                submitTitle="Update Routine"
                onSubmit={async (values) => {
                  await onUpdate({ ...routine, ...values });
                  await showToast({ style: Toast.Style.Success, title: "Routine updated" });
                }}
              />
            }
          />
          <Action
            title="Delete Routine"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={() => onDelete(routine.id)}
          />
        </ActionPanel>
      }
    />
  );
}

function RoutineDetail({
  routine: initialRoutine,
  onUpdate,
  onDelete,
}: {
  routine: Routine;
  onUpdate: (r: Routine) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [routine, setRoutine] = useState(initialRoutine);
  const { pop } = useNavigation();

  // Sync local state if prop changes
  useEffect(() => {
    setRoutine(initialRoutine);
  }, [initialRoutine]);

  async function handleSetStatus(status: TaskStatus) {
    const updatedRoutine = { ...routine, status };
    setRoutine(updatedRoutine);
    await onUpdate(updatedRoutine);
  }

  async function handleToggleStatus() {
    let newStatus: TaskStatus = "done";
    if (routine.status === "done") newStatus = "todo";
    else if (routine.status === "todo") newStatus = "in-progress";
    else if (routine.status === "in-progress") newStatus = "done";
    else if (routine.status === "paused") newStatus = "in-progress";

    await handleSetStatus(newStatus);
  }

  // Ensure newlines are treated as line breaks in markdown
  const processedDescription = (routine.description || "").replace(/\n/g, "  \n");
  const markdownContent = `# ${routine.title}\n\n${processedDescription}`;
  console.log("Markdown content:", markdownContent);

  return (
    <Detail
      markdown={markdownContent}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
              text={routine.status.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
              color={
                routine.status === "done"
                  ? Color.Green
                  : routine.status === "paused"
                    ? Color.Yellow
                    : routine.status === "in-progress"
                      ? Color.Blue
                      : Color.SecondaryText
              }
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Created" text={new Date(routine.createdAt).toLocaleString()} />
          {routine.expectedDuration && (
            <Detail.Metadata.Label title="Expected Duration" text={formatDuration(routine.expectedDuration)} />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title={routine.status === "done" ? "Mark as Undone" : "Mark as Done"}
            icon={Icon.CheckCircle}
            onAction={handleToggleStatus}
          />
          <Action
            title="Start Routine"
            icon={Icon.Play}
            shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
            onAction={() => handleSetStatus("in-progress")}
          />
          <Action
            title="Pause Routine"
            icon={Icon.Pause}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={() => handleSetStatus("paused")}
          />
          <Action.Push
            title="Edit Routine"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "i" }}
            target={
              <RoutineForm
                initialValues={{
                  title: routine.title,
                  description: routine.description,
                  expectedDuration: routine.expectedDuration,
                }}
                submitTitle="Update Routine"
                onSubmit={async (values) => {
                  const updated = { ...routine, ...values };
                  setRoutine(updated);
                  await onUpdate(updated);
                  await showToast({ style: Toast.Style.Success, title: "Routine updated" });
                }}
              />
            }
          />
          <Action
            title="Delete Routine"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={async () => {
              if (
                await confirmAlert({
                  title: "Delete Routine?",
                  primaryAction: {
                    title: "Delete",
                    style: Alert.ActionStyle.Destructive,
                  },
                })
              ) {
                await onDelete(routine.id);
                pop();
              }
            }}
          />
        </ActionPanel>
      }
    />
  );
}
