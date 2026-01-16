import TaskListView from "./TaskListView";

export default function Command() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return <TaskListView date={yesterday} />;
}
