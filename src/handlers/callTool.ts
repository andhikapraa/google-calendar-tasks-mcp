import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, tasks_v1, gmail_v1 } from "googleapis";
import {
  ListEventsArgumentsSchema,
  SearchEventsArgumentsSchema,
  CreateEventArgumentsSchema,
  UpdateEventArgumentsSchema,
  DeleteEventArgumentsSchema,
  // Google Tasks API schemas
  ListTaskListsArgumentsSchema,
  GetTaskListArgumentsSchema,
  CreateTaskListArgumentsSchema,
  UpdateTaskListArgumentsSchema,
  DeleteTaskListArgumentsSchema,
  ListTasksArgumentsSchema,
  GetTaskArgumentsSchema,
  CreateTaskArgumentsSchema,
  UpdateTaskArgumentsSchema,
  CompleteTaskArgumentsSchema,
  DeleteTaskArgumentsSchema,
  // Gmail API schemas
  ListMessagesArgumentsSchema,
  GetMessageArgumentsSchema,
  SendMessageArgumentsSchema,
  CreateDraftArgumentsSchema,
  UpdateDraftArgumentsSchema,
  ListLabelsArgumentsSchema,
  CreateLabelArgumentsSchema,
  ModifyLabelsArgumentsSchema,
  ListThreadsArgumentsSchema,
  GetThreadArgumentsSchema,
  TrashMessageArgumentsSchema,
  DeleteMessageArgumentsSchema,
  MarkAsReadArgumentsSchema,
} from "../schemas/validators.js";
import {
  listCalendars,
  listEvents,
  searchEvents,
  listColors,
  createEvent,
  updateEvent,
  deleteEvent,
} from "../services/googleCalendar.js";
import {
  listTaskLists,
  getTaskList,
  createTaskList,
  updateTaskList,
  deleteTaskList,
  listTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
} from "../services/googleTasks.js";
import {
  // Gmail service imports
  listMessages,
  getMessage,
  sendMessage,
  createDraft,
  updateDraft,
  listLabels,
  createLabel,
  modifyLabels,
  listThreads,
  getThread,
  trashMessage,
  deleteMessage,
  markAsRead,
} from "../services/googleGmail.js";
import {
  CalendarListEntry,
  CalendarEvent,
  CalendarEventAttendee,
  TaskList,
  Task,
  // Gmail type imports
  GmailMessage,
  GmailThread,
  GmailLabel,
  GmailDraft,
} from "../schemas/types.js";

/**
 * Formats a list of calendars into a user-friendly string.
 */
function formatCalendarList(
  calendars: calendar_v3.Schema$CalendarListEntry[]
): string {
  return calendars
    .map((cal) => `${cal.summary || "Untitled"} (${cal.id || "no-id"})`)
    .join("\n");
}

/**
 * Formats a list of events into a user-friendly string.
 */
function formatEventList(events: calendar_v3.Schema$Event[]): string {
  return events
    .map((event) => {
      const attendeeList = event.attendees
        ? `\nAttendees: ${event.attendees
            .map(
              (a) =>
                `${a.email || "no-email"} (${a.responseStatus || "unknown"})`
            )
            .join(", ")}`
        : "";
      const locationInfo = event.location
        ? `\nLocation: ${event.location}`
        : "";
      const colorInfo = event.colorId ? `\nColor ID: ${event.colorId}` : "";
      const reminderInfo = event.reminders
        ? `\nReminders: ${
            event.reminders.useDefault
              ? "Using default"
              : (event.reminders.overrides || [])
                  .map((r: any) => `${r.method} ${r.minutes} minutes before`)
                  .join(", ") || "None"
          }`
        : "";
      return `${event.summary || "Untitled"} (${
        event.id || "no-id"
      })${locationInfo}\nStart: ${
        event.start?.dateTime || event.start?.date || "unspecified"
      }\nEnd: ${
        event.end?.dateTime || event.end?.date || "unspecified"
      }${attendeeList}${colorInfo}${reminderInfo}\n`;
    })
    .join("\n");
}

/**
 * Formats the color information into a user-friendly string.
 */
function formatColorList(colors: calendar_v3.Schema$Colors): string {
  const eventColors = colors.event || {};
  return Object.entries(eventColors)
    .map(
      ([id, colorInfo]) =>
        `Color ID: ${id} - ${colorInfo.background} (background) / ${colorInfo.foreground} (foreground)`
    )
    .join("\n");
}

/**
 * Formats a list of task lists into a user-friendly string.
 */
function formatTaskListList(taskLists: tasks_v1.Schema$TaskList[]): string {
  return taskLists
    .map((list) => `${list.title || "Untitled"} (${list.id || "no-id"})`)
    .join("\n");
}

/**
 * Formats a list of tasks into a user-friendly string.
 */
function formatTaskList(tasks: tasks_v1.Schema$Task[]): string {
  return tasks
    .map((task) => {
      const dueInfo = task.due ? `\nDue: ${task.due}` : "";
      const statusInfo = `\nStatus: ${task.status || "needsAction"}`;
      const notesInfo = task.notes ? `\nNotes: ${task.notes}` : "";
      return `${task.title || "Untitled"} (${
        task.id || "no-id"
      })${statusInfo}${dueInfo}${notesInfo}\n`;
    })
    .join("\n");
}

/**
 * Formats a list of Gmail messages into a user-friendly string.
 */
function formatMessagesResponse(messages: gmail_v1.Schema$Message[]): string {
  if (messages.length === 0) return "No messages found.";

  return messages
    .map((msg) => `ID: ${msg.id}, Snippet: ${msg.snippet || "(No preview)"}`)
    .join("\n");
}

/**
 * Formats a single Gmail message into a user-friendly string.
 */
function formatMessageResponse(message: gmail_v1.Schema$Message): string {
  if (!message) return "Message not found.";

  let result = `Message ID: ${message.id}\n`;

  // Extract common headers
  if (message.payload?.headers) {
    const headers = message.payload.headers;
    const from = headers.find((h) => h.name === "From")?.value;
    const to = headers.find((h) => h.name === "To")?.value;
    const subject = headers.find((h) => h.name === "Subject")?.value;
    const date = headers.find((h) => h.name === "Date")?.value;

    if (from) result += `From: ${from}\n`;
    if (to) result += `To: ${to}\n`;
    if (subject) result += `Subject: ${subject}\n`;
    if (date) result += `Date: ${date}\n`;
  }

  // Add snippet or body
  if (message.snippet) {
    result += `\nPreview: ${message.snippet}\n`;
  }

  return result;
}

/**
 * Formats a list of Gmail labels into a user-friendly string.
 */
function formatLabelsResponse(labels: gmail_v1.Schema$Label[]): string {
  if (labels.length === 0) return "No labels found.";

  return labels
    .map(
      (label) =>
        `ID: ${label.id}, Name: ${label.name}, Type: ${label.type || "User"}`
    )
    .join("\n");
}

/**
 * Formats a list of Gmail threads into a user-friendly string.
 */
function formatThreadsResponse(threads: gmail_v1.Schema$Thread[]): string {
  if (threads.length === 0) return "No threads found.";

  return threads
    .map(
      (thread) =>
        `Thread ID: ${thread.id}, Snippet: ${thread.snippet || "(No preview)"}`
    )
    .join("\n");
}

/**
 * Formats a single Gmail thread into a user-friendly string.
 */
function formatThreadResponse(thread: gmail_v1.Schema$Thread): string {
  if (!thread) return "Thread not found.";

  let result = `Thread ID: ${thread.id}\n`;
  result += `Snippet: ${thread.snippet || "(No preview)"}\n`;

  // Count messages in thread
  if (thread.messages) {
    result += `Messages in thread: ${thread.messages.length}\n\n`;

    // Add short preview of each message
    thread.messages.forEach((msg, index) => {
      const from =
        msg.payload?.headers?.find((h) => h.name === "From")?.value ||
        "Unknown";
      const subject =
        msg.payload?.headers?.find((h) => h.name === "Subject")?.value ||
        "No subject";
      result += `[${index + 1}] From: ${from}, Subject: ${subject}\n`;
    });
  } else {
    result += "No messages in thread.";
  }

  return result;
}

/**
 * Handles incoming tool calls, validates arguments, calls the appropriate service,
 * and formats the response.
 *
 * @param request The CallToolRequest containing tool name and arguments.
 * @param oauth2Client The authenticated OAuth2 client instance.
 * @returns A Promise resolving to the CallToolResponse.
 */
export async function handleCallTool(
  request: typeof CallToolRequestSchema._type,
  oauth2Client: OAuth2Client
) {
  const { name, arguments: input } = request.params;

  try {
    switch (name) {
      case "list-calendars": {
        const calendars = await listCalendars(oauth2Client);
        return {
          content: [
            {
              type: "text",
              text: formatCalendarList(calendars),
            },
          ],
        };
      }

      case "list-events": {
        const validArgs = ListEventsArgumentsSchema.parse(input);
        const events = await listEvents(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: formatEventList(events),
            },
          ],
        };
      }

      case "search-events": {
        const validArgs = SearchEventsArgumentsSchema.parse(input);
        const events = await searchEvents(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: formatEventList(events), // Same formatting as list-events
            },
          ],
        };
      }

      case "list-colors": {
        const colors = await listColors(oauth2Client);
        return {
          content: [
            {
              type: "text",
              text: `Available event colors:\n${formatColorList(colors)}`,
            },
          ],
        };
      }

      case "create-event": {
        const validArgs = CreateEventArgumentsSchema.parse(input);
        const event = await createEvent(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Event created: ${event.summary} (${event.id})`,
            },
          ],
        };
      }

      case "update-event": {
        const validArgs = UpdateEventArgumentsSchema.parse(input);
        const event = await updateEvent(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Event updated: ${event.summary} (${event.id})`,
            },
          ],
        };
      }

      case "delete-event": {
        const validArgs = DeleteEventArgumentsSchema.parse(input);
        await deleteEvent(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Event deleted successfully`,
            },
          ],
        };
      }

      // Google Tasks API Tools
      case "list-task-lists": {
        const taskLists = await listTaskLists(oauth2Client);
        return {
          content: [
            {
              type: "text",
              text: formatTaskListList(taskLists),
            },
          ],
        };
      }

      case "get-task-list": {
        const validArgs = GetTaskListArgumentsSchema.parse(input);
        const taskList = await getTaskList(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task List: ${taskList.title} (${taskList.id})`,
            },
          ],
        };
      }

      case "create-task-list": {
        const validArgs = CreateTaskListArgumentsSchema.parse(input);
        const taskList = await createTaskList(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task list created: ${taskList.title} (${taskList.id})`,
            },
          ],
        };
      }

      case "update-task-list": {
        const validArgs = UpdateTaskListArgumentsSchema.parse(input);
        const taskList = await updateTaskList(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task list updated: ${taskList.title} (${taskList.id})`,
            },
          ],
        };
      }

      case "delete-task-list": {
        const validArgs = DeleteTaskListArgumentsSchema.parse(input);
        await deleteTaskList(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task list deleted successfully`,
            },
          ],
        };
      }

      case "list-tasks": {
        const validArgs = ListTasksArgumentsSchema.parse(input);
        const tasks = await listTasks(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: formatTaskList(tasks),
            },
          ],
        };
      }

      case "get-task": {
        const validArgs = GetTaskArgumentsSchema.parse(input);
        const task = await getTask(oauth2Client, validArgs);
        const dueInfo = task.due ? `\nDue: ${task.due}` : "";
        const statusInfo = `\nStatus: ${task.status || "needsAction"}`;
        const notesInfo = task.notes ? `\nNotes: ${task.notes}` : "";
        return {
          content: [
            {
              type: "text",
              text: `Task: ${task.title} (${task.id})${statusInfo}${dueInfo}${notesInfo}`,
            },
          ],
        };
      }

      case "create-task": {
        const validArgs = CreateTaskArgumentsSchema.parse(input);
        const task = await createTask(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task created: ${task.title} (${task.id})`,
            },
          ],
        };
      }

      case "update-task": {
        const validArgs = UpdateTaskArgumentsSchema.parse(input);
        const task = await updateTask(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task updated: ${task.title} (${task.id})`,
            },
          ],
        };
      }

      case "complete-task": {
        const validArgs = CompleteTaskArgumentsSchema.parse(input);
        const task = await completeTask(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task completed: ${task.title} (${task.id})`,
            },
          ],
        };
      }

      case "delete-task": {
        const validArgs = DeleteTaskArgumentsSchema.parse(input);
        await deleteTask(oauth2Client, validArgs);
        return {
          content: [
            {
              type: "text",
              text: `Task deleted successfully`,
            },
          ],
        };
      }

      // Gmail API tools
      case "list-messages": {
        const args = ListMessagesArgumentsSchema.parse(input);
        const messages = await listMessages(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: formatMessagesResponse(messages),
            },
          ],
        };
      }

      case "get-message": {
        const args = GetMessageArgumentsSchema.parse(input);
        const message = await getMessage(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: formatMessageResponse(message),
            },
          ],
        };
      }

      case "send-message": {
        const args = SendMessageArgumentsSchema.parse(input);
        const result = await sendMessage(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Email sent successfully. Message ID: ${result.id}`,
            },
          ],
        };
      }

      case "create-draft": {
        const args = CreateDraftArgumentsSchema.parse(input);
        const draft = await createDraft(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Draft created successfully. Draft ID: ${draft.id}`,
            },
          ],
        };
      }

      case "update-draft": {
        const args = UpdateDraftArgumentsSchema.parse(input);
        const draft = await updateDraft(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Draft updated successfully. Draft ID: ${draft.id}`,
            },
          ],
        };
      }

      case "list-labels": {
        const labels = await listLabels(oauth2Client);
        return {
          content: [
            {
              type: "text",
              text: formatLabelsResponse(labels),
            },
          ],
        };
      }

      case "create-label": {
        const args = CreateLabelArgumentsSchema.parse(input);
        const label = await createLabel(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Label created successfully. Label ID: ${label.id}, Name: ${label.name}`,
            },
          ],
        };
      }

      case "modify-labels": {
        const args = ModifyLabelsArgumentsSchema.parse(input);
        const result = await modifyLabels(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Labels modified successfully for message ID: ${result.id}`,
            },
          ],
        };
      }

      case "list-threads": {
        const args = ListThreadsArgumentsSchema.parse(input);
        const threads = await listThreads(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: formatThreadsResponse(threads),
            },
          ],
        };
      }

      case "get-thread": {
        const args = GetThreadArgumentsSchema.parse(input);
        const thread = await getThread(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: formatThreadResponse(thread),
            },
          ],
        };
      }

      case "trash-message": {
        const args = TrashMessageArgumentsSchema.parse(input);
        await trashMessage(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Message ${args.messageId} moved to trash`,
            },
          ],
        };
      }

      case "delete-message": {
        const args = DeleteMessageArgumentsSchema.parse(input);
        await deleteMessage(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Message ${args.messageId} permanently deleted`,
            },
          ],
        };
      }

      case "mark-as-read": {
        const args = MarkAsReadArgumentsSchema.parse(input);
        await markAsRead(oauth2Client, args);
        return {
          content: [
            {
              type: "text",
              text: `Message ${args.messageId} marked as ${
                args.read ? "read" : "unread"
              }`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    console.error(`Error executing tool '${name}':`, error);
    // Re-throw the error to be handled by the main server logic or error handler
    throw error;
  }
}
