// TypeScript interfaces for Google Calendar data structures

export interface CalendarListEntry {
  id?: string | null;
  summary?: string | null;
}

export interface CalendarEventReminder {
  method: "email" | "popup";
  minutes: number;
}

export interface CalendarEventAttendee {
  email?: string | null;
  responseStatus?: string | null;
}

export interface CalendarEvent {
  id?: string | null;
  summary?: string | null;
  start?: {
    dateTime?: string | null;
    date?: string | null;
    timeZone?: string | null;
  };
  end?: {
    dateTime?: string | null;
    date?: string | null;
    timeZone?: string | null;
  };
  location?: string | null;
  attendees?: CalendarEventAttendee[] | null;
  colorId?: string | null;
  reminders?: {
    useDefault: boolean;
    overrides?: CalendarEventReminder[];
  };
  recurrence?: string[] | null;
}

// TypeScript interfaces for Google Tasks data structures

export interface TaskList {
  id?: string | null;
  title?: string | null;
  updated?: string | null;
  selfLink?: string | null;
}

export interface Task {
  id?: string | null;
  title?: string | null;
  notes?: string | null;
  status?: "needsAction" | "completed" | null;
  due?: string | null;
  completed?: string | null;
  deleted?: boolean | null;
  hidden?: boolean | null;
  links?: Array<{
    type?: string | null;
    description?: string | null;
    link?: string | null;
  }> | null;
  parent?: string | null;
  position?: string | null;
}

// Gmail Types

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: Array<{
      name: string;
      value: string;
    }>;
    body?: {
      attachmentId?: string;
      size?: number;
      data?: string;
    };
    parts?: any[]; // This would be a more complex recursive structure
  };
  sizeEstimate?: number;
  raw?: string;
}

export interface GmailThread {
  id: string;
  snippet?: string;
  historyId?: string;
  messages?: GmailMessage[];
}

export interface GmailLabel {
  id: string;
  name: string;
  messageListVisibility?: string;
  labelListVisibility?: string;
  type?: string;
  color?: {
    textColor: string;
    backgroundColor: string;
  };
}

export interface GmailDraft {
  id: string;
  message: GmailMessage;
}
