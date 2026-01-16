import { popToRoot, showToast, Toast } from "@raycast/api";
import { v4 as uuidv4 } from "uuid";
import { createTask } from "./utils";
import { TaskPriority } from "./types";
import TaskForm from "./TaskForm";

export default function Command() {
  async function handleSubmit(values: { title: string; description: string; priority: string }) {
    if (!values.title) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Title is required",
      });
      return;
    }

    try {
      await createTask({
        id: uuidv4(),
        title: values.title,
        description: values.description,
        priority: values.priority as TaskPriority,
        status: "todo",
        createdAt: Date.now(),
      });
      await showToast({
        style: Toast.Style.Success,
        title: "Task added",
      });
      popToRoot();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to add task",
        message: String(error),
      });
      throw error;
    }
  }

  return <TaskForm submitTitle="Add Task" onSubmit={handleSubmit} />;
}

