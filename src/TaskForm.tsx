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
}

export default function TaskForm({ initialValues, submitTitle = "Submit", onSubmit }: TaskFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { pop } = useNavigation();

  async function handleSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      await onSubmit(values);
      pop();
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
      <Form.TextField id="title" title="Title" placeholder="Enter task title" defaultValue={initialValues?.title} />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Enter task description (Markdown supported)"
        defaultValue={initialValues?.description}
      />
      <Form.Dropdown id="priority" title="Priority" defaultValue={initialValues?.priority || "medium"}>
        <Form.Dropdown.Item value="low" title="Low" />
        <Form.Dropdown.Item value="medium" title="Medium" />
        <Form.Dropdown.Item value="high" title="High" />
      </Form.Dropdown>
      <Form.DatePicker id="deadline" title="Deadline" defaultValue={initialValues?.deadline} />
    </Form>
  );
}
