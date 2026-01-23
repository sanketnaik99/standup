import { Action, ActionPanel, Form, showToast, Toast, popToRoot } from "@raycast/api";
import { runAppleScript } from "@raycast/utils";
import { Task } from "./types";
import { useState } from "react";

interface BuildWithCursorFormProps {
  task: Task;
}

export default function BuildWithCursorForm({ task }: BuildWithCursorFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: {
    directory: string[];
    branchName: string;
    baseBranch: string;
  }) {
    if (!values.directory || values.directory.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Please select a directory" });
      return;
    }

    if (!values.branchName.trim()) {
      await showToast({ style: Toast.Style.Failure, title: "Please enter a branch name" });
      return;
    }

    setIsLoading(true);

    try {
      const directory = values.directory[0];
      const baseBranch = values.baseBranch.trim() || "staging";
      const branchName = values.branchName.trim();
      
      // Escape special characters in the prompt for shell
      const promptTitle = task.title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const promptDescription = task.description.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
      const prompt = `${promptTitle}\\n\\n${promptDescription}`;

      // Build the full command sequence
      const command = `cd "${directory}" && git checkout ${baseBranch} && git pull && git checkout -b "${branchName}" && agent --mode=plan "${prompt}"`;
      
      // Escape the command for AppleScript
      const escapedCommand = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      // Run AppleScript to open Terminal and execute the command
      await runAppleScript(`
        tell application "Terminal"
          activate
          do script "${escapedCommand}"
        end tell
      `);

      await showToast({
        style: Toast.Style.Success,
        title: "Launching Cursor",
        message: `Opening ${branchName} in plan mode`,
      });

      popToRoot();
    } catch (error) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to launch Cursor",
        message: String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Build with Cursor"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Launch Cursor" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description
        title="Task"
        text={task.title}
      />
      <Form.FilePicker
        id="directory"
        title="Repository Directory"
        allowMultipleSelection={false}
        canChooseDirectories
        canChooseFiles={false}
      />
      <Form.TextField
        id="branchName"
        title="Branch Name"
        placeholder="feature/my-new-feature"
      />
      <Form.TextField
        id="baseBranch"
        title="Base Branch"
        placeholder="staging"
        info="Optional. The branch to checkout and pull before creating the new branch. Defaults to 'staging'."
      />
    </Form>
  );
}
