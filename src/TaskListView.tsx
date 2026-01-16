import { Action, ActionPanel, Color, Detail, Icon, List, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { Task, TaskPriority, TaskStatus } from "./types";
import { deleteTask, getDateString, getTasks, updateTask, createTask } from "./utils";
import TaskForm from "./TaskForm";
import { v4 as uuidv4 } from "uuid";

interface TaskListViewProps {
  date: Date;
}

export default function TaskListView({ date }: TaskListViewProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [date]);

  async function loadTasks() {
    setIsLoading(true);
    const loadedTasks = await getTasks(date);
    setTasks(loadedTasks);
    setIsLoading(false);
  }

  const priorityOrder = { high: 3, medium: 2, low: 1 };
  const sortTasks = (taskList: Task[]) => {
    return [...taskList].sort((a, b) => {
      if (a.deadline && !b.deadline) return -1;
      if (!a.deadline && b.deadline) return 1;
      if (a.deadline && b.deadline) return a.deadline - b.deadline;
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  };

  const inProgressTasks = sortTasks(tasks.filter((t) => t.status === "in-progress"));
  const pausedTasks = sortTasks(tasks.filter((t) => t.status === "paused"));
  const todoTasks = sortTasks(tasks.filter((t) => t.status === "todo"));
  const doneTasks = sortTasks(tasks.filter((t) => t.status === "done"));

  async function handleCreateTask(values: { 
    title: string; 
    description: string; 
    priority: string; 
    github?: import("./types").GithubMetadata;
    deadline?: Date | null;
  }) {
     try {
       await createTask({
         id: uuidv4(),
         title: values.title,
         description: values.description,
         priority: values.priority as TaskPriority,
         status: "todo",
         createdAt: Date.now(),
         github: values.github,
         deadline: values.deadline ? values.deadline.getTime() : null,
       }, date);
       await showToast({ style: Toast.Style.Success, title: "Task added" });
       loadTasks();
     } catch (error) {
       await showToast({ style: Toast.Style.Failure, title: "Failed to create task", message: String(error) });
     }
  }


  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Filter tasks..."
      navigationTitle={`Tasks for ${getDateString(date)}`}
      actions={
        <ActionPanel>
          <Action.Push
            title="Add New Task"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={<TaskForm submitTitle="Create Task" onSubmit={handleCreateTask} />}
          />
        </ActionPanel>
      }
    >
      <List.Section title="In Progress" subtitle={`${inProgressTasks.length}`}>
        {inProgressTasks.map((task) => (
          <TaskItem key={task.id} task={task} date={date} onUpdate={loadTasks} onCreate={handleCreateTask} />
        ))}
      </List.Section>
      <List.Section title="Paused" subtitle={`${pausedTasks.length}`}>
        {pausedTasks.map((task) => (
          <TaskItem key={task.id} task={task} date={date} onUpdate={loadTasks} onCreate={handleCreateTask} />
        ))}
      </List.Section>
      <List.Section title="To-do" subtitle={`${todoTasks.length}`}>
        {todoTasks.map((task) => (
          <TaskItem key={task.id} task={task} date={date} onUpdate={loadTasks} onCreate={handleCreateTask} />
        ))}
      </List.Section>
      <List.Section title="Done" subtitle={`${doneTasks.length}`}>
        {doneTasks.map((task) => (
          <TaskItem key={task.id} task={task} date={date} onUpdate={loadTasks} onCreate={handleCreateTask} />
        ))}
      </List.Section>
      <List.EmptyView
        title="No tasks for this day"
        description="Press Cmd+N to add a task"
        actions={
          <ActionPanel>
            <Action.Push
              title="Add New Task"
              icon={Icon.Plus}
              shortcut={{ modifiers: ["cmd"], key: "n" }}
              target={<TaskForm submitTitle="Create Task" onSubmit={handleCreateTask} />}
            />
          </ActionPanel>
        }
      />
    </List>
  );
}

function TaskItem({
  task,
  date,
  onUpdate,
  onCreate,
}: {
  task: Task;
  date: Date;
  onUpdate: () => void;
  onCreate: (values: { title: string; description: string; priority: string; deadline?: Date | null }) => Promise<void>;
}) {
  async function handleToggleStatus() {
    let newStatus: TaskStatus = "done";
    if (task.status === "done") newStatus = "todo";
    else if (task.status === "todo") newStatus = "done";
    else if (task.status === "paused") newStatus = "in-progress";
    else if (task.status === "in-progress") newStatus = "done";

    await updateTask({ ...task, status: newStatus }, date);
    onUpdate();
  }

  async function handleSetStatus(status: TaskStatus) {
    await updateTask({ ...task, status }, date);
    onUpdate();
  }

  async function handleDelete() {
    await deleteTask(task.id, date);
    onUpdate();
  }

  const priorityColor = task.priority === "high" ? Color.Red : task.priority === "medium" ? Color.Orange : Color.Green;

  const icon =
    task.status === "done"
      ? { source: Icon.CheckCircle, tintColor: Color.Green }
      : task.status === "paused"
        ? { source: Icon.Pause, tintColor: Color.Yellow }
        : task.status === "in-progress"
          ? { source: Icon.CircleProgress50, tintColor: Color.Blue }
          : { source: Icon.Circle };

  const accessories: List.Item.Accessory[] = [
    { tag: { value: task.priority, color: priorityColor } },
  ];

  if (task.github) {
    let stateColor = Color.Green;
    if (task.github.state === "closed") stateColor = Color.Red;
    if (task.github.state === "merged") stateColor = Color.Purple;

    accessories.unshift({
        icon: { source: "github-mark.png", tintColor: Color.PrimaryText }, // using built-in icon if available or just text
        tag: { value: `#${task.github.number}`, color: stateColor },
        tooltip: `GitHub ${task.github.type === 'pull_request' ? 'PR' : 'Issue'}: ${task.github.state}`
    });
  }

  return (
    <List.Item
      title={task.title}
      icon={icon}
      accessories={[
        ...(task.deadline ? [{ date: new Date(task.deadline), tooltip: "Deadline" }] : []),
        ...accessories
      ]}
      actions={
        <ActionPanel>
          {task.github && <Action.OpenInBrowser url={task.github.url} title="Open in GitHub" shortcut={{ modifiers: ["opt"], key: "enter" }} />}
          <Action title={task.status === "done" ? "Mark as Undone" : "Mark as Done"} icon={Icon.CheckCircle} onAction={handleToggleStatus} />
          <Action.Push
            title="Show Details"
            icon={Icon.Sidebar}
            shortcut={{ modifiers: ["cmd"], key: "return" }}
            target={<TaskDetail task={task} date={date} onUpdate={onUpdate} />}
          />
          <Action.Push
            title="Show Details"
            icon={Icon.Sidebar}
            shortcut={{ modifiers: ["cmd"], key: "arrowRight" }}
            target={<TaskDetail task={task} date={date} onUpdate={onUpdate} />}
          />
          <Action.Push
            title="Edit Task"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "i" }}
            target={
              <TaskForm
                initialValues={{
                  title: task.title,
                  description: task.description,
                  priority: task.priority,
                  deadline: task.deadline ? new Date(task.deadline) : null,
                }}
                submitTitle="Update Task"
                onSubmit={async (values) => {
                  await updateTask(
                    {
                      ...task,
                      ...values,
                      priority: values.priority as TaskPriority,
                      deadline: values.deadline ? values.deadline.getTime() : null,
                    },
                    date,
                  );
                  await showToast({ style: Toast.Style.Success, title: "Task updated" });
                  onUpdate();
                }}
              />
            }
          />
          <Action
            title="Pause Task"
            icon={Icon.Pause}
            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
            onAction={() => handleSetStatus("paused")}
          />
          <Action
            title="Start Task"
            icon={Icon.Play}
            shortcut={{ modifiers: ["cmd", "shift"], key: "s" }}
            onAction={() => handleSetStatus("in-progress")}
          />
          <ActionPanel.Submenu title="Change Status" icon={Icon.Pencil}>
            <Action title="In Progress" onAction={() => handleSetStatus("in-progress")} />
            <Action title="To-Do" onAction={() => handleSetStatus("todo")} />
            <Action title="Paused" onAction={() => handleSetStatus("paused")} />
            <Action title="Done" onAction={() => handleSetStatus("done")} />
          </ActionPanel.Submenu>
          <Action.Push
            title="Add New Task"
            icon={Icon.Plus}
            shortcut={{ modifiers: ["cmd"], key: "n" }}
            target={<TaskForm submitTitle="Create Task" onSubmit={onCreate} />}
          />
          <Action
            title="Delete Task"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={{ modifiers: ["ctrl"], key: "x" }}
            onAction={handleDelete}
          />
        </ActionPanel>
      }
    />
  );
}

function TaskDetail({ task, date, onUpdate }: { task: Task; date: Date; onUpdate: () => void }) {
  return (
    <Detail
      markdown={`# ${task.title}\n\n${task.description}`}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.TagList title="Status">
            <Detail.Metadata.TagList.Item
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
                      : Color.SecondaryText
              }
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.TagList title="Priority">
            <Detail.Metadata.TagList.Item
              text={task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
              color={task.priority === "high" ? Color.Red : task.priority === "medium" ? Color.Orange : Color.Green}
            />
          </Detail.Metadata.TagList>
          <Detail.Metadata.Label title="Created" text={new Date(task.createdAt).toLocaleString()} />
          {task.github && (
            <>
                <Detail.Metadata.Separator />
                <Detail.Metadata.Label title="GitHub" text={`#${task.github.number}`} />
                <Detail.Metadata.Label title="State" text={task.github.state} />
                <Detail.Metadata.Link title="Link" target={task.github.url} text="Open" />
            </>
          )}
          {task.deadline && (
            <Detail.Metadata.Label title="Deadline" text={new Date(task.deadline).toLocaleDateString()} />
          )}

        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action.Push
            title="Edit Task"
            icon={Icon.Pencil}
            shortcut={{ modifiers: ["cmd"], key: "i" }}
            target={
              <TaskForm
                initialValues={{
                  title: task.title,
                  description: task.description,
                  priority: task.priority,
                  deadline: task.deadline ? new Date(task.deadline) : null,
                }}
                submitTitle="Update Task"
                onSubmit={async (values) => {
                  await updateTask(
                    {
                      ...task,
                      ...values,
                      priority: values.priority as TaskPriority,
                      deadline: values.deadline ? values.deadline.getTime() : null,
                    },
                    date,
                  );
                  await showToast({ style: Toast.Style.Success, title: "Task updated" });
                  onUpdate();
                }}
              />
            }
          />
        </ActionPanel>
      }
    />
  );
}
