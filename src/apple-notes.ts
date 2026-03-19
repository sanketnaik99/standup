import { runAppleScript } from "@raycast/utils";
import { Task } from "./types";

import hljs from "highlight.js";

function getDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function syncDailyNote(date: Date, tasksMap: Record<string, Task[]>): Promise<void> {
  const noteTitle = `Tasks ${getDateString(date)}`;
  const folderName = "Tasks";

  const generateHTML = (tasksMap: Record<string, Task[]>) => {
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
        h1.profile-section { font-size: 1.5em; margin-top: 24px; margin-bottom: 12px; color: #333; text-decoration: underline; }
        .code-block { background-color: #f4f4f4; padding: 10px; border-radius: 5px; font-family: Menlo, Monaco, Consolas, "Courier New", monospace; white-space: pre-wrap; margin: 10px 0; display: block; }
        /* GitHub Light Theme for highlight.js */
        .hljs-comment, .hljs-quote { color: #57606a; font-style: italic; }
        .hljs-doctag, .hljs-keyword, .hljs-formula { color: #d03d44; }
        .hljs-section, .hljs-name, .hljs-selector-tag, .hljs-deletion, .hljs-subst { color: #d03d44; }
        .hljs-literal { color: #005cc5; }
        .hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute, .hljs-meta .hljs-string { color: #0a3069; }
        .hljs-attr, .hljs-variable, .hljs-template-variable, .hljs-type, .hljs-selector-class, .hljs-selector-attr, .hljs-selector-pseudo, .hljs-number { color: #24292f; }
        .hljs-symbol, .hljs-bullet, .hljs-link, .hljs-meta, .hljs-selector-id, .hljs-title { color: #6f42c1; }
        .hljs-built_in, .hljs-title.class_, .hljs-class .hljs-title { color: #6f42c1; }
        .hljs-emphasis { font-style: italic; }
        .hljs-strong { font-weight: bold; }
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

    const formatDescription = (description: string) => {
      if (!description) return "";

      // Split by code blocks: ```lang...```
      // The regex captures the language (optional) and the code content
      const parts = description.split(/(```(?:\w+)?\n?[\s\S]*?```)/g);

      return parts
        .map((part) => {
          if (part.startsWith("```")) {
            // Extract content inside backticks
            // Match the first line (```lang) and the last (```)
            // Match the first line (```lang) and the last (```)
            const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
            if (!match) return part; // Should theoretically match if regex split worked

            const lang = match[1] || "";
            const code = match[2] || "";

            let escapedCode = "";
            try {
              // Determine language but check if it's supported, otherwise auto or fallback
              if (lang && hljs.getLanguage(lang)) {
                escapedCode = hljs.highlight(code, { language: lang }).value;
              } else {
                escapedCode = hljs.highlightAuto(code).value;
              }
            } catch (e) {
              console.error("Highlighting failed", e);
              escapedCode = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }

            // Replace newlines with <br/> since we strip newlines later
            const formattedCode = escapedCode.replace(/\n/g, "<br/>");

            return `<pre class="code-block hljs">${formattedCode}</pre>`;
          } else {
            // Regular text: replace newlines with <br/>
            return part.replace(/\n/g, "<br/>");
          }
        })
        .join("");
    };

    const renderTask = (t: Task) => {
      const priorityLabel = t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟠" : "🟢";
      return `
            ${getIcon(t.status)} <strong>${t.title}</strong> ${priorityLabel} ${
              t.deadline ? `📅 ${new Date(t.deadline).toLocaleDateString()}` : ""
            }<br/>
            <span style="font-size: 0.9em; color: #666;">${formatDescription(t.description)}</span>
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

    let allSectionsHtml = "";

    // Iterate over each profile in the map
    for (const [profileName, tasks] of Object.entries(tasksMap)) {
      if (tasks.length === 0) continue;

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

      if (sections.length > 0) {
        const profileHtml = sections
          .map(
            (s) => `
                <h2>${s.title}</h2>
                <br/>
                ${s.list.map(renderTask).join("")}
            `,
          )
          .join("<br/>");

        allSectionsHtml += `
                <h1 class="profile-section">${profileName}</h1>
                ${profileHtml}
                <br/>-----------<br/>
            `;
      }
    }

    return `
      ${style}
      <h1>${noteTitle}</h1>
      ${allSectionsHtml}
      ${Object.values(tasksMap).every((t) => t.length === 0) ? "<p>No tasks for this day.</p>" : ""}
      <p style="font-size: 0.8em; color: #999; margin-top: 20px;">Last updated: ${new Date().toLocaleString()}</p>
    `;
  };

  const htmlContent = generateHTML(tasksMap);

  // Escaping for AppleScript
  // We need to be careful with quotes in HTML content when passing to AppleScript
  // Escape backslashes first, then double quotes, and remove newlines to prevent script errors
  const cleanHtml = htmlContent
    .replace(/\\/g, "\\\\") // Escape backslashes
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/\n/g, ""); // Remove newlines

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
