import { Action, ActionPanel, Form, useNavigation } from "@raycast/api";
import TaskListView from "./TaskListView";

export default function Command() {
  const { push } = useNavigation();

  function handleSubmit(values: { date: Date | null }) {
    if (values.date) {
      push(<TaskListView date={values.date} />);
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="View Tasks" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.DatePicker id="date" title="Date" defaultValue={new Date()} />
    </Form>
  );
}
