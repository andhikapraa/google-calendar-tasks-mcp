/**
 * @jest-environment node
 */
// Tell TypeScript to ignore type errors in this file
// @ts-nocheck - Removing this as Vitest should handle types better
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";

// Import the types we need to mock properly
import type { google as GoogleApis } from "googleapis";
import type * as FsPromises from "fs/promises";
import type { Server as MCPServerType } from "@modelcontextprotocol/sdk/server/index.js";
import type {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { TokenManager } from "./token-manager.js";

// --- Mocks ---

// Mock process.exit
const mockProcessExit = vi
  .spyOn(process, "exit")
  .mockImplementation((() => {}) as (code?: number) => never);

// Mock googleapis
vi.mock("googleapis", async (importOriginal) => {
  const actual = await importOriginal<typeof GoogleApis>();
  return {
    google: {
      ...actual.google,
      calendar: vi.fn().mockReturnValue({
        calendarList: {
          list: vi.fn(),
        },
        events: {
          list: vi.fn(),
          insert: vi.fn(),
          patch: vi.fn(),
          delete: vi.fn(),
        },
        colors: {
          get: vi.fn(),
        },
      }),
      tasks: vi.fn().mockReturnValue({
        tasklists: {
          list: vi.fn(),
          get: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        },
        tasks: {
          list: vi.fn(),
          get: vi.fn(),
          insert: vi.fn(),
          update: vi.fn(),
          patch: vi.fn(),
          delete: vi.fn(),
        },
      }),
      gmail: vi.fn().mockReturnValue({
        users: {
          messages: {
            list: vi.fn(),
            get: vi.fn(),
            send: vi.fn(),
            trash: vi.fn(),
            delete: vi.fn(),
            modify: vi.fn(),
            import: vi.fn(),
            insert: vi.fn(),
            batchDelete: vi.fn(),
            batchModify: vi.fn(),
          },
          drafts: {
            list: vi.fn(),
            get: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            send: vi.fn(),
          },
          labels: {
            list: vi.fn(),
            get: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            patch: vi.fn(),
          },
          threads: {
            list: vi.fn(),
            get: vi.fn(),
            modify: vi.fn(),
            trash: vi.fn(),
            delete: vi.fn(),
          },
        },
      }),
    },
  };
});

// Mock fs/promises
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
  };
});

// Mock AuthServer
vi.mock("./auth-server.js", () => ({
  AuthServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock TokenManager
const mockValidateTokens = vi.fn();
vi.mock("./token-manager.js", () => ({
  TokenManager: vi.fn().mockImplementation(() => ({
    validateTokens: mockValidateTokens,
    loadSavedTokens: vi.fn().mockResolvedValue(true),
    clearTokens: vi.fn(),
  })),
}));

// Mock OAuth2Client
vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    setCredentials: vi.fn(),
    refreshAccessToken: vi.fn().mockResolvedValue({
      credentials: { access_token: "mock_access_token" },
    }),
    on: vi.fn(),
    generateAuthUrl: vi.fn().mockReturnValue("http://mockauthurl.com"),
    getToken: vi
      .fn()
      .mockResolvedValue({ tokens: { access_token: "mock_access_token" } }),
  })),
}));

// Mock utils
vi.mock("./utils.js", () => ({
  getSecureTokenPath: vi.fn().mockReturnValue("/fake/path/token.json"),
}));

// Mock MCP Server - Store handlers on the instance
vi.mock("@modelcontextprotocol/sdk/server/index.js", () => {
  return {
    Server: vi.fn().mockImplementation(() => {
      const instance = {
        setRequestHandler: vi.fn((schema: any, handler: any) => {
          // Store handlers in a map on the instance
          if (!instance.capturedHandlerMap) {
            instance.capturedHandlerMap = new Map();
          }
          instance.capturedHandlerMap.set(schema, handler);
        }),
        connect: vi.fn().mockResolvedValue(undefined),
        capturedHandlerMap: null as Map<any, Function> | null, // Property to store handlers
      };
      return instance;
    }),
  };
});

// Mock StdioServerTransport
vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})), // Simple mock
}));

// Import necessary modules AFTER mocks are set up
const { google } = await import("googleapis");
const fs = await import("fs/promises");

// Need to dynamically import the schema *after* mocking the SDK
const { CallToolRequestSchema } = await import(
  "@modelcontextprotocol/sdk/types.js"
);

// Import the module to be tested AFTER mocks
// It won't run main automatically due to the check we added
const indexModule = await import("./index.js");
const main = indexModule.main;
const server = indexModule.server as unknown as MCPServerType & {
  capturedHandlerMap: Map<any, Function> | null;
}; // Get exported server

// --- Test Suite ---

describe("Google Calendar MCP Tool Calls", () => {
  let mockCalendarApi: ReturnType<GoogleApis["calendar"]>;
  let mockTasksApi: ReturnType<GoogleApis["tasks"]>;
  let mockGmailApi: ReturnType<GoogleApis["gmail"]>;
  let callToolHandler: ((request: any) => Promise<any>) | null = null;

  beforeAll(async () => {
    // Reset mocks that might have been called during import
    vi.clearAllMocks();

    // Setup mocks needed JUST for main() to run without errors
    const mockKeys = JSON.stringify({
      installed: {
        client_id: "mock",
        client_secret: "mock",
        redirect_uris: ["mock"],
      },
    });
    const mockTokens = JSON.stringify({
      access_token: "mock",
      refresh_token: "mock",
      expiry_date: Date.now() + 999999,
    });

    // Make the mock return sequentially
    (fs.readFile as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockKeys) // For initializeOAuth2Client
      .mockResolvedValue(mockTokens); // For subsequent calls like loadSavedTokens

    (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockValidateTokens.mockResolvedValue(true);
    mockProcessExit.mockClear(); // Clear exit mock before running main

    // Run main once to set up the actual handler
    await main();

    // Capture the handler from the map on the mocked server instance
    if (server && server.capturedHandlerMap) {
      // Dynamically get the actual schema object after mocks ran
      const { CallToolRequestSchema } = await import(
        "@modelcontextprotocol/sdk/types.js"
      );
      callToolHandler = server.capturedHandlerMap.get(CallToolRequestSchema);
    }

    if (!callToolHandler) {
      console.error(
        "capturedHandlerMap on server instance:",
        server?.capturedHandlerMap
      );
      throw new Error(
        "CallTool handler not captured from server instance after main run."
      );
    }
  });

  beforeEach(() => {
    // Reset mocks before each specific test
    vi.clearAllMocks();
    mockProcessExit.mockClear(); // Clear exit mock

    // Re-apply default mock implementations needed for the tests themselves
    mockCalendarApi = google.calendar("v3") as unknown as ReturnType<
      GoogleApis["calendar"]
    >;
    mockTasksApi = google.tasks("v1") as unknown as ReturnType<
      GoogleApis["tasks"]
    >;
    mockGmailApi = google.gmail("v1") as unknown as ReturnType<
      GoogleApis["gmail"]
    >;
    mockValidateTokens.mockResolvedValue(true); // Assume authenticated by default for tests
    (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(true); // Assume token file access ok
    // readFile needs to be mocked specifically if a test case needs it beyond initialization
    (fs.readFile as ReturnType<typeof vi.fn>).mockClear(); // Clear initial readFile mocks
  });

  it("should reject if authentication is invalid (simulated)", async () => {
    // Arrange: Simulate invalid/missing tokens AFTER main has run
    // (We can't easily test the main() exit path here, so we test the handler's behavior
    // when called with a client that *would* fail API calls)

    // We don't need to mock validateTokens(false) here,
    // as the check was removed from the immediate handler call.
    // Instead, we ensure the underlying API mock is NOT set up to succeed.
    // Clear any default mocks for the API call that might exist from beforeEach
    vi.mocked(mockCalendarApi.calendarList.list).mockReset();
    // Optionally, make it explicitly reject:
    vi.mocked(mockCalendarApi.calendarList.list).mockRejectedValue(
      new Error("Simulated API auth error")
    );

    const request = {
      params: {
        name: "list-calendars",
        arguments: {},
      },
    };

    // Act & Assert: Expect the handler to reject because the underlying API call fails
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    await expect(callToolHandler(request)).rejects.toThrow(); // Check for *any* rejection
    // Optionally, check *which* api call failed or was attempted:
    // expect(mockCalendarApi.calendarList.list).toHaveBeenCalled(); // Verify it got called
  });

  it('should handle "list-calendars" tool call', async () => {
    // Arrange
    const mockCalendarList = [
      { id: "cal1", summary: "Work Calendar" },
      { id: "cal2", summary: "Personal" },
    ];
    // Use type assertion for the mocked API calls
    (
      mockCalendarApi.calendarList.list as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: { items: mockCalendarList },
    });

    const request = {
      params: {
        name: "list-calendars",
        arguments: {},
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockCalendarApi.calendarList.list).toHaveBeenCalled();
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Work Calendar (cal1)\nPersonal (cal2)",
        },
      ],
    });
  });

  it('should handle "create-event" tool call with valid arguments', async () => {
    // Arrange
    const mockEventArgs = {
      calendarId: "primary",
      summary: "Team Meeting",
      description: "Discuss project progress",
      start: "2024-08-15T10:00:00-07:00",
      end: "2024-08-15T11:00:00-07:00",
      timeZone: "America/Los_Angeles",
      attendees: [{ email: "test@example.com" }],
      location: "Conference Room 4",
      colorId: "5", // Example color ID
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 15 }],
      },
      recurrence: ["RRULE:FREQ=WEEKLY;COUNT=5"],
    };
    const mockApiResponse = {
      id: "eventId123",
      summary: mockEventArgs.summary,
    };
    (
      mockCalendarApi.events.insert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: mockApiResponse });

    const request = {
      params: {
        name: "create-event",
        arguments: mockEventArgs,
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockCalendarApi.events.insert).toHaveBeenCalledWith({
      calendarId: mockEventArgs.calendarId,
      requestBody: {
        summary: mockEventArgs.summary,
        description: mockEventArgs.description,
        start: {
          dateTime: mockEventArgs.start,
          timeZone: mockEventArgs.timeZone,
        },
        end: { dateTime: mockEventArgs.end, timeZone: mockEventArgs.timeZone },
        attendees: mockEventArgs.attendees,
        location: mockEventArgs.location,
        colorId: mockEventArgs.colorId,
        reminders: mockEventArgs.reminders,
        recurrence: mockEventArgs.recurrence,
      },
    });
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: `Event created: ${mockApiResponse.summary} (${mockApiResponse.id})`,
        },
      ],
    });
  });

  it('should handle "create-event" argument validation failure (missing required field)', async () => {
    // Arrange: Missing 'start' which is required
    const invalidEventArgs = {
      calendarId: "primary",
      summary: "Incomplete Meeting",
      end: "2024-08-15T11:00:00-07:00",
      timeZone: "America/Los_Angeles",
    };

    const request = {
      params: {
        name: "create-event",
        arguments: invalidEventArgs,
      },
    };

    // Act & Assert: Expect Zod validation error
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    await expect(callToolHandler(request)).rejects.toThrow();
  });

  it('should handle "list-events" with timeMin and timeMax', async () => {
    // Arrange
    const listEventsArgs = {
      calendarId: "primary",
      timeMin: "2024-08-01T00:00:00Z",
      timeMax: "2024-08-31T23:59:59Z",
    };

    const mockEvents = [
      {
        id: "event1",
        summary: "Meeting",
        start: { dateTime: "2024-08-15T10:00:00Z" },
        end: { dateTime: "2024-08-15T11:00:00Z" },
      },
      {
        id: "event2",
        summary: "Lunch",
        start: { dateTime: "2024-08-15T12:00:00Z" },
        end: { dateTime: "2024-08-15T13:00:00Z" },
        location: "Cafe",
      },
    ];

    (mockCalendarApi.events.list as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        data: { items: mockEvents },
      }
    );

    const request = {
      params: {
        name: "list-events",
        arguments: listEventsArgs,
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockCalendarApi.events.list).toHaveBeenCalledWith({
      calendarId: listEventsArgs.calendarId,
      timeMin: listEventsArgs.timeMin,
      timeMax: listEventsArgs.timeMax,
      singleEvents: true,
      orderBy: "startTime",
    });

    expect(result.content[0].text).toContain("Meeting (event1)");
    expect(result.content[0].text).toContain("Lunch (event2)");
    expect(result.content[0].text).toContain("Location: Cafe");
  });

  it('should handle "search-events" tool call', async () => {
    // Arrange
    const searchEventsArgs = {
      calendarId: "primary",
      query: "meeting",
      timeMin: "2024-08-01T00:00:00Z",
    };

    const mockEvents = [
      {
        id: "event1",
        summary: "Team Meeting",
        start: { dateTime: "2024-08-15T10:00:00Z" },
        end: { dateTime: "2024-08-15T11:00:00Z" },
      },
    ];

    (mockCalendarApi.events.list as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        data: { items: mockEvents },
      }
    );

    const request = {
      params: {
        name: "search-events",
        arguments: searchEventsArgs,
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockCalendarApi.events.list).toHaveBeenCalledWith({
      calendarId: searchEventsArgs.calendarId,
      q: searchEventsArgs.query,
      timeMin: searchEventsArgs.timeMin,
      timeMax: undefined,
      singleEvents: true,
      orderBy: "startTime",
    });

    expect(result.content[0].text).toContain("Team Meeting (event1)");
  });

  it('should handle "delete-event" tool call', async () => {
    // Arrange
    const deleteEventArgs = {
      calendarId: "primary",
      eventId: "event123",
    };

    (
      mockCalendarApi.events.delete as ReturnType<typeof vi.fn>
    ).mockResolvedValue({});

    const request = {
      params: {
        name: "delete-event",
        arguments: deleteEventArgs,
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockCalendarApi.events.delete).toHaveBeenCalledWith({
      calendarId: deleteEventArgs.calendarId,
      eventId: deleteEventArgs.eventId,
    });

    expect(result.content[0].text).toBe("Event deleted successfully");
  });

  it('should handle "list-colors" tool call', async () => {
    // Arrange
    const mockColorsResponse = {
      event: {
        "1": { background: "#a4bdfc", foreground: "#1d1d1d" },
        "2": { background: "#7ae7bf", foreground: "#1d1d1d" },
      },
    };
    (mockCalendarApi.colors.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockColorsResponse,
    });

    const request = {
      params: {
        name: "list-colors",
        arguments: {},
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockCalendarApi.colors.get).toHaveBeenCalled();
    expect(result.content[0].text).toContain("Available event colors:");
    expect(result.content[0].text).toContain(
      "Color ID: 1 - #a4bdfc (background) / #1d1d1d (foreground)"
    );
    expect(result.content[0].text).toContain(
      "Color ID: 2 - #7ae7bf (background) / #1d1d1d (foreground)"
    );
  });

  it('should handle "update-event" tool call', async () => {
    // Arrange
    const updateEventArgs = {
      calendarId: "primary",
      eventId: "eventToUpdate123",
      summary: "Updated Team Meeting",
      location: "New Conference Room",
      start: "2024-08-15T10:30:00-07:00",
      // Missing end, but timezone provided
      timeZone: "America/Los_Angeles",
      colorId: "9",
    };
    const mockApiResponse = {
      id: updateEventArgs.eventId,
      summary: updateEventArgs.summary,
      location: updateEventArgs.location,
      start: {
        dateTime: updateEventArgs.start,
        timeZone: updateEventArgs.timeZone,
      },
      colorId: updateEventArgs.colorId,
    };
    (
      mockCalendarApi.events.patch as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ data: mockApiResponse });

    const request = {
      params: {
        name: "update-event",
        arguments: updateEventArgs,
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockCalendarApi.events.patch).toHaveBeenCalledWith({
      calendarId: updateEventArgs.calendarId,
      eventId: updateEventArgs.eventId,
      requestBody: {
        summary: updateEventArgs.summary,
        location: updateEventArgs.location,
        start: {
          dateTime: updateEventArgs.start,
          timeZone: updateEventArgs.timeZone,
        },
        end: { timeZone: updateEventArgs.timeZone }, // Service layer adds timezone to end
        colorId: updateEventArgs.colorId,
      },
    });
    expect(result.content[0].text).toBe(
      `Event updated: ${mockApiResponse.summary} (${mockApiResponse.id})`
    );
  });

  it('should handle "update-event" argument validation failure (missing eventId)', async () => {
    // Arrange: Missing 'eventId' which is required
    const invalidEventArgs = {
      calendarId: "primary",
      summary: "Update without ID",
      timeZone: "America/Los_Angeles", // timezone is also required by schema
    };

    const request = {
      params: {
        name: "update-event",
        arguments: invalidEventArgs,
      },
    };

    // Act & Assert: Expect Zod validation error
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    await expect(callToolHandler(request)).rejects.toThrow(); // ZodError
  });

  // TODO: Add more tests for:
  // - Argument validation failures for other tools
});

describe("Google Gmail MCP Tool Calls", () => {
  let mockGmailApi: ReturnType<GoogleApis["gmail"]>;
  let callToolHandler: ((request: any) => Promise<any>) | null = null;

  beforeAll(async () => {
    // Reset mocks that might have been called during import
    vi.clearAllMocks();

    // Setup mocks needed JUST for main() to run without errors
    const mockKeys = JSON.stringify({
      installed: {
        client_id: "mock",
        client_secret: "mock",
        redirect_uris: ["mock"],
      },
    });
    const mockTokens = JSON.stringify({
      access_token: "mock",
      refresh_token: "mock",
      expiry_date: Date.now() + 999999,
    });

    // Make the mock return sequentially
    (fs.readFile as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockKeys) // For initializeOAuth2Client
      .mockResolvedValue(mockTokens); // For subsequent calls like loadSavedTokens

    (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockValidateTokens.mockResolvedValue(true);
    mockProcessExit.mockClear(); // Clear exit mock before running main

    // Run main once to set up the actual handler
    await main();

    // Capture the handler from the map on the mocked server instance
    if (server && server.capturedHandlerMap) {
      // Dynamically get the actual schema object after mocks ran
      const { CallToolRequestSchema } = await import(
        "@modelcontextprotocol/sdk/types.js"
      );
      callToolHandler = server.capturedHandlerMap.get(CallToolRequestSchema);
    }

    if (!callToolHandler) {
      console.error(
        "capturedHandlerMap on server instance:",
        server?.capturedHandlerMap
      );
      throw new Error(
        "CallTool handler not captured from server instance after main run."
      );
    }
  });

  beforeEach(() => {
    // Reset mocks before each specific test
    vi.clearAllMocks();
    mockProcessExit.mockClear(); // Clear exit mock

    // Re-apply default mock implementations needed for the tests themselves
    mockGmailApi = google.gmail("v1") as unknown as ReturnType<
      GoogleApis["gmail"]
    >;
    mockValidateTokens.mockResolvedValue(true); // Assume authenticated by default for tests
    (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(true); // Assume token file access ok
    (fs.readFile as ReturnType<typeof vi.fn>).mockClear(); // Clear initial readFile mocks
  });

  it('should handle "list-messages" tool call', async () => {
    // Arrange
    const mockMessages = [
      { id: "msg1", threadId: "thread1" },
      { id: "msg2", threadId: "thread2" },
    ];

    (
      mockGmailApi.users.messages.list as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: { messages: mockMessages, nextPageToken: null },
    });

    const request = {
      params: {
        name: "list-messages",
        arguments: {
          maxResults: 10,
          query: "from:example@gmail.com",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockGmailApi.users.messages.list).toHaveBeenCalledWith({
      userId: "me",
      maxResults: 10,
      q: "from:example@gmail.com",
      labelIds: undefined,
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("msg1"),
        },
      ],
    });
  });

  it('should handle "get-message" tool call', async () => {
    // Arrange
    const mockMessage = {
      id: "msg123",
      threadId: "thread123",
      snippet: "Email preview...",
      payload: {
        headers: [
          { name: "From", value: "sender@example.com" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: "Important Message" },
          { name: "Date", value: "Mon, 1 Jan 2023 10:00:00 +0000" },
        ],
        mimeType: "text/plain",
        body: {
          data: Buffer.from("This is the email body content").toString(
            "base64"
          ),
        },
      },
    };

    (
      mockGmailApi.users.messages.get as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: mockMessage,
    });

    const request = {
      params: {
        name: "get-message",
        arguments: {
          messageId: "msg123",
          format: "full",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockGmailApi.users.messages.get).toHaveBeenCalledWith({
      userId: "me",
      id: "msg123",
      format: "full",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Important Message"),
        },
      ],
    });
  });

  it('should handle "send-message" tool call', async () => {
    // Arrange
    const mockSentMessage = {
      id: "sentMsg123",
      threadId: "thread123",
      labelIds: ["SENT"],
    };

    (
      mockGmailApi.users.messages.send as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: mockSentMessage,
    });

    const request = {
      params: {
        name: "send-message",
        arguments: {
          to: "recipient@example.com",
          subject: "Test Subject",
          body: "Test Body Content",
          cc: "cc@example.com",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockGmailApi.users.messages.send).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "me",
        requestBody: expect.objectContaining({
          raw: expect.any(String), // Base64 encoded email
        }),
      })
    );

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: `Email sent successfully. Message ID: ${mockSentMessage.id}`,
        },
      ],
    });
  });

  it('should handle "create-draft" tool call', async () => {
    // Arrange
    const mockDraft = {
      id: "draft123",
      message: {
        id: "msg456",
        threadId: "thread456",
      },
    };

    (
      mockGmailApi.users.drafts.create as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: mockDraft,
    });

    const request = {
      params: {
        name: "create-draft",
        arguments: {
          to: "recipient@example.com",
          subject: "Draft Subject",
          body: "Draft Body Content",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockGmailApi.users.drafts.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "me",
        requestBody: expect.objectContaining({
          message: expect.objectContaining({
            raw: expect.any(String), // Base64 encoded email
          }),
        }),
      })
    );

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Draft created successfully"),
        },
      ],
    });
  });

  it('should handle "list-labels" tool call', async () => {
    // Arrange
    const mockLabels = [
      { id: "label1", name: "Important", type: "user" },
      { id: "label2", name: "Work", type: "user" },
      { id: "INBOX", name: "Inbox", type: "system" },
    ];

    (
      mockGmailApi.users.labels.list as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: { labels: mockLabels },
    });

    const request = {
      params: {
        name: "list-labels",
        arguments: {},
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockGmailApi.users.labels.list).toHaveBeenCalledWith({
      userId: "me",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Important"),
        },
      ],
    });
  });

  it('should handle "modify-labels" tool call', async () => {
    // Arrange
    const modifiedMessage = {
      id: "msg123",
      labelIds: ["INBOX", "STARRED", "label1"],
    };

    (
      mockGmailApi.users.messages.modify as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: modifiedMessage,
    });

    const request = {
      params: {
        name: "modify-labels",
        arguments: {
          messageId: "msg123",
          addLabelIds: ["STARRED", "label1"],
          removeLabelIds: ["UNREAD"],
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockGmailApi.users.messages.modify).toHaveBeenCalledWith({
      userId: "me",
      id: "msg123",
      requestBody: {
        addLabelIds: ["STARRED", "label1"],
        removeLabelIds: ["UNREAD"],
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: `Labels modified successfully for message ID: ${modifiedMessage.id}`,
        },
      ],
    });
  });

  it('should handle "trash-message" tool call', async () => {
    // Arrange
    const trashedMessage = {
      id: "msg123",
      labelIds: ["TRASH"],
    };

    (
      mockGmailApi.users.messages.trash as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: trashedMessage,
    });

    const request = {
      params: {
        name: "trash-message",
        arguments: {
          messageId: "msg123",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockGmailApi.users.messages.trash).toHaveBeenCalledWith({
      userId: "me",
      id: "msg123",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: `Message msg123 moved to trash`,
        },
      ],
    });
  });
});

describe("Google Tasks MCP Tool Calls", () => {
  let mockTasksApi: ReturnType<GoogleApis["tasks"]>;
  let callToolHandler: ((request: any) => Promise<any>) | null = null;

  beforeAll(async () => {
    // Reset mocks that might have been called during import
    vi.clearAllMocks();

    // Setup mocks needed JUST for main() to run without errors
    const mockKeys = JSON.stringify({
      installed: {
        client_id: "mock",
        client_secret: "mock",
        redirect_uris: ["mock"],
      },
    });
    const mockTokens = JSON.stringify({
      access_token: "mock",
      refresh_token: "mock",
      expiry_date: Date.now() + 999999,
    });

    // Make the mock return sequentially
    (fs.readFile as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(mockKeys) // For initializeOAuth2Client
      .mockResolvedValue(mockTokens); // For subsequent calls like loadSavedTokens

    (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    mockValidateTokens.mockResolvedValue(true);
    mockProcessExit.mockClear(); // Clear exit mock before running main

    // Run main once to set up the actual handler
    await main();

    // Capture the handler from the map on the mocked server instance
    if (server && server.capturedHandlerMap) {
      // Dynamically get the actual schema object after mocks ran
      const { CallToolRequestSchema } = await import(
        "@modelcontextprotocol/sdk/types.js"
      );
      callToolHandler = server.capturedHandlerMap.get(CallToolRequestSchema);
    }

    if (!callToolHandler) {
      console.error(
        "capturedHandlerMap on server instance:",
        server?.capturedHandlerMap
      );
      throw new Error(
        "CallTool handler not captured from server instance after main run."
      );
    }
  });

  beforeEach(() => {
    // Reset mocks before each specific test
    vi.clearAllMocks();
    mockProcessExit.mockClear(); // Clear exit mock

    // Re-apply default mock implementations needed for the tests themselves
    mockTasksApi = google.tasks("v1") as unknown as ReturnType<
      GoogleApis["tasks"]
    >;
    mockValidateTokens.mockResolvedValue(true); // Assume authenticated by default for tests
    (fs.access as ReturnType<typeof vi.fn>).mockResolvedValue(true); // Assume token file access ok
    (fs.readFile as ReturnType<typeof vi.fn>).mockClear(); // Clear initial readFile mocks
  });

  it('should handle "list-task-lists" tool call', async () => {
    // Arrange
    const mockTaskLists = [
      { id: "list1", title: "Work Tasks" },
      { id: "list2", title: "Personal Tasks" },
    ];

    (mockTasksApi.tasklists.list as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        data: { items: mockTaskLists },
      }
    );

    const request = {
      params: {
        name: "list-task-lists",
        arguments: {},
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockTasksApi.tasklists.list).toHaveBeenCalled();

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Work Tasks (list1)"),
        },
      ],
    });
  });

  it('should handle "get-task-list" tool call', async () => {
    // Arrange
    const mockTaskList = {
      id: "list1",
      title: "Work Tasks",
      updated: "2023-01-01T10:00:00.000Z",
    };

    (mockTasksApi.tasklists.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockTaskList,
    });

    const request = {
      params: {
        name: "get-task-list",
        arguments: {
          taskListId: "list1",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockTasksApi.tasklists.get).toHaveBeenCalledWith({
      tasklist: "list1",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Work Tasks"),
        },
      ],
    });
  });

  it('should handle "create-task-list" tool call', async () => {
    // Arrange
    const mockCreatedTaskList = {
      id: "newlist1",
      title: "New Task List",
    };

    (
      mockTasksApi.tasklists.insert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      data: mockCreatedTaskList,
    });

    const request = {
      params: {
        name: "create-task-list",
        arguments: {
          title: "New Task List",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockTasksApi.tasklists.insert).toHaveBeenCalledWith({
      requestBody: {
        title: "New Task List",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Task list created"),
        },
      ],
    });
  });

  it('should handle "list-tasks" tool call', async () => {
    // Arrange
    const mockTasks = [
      {
        id: "task1",
        title: "Complete project",
        notes: "Important deadline",
        due: "2023-12-31T23:59:59.000Z",
        completed: null,
      },
      {
        id: "task2",
        title: "Buy groceries",
        notes: "Milk, eggs, bread",
        due: null,
        completed: "2023-01-01T18:00:00.000Z",
      },
    ];

    (mockTasksApi.tasks.list as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { items: mockTasks },
    });

    const request = {
      params: {
        name: "list-tasks",
        arguments: {
          taskListId: "list1",
          showCompleted: true,
          showHidden: false,
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockTasksApi.tasks.list).toHaveBeenCalledWith({
      tasklist: "list1",
      showCompleted: true,
      showHidden: false,
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Complete project (task1)"),
        },
      ],
    });
  });

  it('should handle "create-task" tool call', async () => {
    // Arrange
    const mockCreatedTask = {
      id: "newtask1",
      title: "New Task",
      notes: "Task details",
      due: "2023-12-31T23:59:59.000Z",
    };

    (mockTasksApi.tasks.insert as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockCreatedTask,
    });

    const request = {
      params: {
        name: "create-task",
        arguments: {
          taskListId: "list1",
          title: "New Task",
          notes: "Task details",
          due: "2023-12-31T23:59:59.000Z",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockTasksApi.tasks.insert).toHaveBeenCalledWith({
      tasklist: "list1",
      requestBody: {
        title: "New Task",
        notes: "Task details",
        due: "2023-12-31T23:59:59.000Z",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Task created"),
        },
      ],
    });
  });

  it('should handle "update-task" tool call', async () => {
    // Arrange
    const mockUpdatedTask = {
      id: "task1",
      title: "Updated Task Title",
      notes: "Updated notes",
      due: "2023-12-15T23:59:59.000Z",
      completed: "2023-12-10T10:00:00.000Z",
    };

    (mockTasksApi.tasks.patch as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockUpdatedTask,
    });

    const request = {
      params: {
        name: "update-task",
        arguments: {
          taskListId: "list1",
          taskId: "task1",
          title: "Updated Task Title",
          notes: "Updated notes",
          due: "2023-12-15T23:59:59.000Z",
          completed: "2023-12-10T10:00:00.000Z",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockTasksApi.tasks.patch).toHaveBeenCalledWith({
      tasklist: "list1",
      task: "task1",
      requestBody: {
        title: "Updated Task Title",
        notes: "Updated notes",
        due: "2023-12-15T23:59:59.000Z",
        completed: "2023-12-10T10:00:00.000Z",
      },
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: `Task updated: ${mockUpdatedTask.title} (${mockUpdatedTask.id})`,
        },
      ],
    });
  });

  it('should handle "delete-task" tool call', async () => {
    // Arrange
    (mockTasksApi.tasks.delete as ReturnType<typeof vi.fn>).mockResolvedValue(
      {}
    );

    const request = {
      params: {
        name: "delete-task",
        arguments: {
          taskListId: "list1",
          taskId: "task1",
        },
      },
    };

    // Act
    if (!callToolHandler) throw new Error("callToolHandler not captured");
    const result = await callToolHandler(request);

    // Assert
    expect(mockTasksApi.tasks.delete).toHaveBeenCalledWith({
      tasklist: "list1",
      task: "task1",
    });

    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: expect.stringContaining("Task deleted successfully"),
        },
      ],
    });
  });
});
