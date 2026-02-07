import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import { useState } from "react";

export default function RoutineForm({
  initialValues,
  onSubmit,
  submitTitle = "Create Routine",
}: {
  initialValues?: { title: string; description: string; expectedDuration?: number };
  onSubmit: (values: { title: string; description: string; expectedDuration?: number }) => Promise<void>;
  submitTitle?: string;
}) {
  const { pop } = useNavigation();
  const [title, setTitle] = useState(initialValues?.title || "");
  const [description, setDescription] = useState(initialValues?.description || "");
  const [expectedDuration, setExpectedDuration] = useState(initialValues?.expectedDuration?.toString() || "");
  const [titleError, setTitleError] = useState<string | undefined>();

  function handleSubmit() {
    if (title.length === 0) {
      setTitleError("Title is required");
      return;
    }
    onSubmit({
      title,
      description,
      expectedDuration: expectedDuration ? parseInt(expectedDuration) : undefined,
    });
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title={submitTitle} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Morning Exercise"
        value={title}
        onChange={(value) => {
          setTitle(value);
          if (value.length > 0) setTitleError(undefined);
        }}
        error={titleError}
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Details about the routine"
        value={description}
        onChange={setDescription}
        enableMarkdown={true}
      />
      <Form.TextField
        id="expectedDuration"
        title="Duration (minutes)"
        placeholder="30"
        value={expectedDuration}
        onChange={setExpectedDuration}
      />
    </Form>
  );
}
