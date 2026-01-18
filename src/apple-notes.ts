import { runAppleScript } from "@raycast/utils";
import { Task } from "./types";
import { getDateString } from "./utils";

export async function syncDailyNote(date: Date, tasks: Task[], profile: string): Promise<void> {
    const noteTitle = `${profile} Tasks ${getDateString(date)}`;
    const folderName = "Tasks";

    const generateHTML = (tasks: Task[]) => {
        // Basic styling for the note
        const style = `
      <style>
        .task { margin-bottom: 8px; }
        .todo { color: black; }
        .in-progress { color: #007AFF; font-weight: bold; }
        .paused { color: #FF9500; }
        .done { color: gray; }
        .priority-high { color: #FF3B30; }
        .priority-medium { color: #FF9500; }
        .priority-low { color: #34C759; }
        h2 { font-size: 1.2em; margin-top: 16px; margin-bottom: 8px; border-bottom: 1px solid #eee; }
      </style>
    `;

        const getIcon = (status: string) => {
            switch (status) {
                case "done":
                    return "✅";
                case "in-progress":
                    return "🚧";
                case "paused":
                    return "⏸️";
                default:
                    return "⬜";
            }
        };

        const renderTask = (t: Task) => {
            const priorityLabel = t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟠" : "🟢";
            return `
          <div class="task ${t.status}">
            ${getIcon(t.status)} <strong>${t.title}</strong> ${priorityLabel} <br/>
            <span style="font-size: 0.9em; color: #666;">${t.description.replace(/\n/g, "<br/>")}</span>
          </div>
          <hr/>
        `;
        };

        const priorityOrder = { high: 3, medium: 2, low: 1 };
        const sortTasks = (taskList: Task[]) => {
            return [...taskList].sort(
                (a, b) =>
                    priorityOrder[b.priority as keyof typeof priorityOrder] -
                    priorityOrder[a.priority as keyof typeof priorityOrder],
            );
        };

        const inProgressTasks = sortTasks(tasks.filter((t) => t.status === "in-progress"));
        const pausedTasks = sortTasks(tasks.filter((t) => t.status === "paused"));
        const todoTasks = sortTasks(tasks.filter((t) => t.status === "todo"));
        const doneTasks = sortTasks(tasks.filter((t) => t.status === "done"));

        const sections = [
            { title: "In Progress", list: inProgressTasks },
            { title: "Paused", list: pausedTasks },
            { title: "To Do", list: todoTasks },
            { title: "Done", list: doneTasks },
        ].filter((s) => s.list.length > 0);

        const renderedHtml = sections
            .map(
                (s) => `
        <h2>${s.title}</h2>
        <br/>
        ${s.list.map(renderTask).join("")}
    `,
            )
            .join("<br/>-----------<br/>");

        return `
      ${style}
      <h1>${noteTitle}</h1>
      ${renderedHtml}
      ${tasks.length === 0 ? "<p>No tasks for this day.</p>" : ""}
      <p style="font-size: 0.8em; color: #999; margin-top: 20px;">Last updated: ${new Date().toLocaleString()}</p>
    `;
    };

    const htmlContent = generateHTML(tasks);

    // Escaping for AppleScript
    // We need to be careful with quotes in HTML content when passing to AppleScript
    // Simple check: double quotes need to be escaped
    const cleanHtml = htmlContent.replace(/"/g, '\\"');

    const script = `
    tell application "Notes"
        if not (exists folder "${folderName}") then
            make new folder with properties {name:"${folderName}"}
        end if
        
        tell folder "${folderName}"
            if not (exists note "${noteTitle}") then
                make new note with properties {name:"${noteTitle}", body:"${cleanHtml}"}
            else
                set body of note "${noteTitle}" to "${cleanHtml}"
            end if
        end tell
    tell application "Notes" to save
    end tell
  `;

    try {
        await runAppleScript(script);
    } catch (error) {
        console.error("Failed to sync to Apple Notes", error);
    }
}
