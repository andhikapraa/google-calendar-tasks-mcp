import { google, tasks_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { GaxiosError } from "gaxios";
import {
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
import { z } from "zod";

// Helper function to handle common GaxiosError for invalid grant
function handleGoogleApiError(error: unknown): void {
  if (
    error instanceof GaxiosError &&
    error.response?.data?.error === "invalid_grant"
  ) {
    throw new Error(
      "Google API Error: Authentication token is invalid or expired. Please re-run the authentication process (e.g., `npm run auth`)."
    );
  }
  // Re-throw other errors
  throw error;
}

/**
 * Lists all available task lists.
 */
export async function listTaskLists(
  client: OAuth2Client
): Promise<tasks_v1.Schema$TaskList[]> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const response = await tasksApi.tasklists.list();
    return response.data.items || [];
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Gets a specific task list.
 */
export async function getTaskList(
  client: OAuth2Client,
  args: z.infer<typeof GetTaskListArgumentsSchema>
): Promise<tasks_v1.Schema$TaskList> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const response = await tasksApi.tasklists.get({
      tasklist: args.taskListId,
    });
    if (!response.data) throw new Error("Task list not found");
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Creates a new task list.
 */
export async function createTaskList(
  client: OAuth2Client,
  args: z.infer<typeof CreateTaskListArgumentsSchema>
): Promise<tasks_v1.Schema$TaskList> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const response = await tasksApi.tasklists.insert({
      requestBody: {
        title: args.title,
      },
    });
    if (!response.data) throw new Error("Failed to create task list");
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Updates an existing task list.
 */
export async function updateTaskList(
  client: OAuth2Client,
  args: z.infer<typeof UpdateTaskListArgumentsSchema>
): Promise<tasks_v1.Schema$TaskList> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const response = await tasksApi.tasklists.patch({
      tasklist: args.taskListId,
      requestBody: {
        title: args.title,
      },
    });
    if (!response.data) throw new Error("Failed to update task list");
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Deletes a task list.
 */
export async function deleteTaskList(
  client: OAuth2Client,
  args: z.infer<typeof DeleteTaskListArgumentsSchema>
): Promise<void> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    await tasksApi.tasklists.delete({
      tasklist: args.taskListId,
    });
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Lists tasks in a task list.
 */
export async function listTasks(
  client: OAuth2Client,
  args: z.infer<typeof ListTasksArgumentsSchema>
): Promise<tasks_v1.Schema$Task[]> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const response = await tasksApi.tasks.list({
      tasklist: args.taskListId,
      showCompleted: args.showCompleted,
      showDeleted: args.showDeleted,
      showHidden: args.showHidden,
      maxResults: args.maxResults,
      dueMin: args.dueMin,
      dueMax: args.dueMax,
    });
    return response.data.items || [];
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Gets a specific task.
 */
export async function getTask(
  client: OAuth2Client,
  args: z.infer<typeof GetTaskArgumentsSchema>
): Promise<tasks_v1.Schema$Task> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const response = await tasksApi.tasks.get({
      tasklist: args.taskListId,
      task: args.taskId,
    });
    if (!response.data) throw new Error("Task not found");
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Creates a new task.
 */
export async function createTask(
  client: OAuth2Client,
  args: z.infer<typeof CreateTaskArgumentsSchema>
): Promise<tasks_v1.Schema$Task> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const requestBody: tasks_v1.Schema$Task = {
      title: args.title,
      notes: args.notes,
      due: args.due,
      parent: args.parent,
    };

    const response = await tasksApi.tasks.insert({
      tasklist: args.taskListId,
      requestBody: requestBody,
    });
    if (!response.data) throw new Error("Failed to create task");
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Updates an existing task.
 */
export async function updateTask(
  client: OAuth2Client,
  args: z.infer<typeof UpdateTaskArgumentsSchema>
): Promise<tasks_v1.Schema$Task> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const requestBody: tasks_v1.Schema$Task = {};

    if (args.title !== undefined) requestBody.title = args.title;
    if (args.notes !== undefined) requestBody.notes = args.notes;
    if (args.due !== undefined) requestBody.due = args.due;
    if (args.completed !== undefined) requestBody.completed = args.completed;

    const response = await tasksApi.tasks.patch({
      tasklist: args.taskListId,
      task: args.taskId,
      requestBody: requestBody,
    });
    if (!response.data) throw new Error("Failed to update task");
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Completes a task.
 */
export async function completeTask(
  client: OAuth2Client,
  args: z.infer<typeof CompleteTaskArgumentsSchema>
): Promise<tasks_v1.Schema$Task> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    const now = new Date().toISOString();

    const response = await tasksApi.tasks.patch({
      tasklist: args.taskListId,
      task: args.taskId,
      requestBody: {
        status: "completed",
        completed: now,
      },
    });
    if (!response.data) throw new Error("Failed to complete task");
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Deletes a task.
 */
export async function deleteTask(
  client: OAuth2Client,
  args: z.infer<typeof DeleteTaskArgumentsSchema>
): Promise<void> {
  try {
    const tasksApi = google.tasks({ version: "v1", auth: client });
    await tasksApi.tasks.delete({
      tasklist: args.taskListId,
      task: args.taskId,
    });
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}
