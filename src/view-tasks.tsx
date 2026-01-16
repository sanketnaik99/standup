import TaskListView from "./TaskListView";

export default function Command() {
  return <TaskListView date={new Date()} />;
}
