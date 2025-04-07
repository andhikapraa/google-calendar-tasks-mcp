import { z } from "zod";

// Zod schemas for input validation

export const ReminderSchema = z.object({
  method: z.enum(["email", "popup"]).default("popup"),
  minutes: z.number(),
});

export const RemindersSchema = z.object({
  useDefault: z.boolean(),
  overrides: z.array(ReminderSchema).optional(),
});

export const ListEventsArgumentsSchema = z.object({
  calendarId: z.string(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

export const SearchEventsArgumentsSchema = z.object({
  calendarId: z.string(),
  query: z.string(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

export const CreateEventArgumentsSchema = z.object({
  calendarId: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  start: z.string(), // Expecting ISO string
  end: z.string(), // Expecting ISO string
  timeZone: z.string(),
  attendees: z
    .array(
      z.object({
        email: z.string(),
      })
    )
    .optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  reminders: RemindersSchema.optional(),
  recurrence: z.array(z.string()).optional(),
});

export const UpdateEventArgumentsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  start: z.string().optional(), // Expecting ISO string
  end: z.string().optional(), // Expecting ISO string
  timeZone: z.string(), // Required even if start/end don't change, per API docs for patch
  attendees: z
    .array(
      z.object({
        email: z.string(),
      })
    )
    .optional(),
  location: z.string().optional(),
  colorId: z.string().optional(),
  reminders: RemindersSchema.optional(),
  recurrence: z.array(z.string()).optional(),
});

export const DeleteEventArgumentsSchema = z.object({
  calendarId: z.string(),
  eventId: z.string(),
});

// Google Tasks API schemas

// Task list schemas
export const ListTaskListsArgumentsSchema = z.object({});

export const GetTaskListArgumentsSchema = z.object({
  taskListId: z.string(),
});

export const CreateTaskListArgumentsSchema = z.object({
  title: z.string(),
});

export const UpdateTaskListArgumentsSchema = z.object({
  taskListId: z.string(),
  title: z.string(),
});

export const DeleteTaskListArgumentsSchema = z.object({
  taskListId: z.string(),
});

// Task schemas
export const ListTasksArgumentsSchema = z.object({
  taskListId: z.string(),
  showCompleted: z.boolean().optional(),
  showDeleted: z.boolean().optional(),
  showHidden: z.boolean().optional(),
  maxResults: z.number().optional(),
  dueMin: z.string().optional(),
  dueMax: z.string().optional(),
});

export const GetTaskArgumentsSchema = z.object({
  taskListId: z.string(),
  taskId: z.string(),
});

export const CreateTaskArgumentsSchema = z.object({
  taskListId: z.string(),
  title: z.string(),
  notes: z.string().optional(),
  due: z.string().optional(), // RFC 3339 timestamp
  parent: z.string().optional(), // Parent task ID for hierarchical tasks
});

export const UpdateTaskArgumentsSchema = z.object({
  taskListId: z.string(),
  taskId: z.string(),
  title: z.string().optional(),
  notes: z.string().optional(),
  due: z.string().optional(),
  completed: z.string().optional(), // RFC 3339 timestamp
});

export const CompleteTaskArgumentsSchema = z.object({
  taskListId: z.string(),
  taskId: z.string(),
});

export const DeleteTaskArgumentsSchema = z.object({
  taskListId: z.string(),
  taskId: z.string(),
});

// Gmail API schemas

// Message schemas
export const ListMessagesArgumentsSchema = z.object({
  maxResults: z.number().optional(),
  labelIds: z.array(z.string()).optional(),
  query: z.string().optional(),
});

export const GetMessageArgumentsSchema = z.object({
  messageId: z.string(),
  format: z.enum(["minimal", "full", "raw", "metadata"]).optional(),
});

export const SendMessageArgumentsSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  htmlBody: z.boolean().optional(), // Whether the body is HTML
});

export const CreateDraftArgumentsSchema = z.object({
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  htmlBody: z.boolean().optional(),
});

export const UpdateDraftArgumentsSchema = z.object({
  draftId: z.string(),
  to: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  htmlBody: z.boolean().optional(),
});

// Label schemas
export const ListLabelsArgumentsSchema = z.object({});

export const CreateLabelArgumentsSchema = z.object({
  name: z.string(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
});

export const ModifyLabelsArgumentsSchema = z.object({
  messageId: z.string(),
  addLabelIds: z.array(z.string()).optional(),
  removeLabelIds: z.array(z.string()).optional(),
});

// Thread schemas
export const ListThreadsArgumentsSchema = z.object({
  maxResults: z.number().optional(),
  labelIds: z.array(z.string()).optional(),
  query: z.string().optional(),
});

export const GetThreadArgumentsSchema = z.object({
  threadId: z.string(),
  format: z.enum(["minimal", "full", "metadata"]).optional(),
});

// Message management schemas
export const TrashMessageArgumentsSchema = z.object({
  messageId: z.string(),
});

export const DeleteMessageArgumentsSchema = z.object({
  messageId: z.string(),
});

export const MarkAsReadArgumentsSchema = z.object({
  messageId: z.string(),
  read: z.boolean(),
});
