import { Action, ActionPanel, Form, useNavigation, showToast, Toast } from "@raycast/api";
import { createProfile } from "./utils";

interface CreateProfileFormProps {
  onCreate: (name: string) => void;
}

export default function CreateProfileForm({ onCreate }: CreateProfileFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Create Profile"
            onSubmit={async (values: { name: string }) => {
              if (!values.name || values.name.trim() === "") {
                await showToast({ style: Toast.Style.Failure, title: "Profile name is required" });
                return;
              }
              const name = values.name.trim();
              await createProfile(name);
              onCreate(name);
              await showToast({ style: Toast.Style.Success, title: "Profile created" });
              pop();
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Profile Name" placeholder="e.g. Home, Side Project" />
    </Form>
  );
}
