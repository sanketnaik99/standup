import { Action, ActionPanel, Form, useNavigation, showToast, Toast } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { useState } from "react";
import { GithubMetadata } from "./types";
import { fetchGithubDetails, parseGithubUrl } from "./github";

interface FormValues {
  title: string;
  description: string;
  priority: string;
  github?: GithubMetadata;
}

interface TaskFormProps {
  initialValues?: FormValues;
  submitTitle?: string;
  onSubmit: (values: FormValues) => Promise<void>;
}

export default function TaskForm({ initialValues, submitTitle = "Submit", onSubmit }: TaskFormProps) {
  const { pop } = useNavigation();
  const [isFetching, setIsFetching] = useState(false);

  const { handleSubmit, itemProps, setValue, values } = useForm<FormValues>({
    initialValues: {
      title: initialValues?.title || "",
      description: initialValues?.description || "",
      priority: initialValues?.priority || "medium",
      github: initialValues?.github,
    },
    validation: {
      title: FormValidation.Required,
    },
    onSubmit: async (values) => {
      try {
        await onSubmit(values);
        pop();
      } catch (error) {
        // Error handling is expected to be done by the parent or global error handler
      }
    },
  });

  const handleTitleChange = async (newValue: string) => {
    setValue("title", newValue);
    
    if (parseGithubUrl(newValue) && !values.description) {
        setIsFetching(true);
        const toast = await showToast({ style: Toast.Style.Animated, title: "Fetching GitHub details..." });
        
        const result = await fetchGithubDetails(newValue);
        
        if (result) {
            setValue("title", result.metadata.title);
            setValue("description", result.body || result.metadata.url); 
            
            setValue("github", result.metadata);
            toast.style = Toast.Style.Success;
            toast.title = "Fetched GitHub details";
        } else {
            toast.style = Toast.Style.Failure;
            toast.title = "Failed to fetch GitHub details";
        }
        setIsFetching(false);
    }
  }

  return (
    <Form
      isLoading={isFetching}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={submitTitle} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        {...itemProps.title}
        title="Title"
        placeholder="Enter task title or GitHub Issue URL"
        onChange={handleTitleChange}
      />
      <Form.TextArea
        {...itemProps.description}
        title="Description"
        placeholder="Enter task description (Markdown supported)"
      />
      <Form.Dropdown
        {...itemProps.priority}
        title="Priority"
      >
        <Form.Dropdown.Item value="low" title="Low" />
        <Form.Dropdown.Item value="medium" title="Medium" />
        <Form.Dropdown.Item value="high" title="High" />
      </Form.Dropdown>
    </Form>
  );
}
