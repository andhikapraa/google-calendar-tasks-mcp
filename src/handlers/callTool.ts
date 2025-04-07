import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { OAuth2Client } from "google-auth-library";
import { calendar_v3, tasks_v1 } from "googleapis";
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
  CalendarListEntry,
  CalendarEvent,
  CalendarEventAttendee,
  TaskList,
  Task,
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
  const { name, arguments: args } = request.params;

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
        const validArgs = ListEventsArgumentsSchema.parse(args);
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
        const validArgs = SearchEventsArgumentsSchema.parse(args);
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
        const validArgs = CreateEventArgumentsSchema.parse(args);
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
        const validArgs = UpdateEventArgumentsSchema.parse(args);
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
        const validArgs = DeleteEventArgumentsSchema.parse(args);
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
        const validArgs = GetTaskListArgumentsSchema.parse(args);
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
        const validArgs = CreateTaskListArgumentsSchema.parse(args);
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
        const validArgs = UpdateTaskListArgumentsSchema.parse(args);
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
        const validArgs = DeleteTaskListArgumentsSchema.parse(args);
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
        const validArgs = ListTasksArgumentsSchema.parse(args);
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
        const validArgs = GetTaskArgumentsSchema.parse(args);
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
        const validArgs = CreateTaskArgumentsSchema.parse(args);
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
        const validArgs = UpdateTaskArgumentsSchema.parse(args);
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
        const validArgs = CompleteTaskArgumentsSchema.parse(args);
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
        const validArgs = DeleteTaskArgumentsSchema.parse(args);
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

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: unknown) {
    console.error(`Error executing tool '${name}':`, error);
    // Re-throw the error to be handled by the main server logic or error handler
    throw error;
  }
}
