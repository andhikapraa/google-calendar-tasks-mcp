import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { GaxiosError } from "gaxios";
import {
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
 * Lists messages in the user's mailbox.
 */
export async function listMessages(
  client: OAuth2Client,
  args: z.infer<typeof ListMessagesArgumentsSchema>
): Promise<gmail_v1.Schema$Message[]> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });
    const response = await gmailApi.users.messages.list({
      userId: "me",
      maxResults: args.maxResults,
      labelIds: args.labelIds,
      q: args.query,
    });
    return response.data.messages || [];
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Gets a specific message.
 */
export async function getMessage(
  client: OAuth2Client,
  args: z.infer<typeof GetMessageArgumentsSchema>
): Promise<gmail_v1.Schema$Message> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });
    const response = await gmailApi.users.messages.get({
      userId: "me",
      id: args.messageId,
      format: args.format || "full",
    });
    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Helper function to create a MIME message.
 */
function createMimeMessage(
  args: z.infer<typeof SendMessageArgumentsSchema>
): string {
  let email = "";
  email += `To: ${args.to}\r\n`;
  if (args.cc) email += `Cc: ${args.cc}\r\n`;
  if (args.bcc) email += `Bcc: ${args.bcc}\r\n`;
  email += `Subject: ${args.subject}\r\n`;

  // Set content type for HTML if specified
  if (args.htmlBody) {
    email += "Content-Type: text/html; charset=utf-8\r\n";
  } else {
    email += "Content-Type: text/plain; charset=utf-8\r\n";
  }

  email += "\r\n" + args.body;

  return email;
}

/**
 * Sends an email message.
 */
export async function sendMessage(
  client: OAuth2Client,
  args: z.infer<typeof SendMessageArgumentsSchema>
): Promise<gmail_v1.Schema$Message> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    // Create MIME message
    const email = createMimeMessage(args);

    // Encode the email as base64 URL-safe
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await gmailApi.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedEmail,
      },
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Creates a draft email.
 */
export async function createDraft(
  client: OAuth2Client,
  args: z.infer<typeof CreateDraftArgumentsSchema>
): Promise<gmail_v1.Schema$Draft> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    // Create MIME message
    const email = createMimeMessage(args);

    // Encode the email as base64 URL-safe
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await gmailApi.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          raw: encodedEmail,
        },
      },
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Updates a draft email.
 */
export async function updateDraft(
  client: OAuth2Client,
  args: z.infer<typeof UpdateDraftArgumentsSchema>
): Promise<gmail_v1.Schema$Draft> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    // Get existing draft
    const existingDraft = await gmailApi.users.drafts.get({
      userId: "me",
      id: args.draftId,
    });

    // Create new MIME message with updated fields
    const messageArgs: z.infer<typeof SendMessageArgumentsSchema> = {
      to: args.to || extractHeader(existingDraft.data?.message, "To") || "",
      subject:
        args.subject ||
        extractHeader(existingDraft.data?.message, "Subject") ||
        "",
      body: args.body || "", // Need to handle this better in a real implementation
      cc: args.cc || extractHeader(existingDraft.data?.message, "Cc"),
      bcc: args.bcc || extractHeader(existingDraft.data?.message, "Bcc"),
      htmlBody: args.htmlBody,
    };

    const email = createMimeMessage(messageArgs);

    // Encode the email as base64 URL-safe
    const encodedEmail = Buffer.from(email)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const response = await gmailApi.users.drafts.update({
      userId: "me",
      id: args.draftId,
      requestBody: {
        message: {
          raw: encodedEmail,
        },
      },
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Helper function to extract a header from a message.
 */
function extractHeader(
  message: gmail_v1.Schema$Message | undefined,
  name: string
): string | undefined {
  if (!message || !message.payload || !message.payload.headers) {
    return undefined;
  }

  const header = message.payload.headers.find((h) => h.name === name);
  return header?.value || undefined;
}

/**
 * Lists all labels.
 */
export async function listLabels(
  client: OAuth2Client
): Promise<gmail_v1.Schema$Label[]> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });
    const response = await gmailApi.users.labels.list({
      userId: "me",
    });
    return response.data.labels || [];
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Creates a new label.
 */
export async function createLabel(
  client: OAuth2Client,
  args: z.infer<typeof CreateLabelArgumentsSchema>
): Promise<gmail_v1.Schema$Label> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    const labelData: gmail_v1.Schema$Label = {
      name: args.name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    };

    if (args.backgroundColor && args.textColor) {
      labelData.color = {
        backgroundColor: args.backgroundColor,
        textColor: args.textColor,
      };
    }

    const response = await gmailApi.users.labels.create({
      userId: "me",
      requestBody: labelData,
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Modifies the labels on a message.
 */
export async function modifyLabels(
  client: OAuth2Client,
  args: z.infer<typeof ModifyLabelsArgumentsSchema>
): Promise<gmail_v1.Schema$Message> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    const response = await gmailApi.users.messages.modify({
      userId: "me",
      id: args.messageId,
      requestBody: {
        addLabelIds: args.addLabelIds,
        removeLabelIds: args.removeLabelIds,
      },
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Lists threads.
 */
export async function listThreads(
  client: OAuth2Client,
  args: z.infer<typeof ListThreadsArgumentsSchema>
): Promise<gmail_v1.Schema$Thread[]> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    const response = await gmailApi.users.threads.list({
      userId: "me",
      maxResults: args.maxResults,
      labelIds: args.labelIds,
      q: args.query,
    });

    return response.data.threads || [];
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Gets a specific thread.
 */
export async function getThread(
  client: OAuth2Client,
  args: z.infer<typeof GetThreadArgumentsSchema>
): Promise<gmail_v1.Schema$Thread> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    const response = await gmailApi.users.threads.get({
      userId: "me",
      id: args.threadId,
      format: args.format || "full",
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Moves a message to trash.
 */
export async function trashMessage(
  client: OAuth2Client,
  args: z.infer<typeof TrashMessageArgumentsSchema>
): Promise<gmail_v1.Schema$Message> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    const response = await gmailApi.users.messages.trash({
      userId: "me",
      id: args.messageId,
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Permanently deletes a message.
 */
export async function deleteMessage(
  client: OAuth2Client,
  args: z.infer<typeof DeleteMessageArgumentsSchema>
): Promise<void> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    await gmailApi.users.messages.delete({
      userId: "me",
      id: args.messageId,
    });
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}

/**
 * Marks a message as read or unread.
 */
export async function markAsRead(
  client: OAuth2Client,
  args: z.infer<typeof MarkAsReadArgumentsSchema>
): Promise<gmail_v1.Schema$Message> {
  try {
    const gmailApi = google.gmail({ version: "v1", auth: client });

    // Add or remove the UNREAD label based on the 'read' parameter
    const response = await gmailApi.users.messages.modify({
      userId: "me",
      id: args.messageId,
      requestBody: {
        removeLabelIds: args.read ? ["UNREAD"] : [],
        addLabelIds: args.read ? [] : ["UNREAD"],
      },
    });

    return response.data;
  } catch (error) {
    handleGoogleApiError(error);
    throw error;
  }
}
