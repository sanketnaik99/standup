import { Action, ActionPanel, Form, useNavigation, showToast, Toast } from "@raycast/api";
import { useForm, FormValidation } from "@raycast/utils";
import { useState, useRef } from "react";
import { GithubMetadata } from "./types";
import { fetchGithubDetails, parseGithubUrl } from "./github";

interface FormValues {
  title: string;
  description: string;
  priority: string;
  github?: GithubMetadata;
  githubUrl?: string;
  deadline?: Date | null;
}

interface TaskFormProps {
  initialValues?: FormValues;
  submitTitle?: string;
  onSubmit: (values: FormValues) => Promise<void>;
}

export default function TaskForm({ initialValues, submitTitle = "Submit", onSubmit }: TaskFormProps) {
  const { pop } = useNavigation();
  const [isFetching, setIsFetching] = useState(false);
  const [github, setGithub] = useState<GithubMetadata | undefined>(initialValues?.github);
  const { handleSubmit, itemProps, setValue, values: formValues } = useForm<FormValues>({
    initialValues: {
      title: initialValues?.title || "",
      description: initialValues?.description || "",
      priority: initialValues?.priority || "medium",
      githubUrl: initialValues?.github?.url || "",
      deadline: initialValues?.deadline,
    },
    validation: {
      title: FormValidation.Required,
    },
    onSubmit: async (values) => {
      try {
        await onSubmit({ ...values, github });
        pop();
      } catch (error) {
        // Error handling is expected to be done by the parent or global error handler
      }
    },
  });
  
  // Keep a ref to values to access the latest state in async callbacks
  const valuesRef = useRef(formValues);
  valuesRef.current = formValues;

  const handleGithubUrlChange = async (newValue: string) => {
    setValue("githubUrl", newValue);
    
    if (!newValue) {
        setGithub(undefined);
        return;
    }

    if (parseGithubUrl(newValue)) {
        setIsFetching(true);
        const toast = await showToast({ style: Toast.Style.Animated, title: "Fetching GitHub details..." });
        
        const result = await fetchGithubDetails(newValue);
        
        if (result) {
            // Check value from ref to avoid stale closure
            if (!valuesRef.current.title) {
                setValue("title", result.metadata.title);
            }
            if (!valuesRef.current.description) {
             setValue("description", result.body || result.metadata.url); 
            }
            
            setGithub(result.metadata);
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
        {...itemProps.githubUrl}
        title="GitHub Link"
        placeholder="Paste GitHub Issue or PR URL"
        onChange={handleGithubUrlChange}
      />
      <Form.TextField
        {...itemProps.title}
        title="Title"
        placeholder="Enter task title"
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
      <Form.DatePicker {...itemProps.deadline} title="Deadline" />
    </Form>
  );
}
