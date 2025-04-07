import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// Extracted reminder properties definition for reusability
const remindersInputProperty = {
  type: "object",
  description: "Reminder settings for the event",
  properties: {
    useDefault: {
      type: "boolean",
      description: "Whether to use the default reminders",
    },
    overrides: {
      type: "array",
      description:
        "Custom reminders (uses popup notifications by default unless email is specified)",
      items: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["email", "popup"],
            description:
              "Reminder method (defaults to popup unless email is specified)",
            default: "popup",
          },
          minutes: {
            type: "number",
            description: "Minutes before the event to trigger the reminder",
          },
        },
        required: ["minutes"],
      },
    },
  },
  required: ["useDefault"],
};

export function getToolDefinitions() {
  return {
    tools: [
      {
        name: "list-calendars",
        description: "List all available calendars",
        inputSchema: {
          type: "object",
          properties: {}, // No arguments needed
          required: [],
        },
      },
      {
        name: "list-events",
        description: "List events from a calendar",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description:
                "ID of the calendar to list events from (use 'primary' for the main calendar)",
            },
            timeMin: {
              type: "string",
              format: "date-time", // Indicate ISO 8601 format expected
              description:
                "Start time in ISO format (optional, e.g., 2024-01-01T00:00:00Z)",
            },
            timeMax: {
              type: "string",
              format: "date-time", // Indicate ISO 8601 format expected
              description:
                "End time in ISO format (optional, e.g., 2024-12-31T23:59:59Z)",
            },
          },
          required: ["calendarId"],
        },
      },
      {
        name: "search-events",
        description: "Search for events in a calendar by text query",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description:
                "ID of the calendar to search events in (use 'primary' for the main calendar)",
            },
            query: {
              type: "string",
              description:
                "Free text search query (searches summary, description, location, attendees, etc.)",
            },
            timeMin: {
              type: "string",
              format: "date-time",
              description: "Start time boundary in ISO format (optional)",
            },
            timeMax: {
              type: "string",
              format: "date-time",
              description: "End time boundary in ISO format (optional)",
            },
          },
          required: ["calendarId", "query"],
        },
      },
      {
        name: "list-colors",
        description:
          "List available color IDs and their meanings for calendar events",
        inputSchema: {
          type: "object",
          properties: {}, // No arguments needed
          required: [],
        },
      },
      {
        name: "create-event",
        description: "Create a new calendar event",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description:
                "ID of the calendar to create the event in (use 'primary' for the main calendar)",
            },
            summary: {
              type: "string",
              description: "Title of the event",
            },
            description: {
              type: "string",
              description: "Description/notes for the event (optional)",
            },
            start: {
              type: "string",
              format: "date-time",
              description:
                "Start time in ISO format (e.g., 2024-08-15T10:00:00-07:00)",
            },
            end: {
              type: "string",
              format: "date-time",
              description:
                "End time in ISO format (e.g., 2024-08-15T11:00:00-07:00)",
            },
            timeZone: {
              type: "string",
              description:
                "Timezone of the event start/end times, formatted as an IANA Time Zone Database name (e.g., America/Los_Angeles). Required if start/end times are specified, especially for recurring events.",
            },
            location: {
              type: "string",
              description: "Location of the event (optional)",
            },
            attendees: {
              type: "array",
              description: "List of attendee email addresses (optional)",
              items: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address of the attendee",
                  },
                },
                required: ["email"],
              },
            },
            colorId: {
              type: "string",
              description:
                "Color ID for the event (optional, use list-colors to see available IDs)",
            },
            reminders: remindersInputProperty,
            recurrence: {
              type: "array",
              description:
                'List of recurrence rules (RRULE, EXRULE, RDATE, EXDATE) in RFC5545 format (optional). Example: ["RRULE:FREQ=WEEKLY;COUNT=5"]',
              items: {
                type: "string",
              },
            },
          },
          required: ["calendarId", "summary", "start", "end", "timeZone"],
        },
      },
      {
        name: "update-event",
        description: "Update an existing calendar event",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar containing the event",
            },
            eventId: {
              type: "string",
              description: "ID of the event to update",
            },
            summary: {
              type: "string",
              description: "New title for the event (optional)",
            },
            description: {
              type: "string",
              description: "New description for the event (optional)",
            },
            start: {
              type: "string",
              format: "date-time",
              description: "New start time in ISO format (optional)",
            },
            end: {
              type: "string",
              format: "date-time",
              description: "New end time in ISO format (optional)",
            },
            timeZone: {
              type: "string",
              description:
                "Timezone for the start/end times (IANA format, e.g., America/Los_Angeles). Required if modifying start/end, or for recurring events.",
            },
            location: {
              type: "string",
              description: "New location for the event (optional)",
            },
            colorId: {
              type: "string",
              description: "New color ID for the event (optional)",
            },
            attendees: {
              type: "array",
              description:
                "New list of attendee email addresses (optional, replaces existing attendees)",
              items: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                    description: "Email address of the attendee",
                  },
                },
                required: ["email"],
              },
            },
            reminders: {
              ...remindersInputProperty,
              description: "New reminder settings for the event (optional)",
            },
            recurrence: {
              type: "array",
              description:
                'New list of recurrence rules (RFC5545 format, optional, replaces existing rules). Example: ["RRULE:FREQ=DAILY;COUNT=10"]',
              items: {
                type: "string",
              },
            },
          },
          required: ["calendarId", "eventId", "timeZone"], // timeZone is technically required for PATCH
        },
      },
      {
        name: "delete-event",
        description: "Delete a calendar event",
        inputSchema: {
          type: "object",
          properties: {
            calendarId: {
              type: "string",
              description: "ID of the calendar containing the event",
            },
            eventId: {
              type: "string",
              description: "ID of the event to delete",
            },
          },
          required: ["calendarId", "eventId"],
        },
      },
      // Google Tasks API Tools
      {
        name: "list-task-lists",
        description: "List all available task lists",
        inputSchema: {
          type: "object",
          properties: {}, // No arguments needed
          required: [],
        },
      },
      {
        name: "get-task-list",
        description: "Get a specific task list by ID",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list to retrieve",
            },
          },
          required: ["taskListId"],
        },
      },
      {
        name: "create-task-list",
        description: "Create a new task list",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the new task list",
            },
          },
          required: ["title"],
        },
      },
      {
        name: "update-task-list",
        description: "Update an existing task list",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list to update",
            },
            title: {
              type: "string",
              description: "New title for the task list",
            },
          },
          required: ["taskListId", "title"],
        },
      },
      {
        name: "delete-task-list",
        description: "Delete a task list",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list to delete",
            },
          },
          required: ["taskListId"],
        },
      },
      {
        name: "list-tasks",
        description: "List tasks in a task list",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list to get tasks from",
            },
            showCompleted: {
              type: "boolean",
              description: "Whether to include completed tasks (default: true)",
            },
            showDeleted: {
              type: "boolean",
              description: "Whether to include deleted tasks (default: false)",
            },
            showHidden: {
              type: "boolean",
              description: "Whether to include hidden tasks (default: false)",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of tasks to return",
            },
            dueMin: {
              type: "string",
              format: "date-time",
              description: "Minimum due date (RFC 3339 timestamp)",
            },
            dueMax: {
              type: "string",
              format: "date-time",
              description: "Maximum due date (RFC 3339 timestamp)",
            },
          },
          required: ["taskListId"],
        },
      },
      {
        name: "get-task",
        description: "Get a specific task by ID",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list containing the task",
            },
            taskId: {
              type: "string",
              description: "ID of the task to retrieve",
            },
          },
          required: ["taskListId", "taskId"],
        },
      },
      {
        name: "create-task",
        description: "Create a new task in a task list",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list to create the task in",
            },
            title: {
              type: "string",
              description: "Title of the task",
            },
            notes: {
              type: "string",
              description: "Notes or description for the task (optional)",
            },
            due: {
              type: "string",
              format: "date-time",
              description: "Due date in RFC 3339 format (optional)",
            },
            parent: {
              type: "string",
              description:
                "ID of the parent task (for hierarchical tasks, optional)",
            },
          },
          required: ["taskListId", "title"],
        },
      },
      {
        name: "update-task",
        description: "Update an existing task",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list containing the task",
            },
            taskId: {
              type: "string",
              description: "ID of the task to update",
            },
            title: {
              type: "string",
              description: "New title for the task (optional)",
            },
            notes: {
              type: "string",
              description: "New notes for the task (optional)",
            },
            due: {
              type: "string",
              format: "date-time",
              description: "New due date in RFC 3339 format (optional)",
            },
          },
          required: ["taskListId", "taskId"],
        },
      },
      {
        name: "complete-task",
        description: "Mark a task as completed",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list containing the task",
            },
            taskId: {
              type: "string",
              description: "ID of the task to mark as completed",
            },
          },
          required: ["taskListId", "taskId"],
        },
      },
      {
        name: "delete-task",
        description: "Delete a task",
        inputSchema: {
          type: "object",
          properties: {
            taskListId: {
              type: "string",
              description: "ID of the task list containing the task",
            },
            taskId: {
              type: "string",
              description: "ID of the task to delete",
            },
          },
          required: ["taskListId", "taskId"],
        },
      },
    ],
  };
}
