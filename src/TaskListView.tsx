import {
    Action,
    ActionPanel,
    Color,
    Detail,
    Icon,
    List,
    showToast,
    Toast,
    useNavigation,
    LocalStorage,
    Alert,
    confirmAlert,
} from "@raycast/api";
import { useEffect, useState, useCallback, useRef } from "react";
import { Task, TaskPriority, TaskStatus } from "./types";
import {
    deleteTask,
    getDateString,
    getTasks,
    updateTask,
    createTask,
    migrateTasksToToday,
    saveTasks,
    getProfiles,
    deleteProfile,
    DEFAULT_PROFILE,
} from "./utils";
import TaskForm from "./TaskForm";
import CreateProfileForm from "./CreateProfileForm";
import { v4 as uuidv4 } from "uuid";

interface TaskListViewProps {
    date: Date;
}

export default function TaskListView({ date }: TaskListViewProps) {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selectedProfile, setSelectedProfile] = useState<string>(DEFAULT_PROFILE);
    const [profiles, setProfiles] = useState<string[]>([DEFAULT_PROFILE]);
    const [isLoading, setIsLoading] = useState(true);
    const [undoStack, setUndoStack] = useState<Task[][]>([]);
    const [redoStack, setRedoStack] = useState<Task[][]>([]);
    const [isProfileLoaded, setIsProfileLoaded] = useState(false);
    const tasksRef = useRef<Task[]>([]);

    useEffect(() => {
        async function init() {
            const storedProfiles = await getProfiles();
            setProfiles(storedProfiles);

            const lastProfile = await LocalStorage.getItem<string>("last_profile");
            if (lastProfile && storedProfiles.includes(lastProfile)) {
                setSelectedProfile(lastProfile);
            } else {
                setSelectedProfile(DEFAULT_PROFILE);
            }
            setIsProfileLoaded(true);
        }
        init();
    }, []);

    useEffect(() => {
        loadTasks();
    }, [date, selectedProfile]);

    useEffect(() => {
        tasksRef.current = tasks;
    }, [tasks]);

    useEffect(() => {
        if (isProfileLoaded) {
            LocalStorage.setItem("last_profile", selectedProfile);
        }
    }, [selectedProfile, isProfileLoaded]);

    async function loadTasks() {
        setIsLoading(true);
        if (getDateString(date) === getDateString(new Date())) {
            await migrateTasksToToday(selectedProfile);
        }
        const loadedTasks = await getTasks(date, selectedProfile);
        setTasks(loadedTasks);
        setIsLoading(false);

        // Background refresh
        refreshGithubStatuses(loadedTasks);
    }

    async function refreshGithubStatuses(currentTasks: Task[]) {
        const tasksToRefresh = currentTasks.filter((t) => t.github);
        if (tasksToRefresh.length === 0) return;

        const { fetchGithubDetails } = await import("./github");

        let hasChanges = false;
        const updatedTasks = [...currentTasks];

        await Promise.all(
            tasksToRefresh.map(async (task) => {
                if (!task.github) return;
                const freshDetails = await fetchGithubDetails(task.github.url);
                if (freshDetails && freshDetails.metadata.state !== task.github.state) {
                    const index = updatedTasks.findIndex((t) => t.id === task.id);
                    if (index !== -1) {
                        updatedTasks[index] = { ...updatedTasks[index], github: freshDetails.metadata };
                        hasChanges = true;
                        // Update individual task in storage to be safe, but we'll do a bulk save if possible or just rely on the final state update
                        await updateTask(updatedTasks[index], date, selectedProfile);
                    }
                }
            }),
        );

        if (hasChanges) {
            setTasks(updatedTasks);
        }
    }

    async function handleDeleteProfile() {
        if (selectedProfile === DEFAULT_PROFILE) return;

        if (
            await confirmAlert({
                title: `Delete Profile "${selectedProfile}"?`,
                message: "Tasks will remain in the database but will be hidden. You can restore them by creating a profile with the same name.",
                primaryAction: {
                    title: "Delete",
                    style: Alert.ActionStyle.Destructive,
                },
            })
        ) {
            await deleteProfile(selectedProfile);
            const newProfiles = profiles.filter((p) => p !== selectedProfile);
            setProfiles(newProfiles);
            setSelectedProfile(DEFAULT_PROFILE); // Navigate back to default
            await showToast({ style: Toast.Style.Success, title: "Profile deleted" });
        }
    }

    const pushToUndoStack = useCallback(() => {
        setUndoStack((prev) => [...prev, tasksRef.current]);
        setRedoStack([]); // Clear redo stack on new action
    }, []);

    const handleCreateProfile = (name: string) => {
        setProfiles((prev) => [...prev, name]);
        setSelectedProfile(name);
    };

    async function handleUndo() {
        if (undoStack.length === 0) return;

        const previousTasks = undoStack[undoStack.length - 1];
        const newUndoStack = undoStack.slice(0, -1);

        setRedoStack((prev) => [...prev, tasksRef.current]);
        setUndoStack(newUndoStack);
        setTasks(previousTasks);
        await saveTasks(date, previousTasks, selectedProfile);
        await showToast({ style: Toast.Style.Success, title: "Undone" });
    }

    async function handleRedo() {
        if (redoStack.length === 0) return;

        const nextTasks = redoStack[redoStack.length - 1];
        const newRedoStack = redoStack.slice(0, -1);

        setUndoStack((prev) => [...prev, tasksRef.current]);
        setRedoStack(newRedoStack);
        setTasks(nextTasks);
        await saveTasks(date, nextTasks, selectedProfile);
        await showToast({ style: Toast.Style.Success, title: "Redone" });
    }

    async function handleCreateTaskWrapped(values: {
        title: string;
        description: string;
        priority: string;
        github?: import("./types").GithubMetadata;
        deadline?: Date | null;
    }) {
        pushToUndoStack();
        try {
            await createTask(
                {
                    id: uuidv4(),
                    title: values.title,
                    description: values.description,
                    priority: values.priority as TaskPriority,
                    status: "todo",
                    createdAt: Date.now(),
                    github: values.github,
                    deadline: values.deadline ? values.deadline.getTime() : null,
                },
                date,
                selectedProfile,
            );
            await showToast({ style: Toast.Style.Success, title: "Task added" });
            loadTasks();
        } catch (error) {
            await showToast({ style: Toast.Style.Failure, title: "Failed to create task", message: String(error) });
        }
    }

    async function handleUpdateTaskWrapped(updatedTask: Task) {
        pushToUndoStack();
        await updateTask(updatedTask, date, selectedProfile);
        loadTasks();
    }

    async function handleDeleteTaskWrapped(taskId: string) {
        pushToUndoStack();
        await deleteTask(taskId, date, selectedProfile);
        loadTasks();
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

    return (
        <List
            isLoading={isLoading}
            searchBarPlaceholder="Filter tasks..."
            navigationTitle={`Tasks for ${getDateString(date)}`}
            searchBarAccessory={
                <List.Dropdown
                    tooltip="Select Profile"
                    value={selectedProfile}
                    onChange={(newValue) => setSelectedProfile(newValue)}
                >
                    {profiles.map((profile) => (
                        <List.Dropdown.Item key={profile} title={profile} value={profile} />
                    ))}
                </List.Dropdown>
            }
            actions={
                <ActionPanel>
                    <Action.Push
                        title="Add New Task"
                        icon={Icon.Plus}
                        shortcut={{ modifiers: ["cmd"], key: "n" }}
                        target={<TaskForm submitTitle="Create Task" onSubmit={handleCreateTaskWrapped} />}
                    />
                    {undoStack.length > 0 && (
                        <Action title="Undo" icon={Icon.Undo} shortcut={{ modifiers: ["cmd"], key: "z" }} onAction={handleUndo} />
                    )}
                    {redoStack.length > 0 && (
                        <Action
                            title="Redo"
                            icon={Icon.Redo}
                            shortcut={{ modifiers: ["cmd", "shift"], key: "z" }}
                            onAction={handleRedo}
                        />
                    )}
                    <Action.Push
                        title="Create New Profile"
                        icon={Icon.Person}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                        target={
                            <CreateProfileForm
                                onCreate={handleCreateProfile}
                            />
                        }
                    />
                </ActionPanel>
            }
        >
            <List.Section title="In Progress" subtitle={`${inProgressTasks.length}`}>
                {inProgressTasks.map((task) => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        date={date}
                        onUpdateTask={handleUpdateTaskWrapped}
                        onCreateTask={handleCreateTaskWrapped}
                        onDeleteTask={handleDeleteTaskWrapped}
                        onUndo={undoStack.length > 0 ? handleUndo : undefined}
                        onRedo={redoStack.length > 0 ? handleRedo : undefined}
                        onCreateProfile={handleCreateProfile}
                        onDeleteProfile={handleDeleteProfile}
                        isDefaultProfile={selectedProfile === DEFAULT_PROFILE}
                    />
                ))}
            </List.Section>
            <List.Section title="Paused" subtitle={`${pausedTasks.length}`}>
                {pausedTasks.map((task) => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        date={date}
                        onUpdateTask={handleUpdateTaskWrapped}
                        onCreateTask={handleCreateTaskWrapped}
                        onDeleteTask={handleDeleteTaskWrapped}
                        onUndo={undoStack.length > 0 ? handleUndo : undefined}
                        onRedo={redoStack.length > 0 ? handleRedo : undefined}
                        onCreateProfile={handleCreateProfile}
                        onDeleteProfile={handleDeleteProfile}
                        isDefaultProfile={selectedProfile === DEFAULT_PROFILE}
                    />
                ))}
            </List.Section>
            <List.Section title="To-do" subtitle={`${todoTasks.length}`}>
                {todoTasks.map((task) => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        date={date}
                        onUpdateTask={handleUpdateTaskWrapped}
                        onCreateTask={handleCreateTaskWrapped}
                        onDeleteTask={handleDeleteTaskWrapped}
                        onUndo={undoStack.length > 0 ? handleUndo : undefined}
                        onRedo={redoStack.length > 0 ? handleRedo : undefined}
                        onCreateProfile={handleCreateProfile}
                        onDeleteProfile={handleDeleteProfile}
                        isDefaultProfile={selectedProfile === DEFAULT_PROFILE}
                    />
                ))}
            </List.Section>
            <List.Section title="Done" subtitle={`${doneTasks.length}`}>
                {doneTasks.map((task) => (
                    <TaskItem
                        key={task.id}
                        task={task}
                        date={date}
                        onUpdateTask={handleUpdateTaskWrapped}
                        onCreateTask={handleCreateTaskWrapped}
                        onDeleteTask={handleDeleteTaskWrapped}
                        onUndo={undoStack.length > 0 ? handleUndo : undefined}
                        onRedo={redoStack.length > 0 ? handleRedo : undefined}
                        onCreateProfile={handleCreateProfile}
                        onDeleteProfile={handleDeleteProfile}
                        isDefaultProfile={selectedProfile === DEFAULT_PROFILE}
                    />
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
                            target={<TaskForm submitTitle="Create Task" onSubmit={handleCreateTaskWrapped} />}
                        />
                        {undoStack.length > 0 && (
                            <Action title="Undo" icon={Icon.Undo} shortcut={{ modifiers: ["cmd"], key: "z" }} onAction={handleUndo} />
                        )}
                        {redoStack.length > 0 && (
                            <Action
                                title="Redo"
                                icon={Icon.Redo}
                                shortcut={{ modifiers: ["cmd", "shift"], key: "z" }}
                                onAction={handleRedo}
                            />
                        )}
                        <Action.Push
                            title="Create New Profile"
                            icon={Icon.Person}
                            shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                            target={
                                <CreateProfileForm
                                    onCreate={handleCreateProfile}
                                />
                            }
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
    onUpdateTask,
    onCreateTask,
    onDeleteTask,
    onUndo,
    onRedo,
    onCreateProfile,
    onDeleteProfile,
    isDefaultProfile,
}: {
    task: Task;
    date: Date;
    onUpdateTask: (task: Task) => Promise<void>;
    onCreateTask: (values: {
        title: string;
        description: string;
        priority: string;
        deadline?: Date | null;
    }) => Promise<void>;
    onDeleteTask: (taskId: string) => Promise<void>;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
    onCreateProfile: (name: string) => void;
    onDeleteProfile: () => Promise<void>;
    isDefaultProfile: boolean;
}) {
    async function handleToggleStatus() {
        let newStatus: TaskStatus = "done";
        if (task.status === "done") newStatus = "todo";
        else if (task.status === "todo") newStatus = "done";
        else if (task.status === "paused") newStatus = "in-progress";
        else if (task.status === "in-progress") newStatus = "done";

        await onUpdateTask({ ...task, status: newStatus });
    }

    async function handleSetStatus(status: TaskStatus) {
        await onUpdateTask({ ...task, status });
    }

    async function handleDelete() {
        await onDeleteTask(task.id);
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

    const accessories: List.Item.Accessory[] = [{ tag: { value: task.priority, color: priorityColor } }];

    if (task.github) {
        let stateColor = Color.Green;
        if (task.github.state === "closed") stateColor = Color.Red;
        if (task.github.state === "merged") stateColor = Color.Purple;
        if (task.github.state === "changes_requested") stateColor = Color.Orange;

        accessories.unshift({
            tag: { value: `#${task.github.number}`, color: stateColor },
            tooltip: `GitHub ${task.github.type === "pull_request" ? "PR" : "Issue"}: ${task.github.state.replace(/_/g, " ")}`,
        });
    }

    return (
        <List.Item
            title={task.title}
            icon={icon}
            accessories={[...(task.deadline ? [{ date: new Date(task.deadline), tooltip: "Deadline" }] : []), ...accessories]}
            actions={
                <ActionPanel>
                    <Action
                        title={task.status === "done" ? "Mark as Undone" : "Mark as Done"}
                        icon={Icon.CheckCircle}
                        onAction={handleToggleStatus}
                    />
                    <Action.Push
                        title="Show Details"
                        icon={Icon.Sidebar}
                        shortcut={{ modifiers: ["cmd"], key: "return" }}
                        target={<TaskDetail task={task} date={date} onUpdateTask={onUpdateTask} onUndo={onUndo} onRedo={onRedo} onCreateProfile={onCreateProfile} onDeleteProfile={onDeleteProfile} isDefaultProfile={isDefaultProfile} />}
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
                                    await onUpdateTask({
                                        ...task,
                                        ...values,
                                        priority: values.priority as TaskPriority,
                                        deadline: values.deadline ? values.deadline.getTime() : null,
                                    });
                                    await showToast({ style: Toast.Style.Success, title: "Task updated" });
                                }}
                            />
                        }
                    />
                    {task.github && (
                        <Action.OpenInBrowser
                            url={task.github.url}
                            title="Open in GitHub"
                            shortcut={{ modifiers: ["opt"], key: "enter" }}
                        />
                    )}
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
                        target={<TaskForm submitTitle="Create Task" onSubmit={onCreateTask} />}
                    />
                    <Action
                        title="Delete Task"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["ctrl"], key: "x" }}
                        onAction={handleDelete}
                    />
                    {onUndo && (
                        <Action title="Undo" icon={Icon.Undo} shortcut={{ modifiers: ["cmd"], key: "z" }} onAction={onUndo} />
                    )}
                    {onRedo && (
                        <Action
                            title="Redo"
                            icon={Icon.Redo}
                            shortcut={{ modifiers: ["cmd", "shift"], key: "z" }}
                            onAction={onRedo}
                        />
                    )}
                    <Action.Push
                        title="Create New Profile"
                        icon={Icon.Person}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                        target={<CreateProfileForm onCreate={onCreateProfile} />}
                    />
                    {!isDefaultProfile && (
                        <Action
                            title="Delete Current Profile"
                            icon={Icon.Trash}
                            style={Action.Style.Destructive}
                            shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
                            onAction={onDeleteProfile}
                        />
                    )}
                </ActionPanel>
            }
        />
    );
}

function TaskDetail({
    task: initialTask,
    date,
    onUpdateTask,
    onUndo,
    onRedo,
    onCreateProfile,
    onDeleteProfile,
    isDefaultProfile,
}: {
    task: Task;
    date: Date;
    onUpdateTask: (task: Task) => Promise<void>;
    onUndo?: () => Promise<void>;
    onRedo?: () => Promise<void>;
    onCreateProfile: (name: string) => void;
    onDeleteProfile: () => Promise<void>;
    isDefaultProfile: boolean;
}) {
    const [task, setTask] = useState<Task>(initialTask);
    const [isEditing, setIsEditing] = useState(false);
    const { pop } = useNavigation();

    // Sync local state if prop changes (e.g. if updated from parent)
    useEffect(() => {
        setTask(initialTask);
    }, [initialTask]);

    async function handleSetStatus(status: TaskStatus) {
        const updatedTask = { ...task, status };
        setTask(updatedTask);
        await onUpdateTask(updatedTask);
    }

    async function handleToggleStatus() {
        let newStatus: TaskStatus = "done";
        if (task.status === "done") newStatus = "todo";
        else if (task.status === "todo") newStatus = "done";
        else if (task.status === "paused") newStatus = "in-progress";
        else if (task.status === "in-progress") newStatus = "done";

        await handleSetStatus(newStatus);
    }

    async function handleUndoWrapped() {
        if (onUndo) {
            await onUndo();
            await refreshTask();
        }
    }

    async function handleRedoWrapped() {
        if (onRedo) {
            await onRedo();
            await refreshTask();
        }
    }

    async function refreshTask() {
        // Refetch logic to sync this detail view
        const freshTasks = await getTasks(date);
        const freshTask = freshTasks.find((t) => t.id === task.id);
        if (freshTask) {
            setTask(freshTask);
        } else {
            // Task was likely created then undid creation, so it no longer exists.
            pop();
        }
    }

    if (isEditing) {
        return (
            <TaskForm
                initialValues={{
                    title: task.title,
                    description: task.description,
                    priority: task.priority,
                    deadline: task.deadline ? new Date(task.deadline) : null,
                }}
                submitTitle="Save Description"
                mode="description-only"
                shouldPopAfterSubmit={false}
                onSubmit={async (values) => {
                    const updatedTask = {
                        ...task,
                        description: values.description,
                    };
                    setTask(updatedTask);
                    setIsEditing(false);
                    await onUpdateTask(updatedTask);
                    await showToast({ style: Toast.Style.Success, title: "Description updated" });
                }}
            />
        );
    }

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
                            <Detail.Metadata.TagList title="State">
                                <Detail.Metadata.TagList.Item
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
                            </Detail.Metadata.TagList>
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
                    <Action
                        title={task.status === "done" ? "Mark as Undone" : "Mark as Done"}
                        icon={Icon.CheckCircle}
                        onAction={handleToggleStatus}
                    />
                    <Action
                        title="Edit Description"
                        icon={Icon.Document}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
                        onAction={() => setIsEditing(true)}
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
                                    github: task.github,
                                }}
                                submitTitle="Update Task"
                                onSubmit={async (values) => {
                                    const updatedTask = {
                                        ...task,
                                        ...values,
                                        priority: values.priority as TaskPriority,
                                        deadline: values.deadline ? values.deadline.getTime() : null,
                                    };
                                    setTask(updatedTask);
                                    await onUpdateTask(updatedTask);
                                    await showToast({ style: Toast.Style.Success, title: "Task updated" });
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
                    {onUndo && (
                        <Action
                            title="Undo"
                            icon={Icon.Undo}
                            shortcut={{ modifiers: ["cmd"], key: "z" }}
                            onAction={handleUndoWrapped}
                        />
                    )}
                    {onRedo && (
                        <Action
                            title="Redo"
                            icon={Icon.Redo}
                            shortcut={{ modifiers: ["cmd", "shift"], key: "z" }}
                            onAction={handleRedoWrapped}
                        />
                    )}
                    <Action.Push
                        title="Create New Profile"
                        icon={Icon.Person}
                        shortcut={{ modifiers: ["cmd", "shift"], key: "n" }}
                        target={<CreateProfileForm onCreate={onCreateProfile} />}
                    />

                    {!isDefaultProfile && (
                        <Action
                            title="Delete Current Profile"
                            icon={Icon.Trash}
                            style={Action.Style.Destructive}
                            shortcut={{ modifiers: ["ctrl", "shift"], key: "x" }}
                            onAction={onDeleteProfile}
                        />
                    )}
                </ActionPanel>
            }
        />
    );
}
