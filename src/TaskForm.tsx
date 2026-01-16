import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { useState } from "react";

interface FormValues {
  title: string;
  description: string;
  priority: string;
  deadline?: Date | null;
}

interface TaskFormProps {
  initialValues?: FormValues;
  submitTitle?: string;
  onSubmit: (values: FormValues) => Promise<void>;
  mode?: "full" | "description-only";
  shouldPopAfterSubmit?: boolean;
}

export default function TaskForm({
  initialValues,
  submitTitle = "Submit",
  onSubmit,
  mode = "full",
  shouldPopAfterSubmit = true,
}: TaskFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { pop } = useNavigation();

  async function handleSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      // If in description-only mode, we merge with initial values to ensure we don't lose data
      // though the parent handler likely handles the merge as well.
      // But Form fields not rendered won't be in `values`, so we must be careful.
      // Actually Raycast Form `values` only contains fields that exist.
      // We should ensure we pass everything expected if the parent expects a full object,
      // or assume the parent merges.
      // Looking at `TaskListView`, it does `{ ...task, ...values }`.
      // So if `values` only has `description`, it works fine!
      await onSubmit(values);
      if (shouldPopAfterSubmit) {
        pop();
      }
    } catch {
      // Error handling should be done by the parent or here if we want consistent toasts
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={submitTitle} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      {mode === "full" && (
        <Form.TextField id="title" title="Title" placeholder="Enter task title" defaultValue={initialValues?.title} />
      )}
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Enter task description (Markdown supported)"
        defaultValue={initialValues?.description}
        enableMarkdown
      />
      {mode === "full" && (
        <>
          <Form.Dropdown id="priority" title="Priority" defaultValue={initialValues?.priority || "medium"}>
            <Form.Dropdown.Item value="low" title="Low" />
            <Form.Dropdown.Item value="medium" title="Medium" />
            <Form.Dropdown.Item value="high" title="High" />
          </Form.Dropdown>
          <Form.DatePicker id="deadline" title="Deadline" defaultValue={initialValues?.deadline} />
        </>
      )}
    </Form>
  );
}
