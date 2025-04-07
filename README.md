# Google Calendar and Tasks MCP Server

This is a Model Context Protocol (MCP) server that provides integration with Google Calendar and Google Tasks. It allows LLMs to read, create, update and search for calendar events as well as manage task lists and tasks through a standardized interface.

## Example Usage

Along with the normal capabilities you would expect for a calendar integration you can also do really dynamic, multi-step processes like:

1. Add events from screenshots and images:
   ```
   Add this event to my calendar based on the attached screenshot.
   ```
   Supported image formats: PNG, JPEG, GIF
   Images can contain event details like date, time, location, and description
2. Calendar analysis:
   ```
   What events do I have coming up this week that aren't part of my usual routine?
   ```
3. Check attendance:
   ```
   Which events tomorrow have attendees who have not accepted the invitation?
   ```
4. Auto coordinate events:
   ```
   Here's some available that was provided to me by someone.
   Take a look at the available times and create an event that is free on my work calendar.
   ```
5. Provide your own availability:
   ```
   Please provide availability looking at both my personal and work calendar for this upcoming week.
   Choose times that work well for normal working hours on the East Coast. Meeting time is 1 hour
   ```

## Google Tasks Capabilities

With the Google Tasks integration, you can:

1. Manage task lists:

   ```
   Create a new task list called "Work Projects"
   ```

2. Add tasks with due dates:

   ```
   Add a task "Finish project proposal" to my "Work" task list due next Monday
   ```

3. Organize hierarchical tasks:

   ```
   Create a subtask "Research competing products" under my "Finish project proposal" task
   ```

4. Track task completion:

   ```
   Mark the "Submit expense report" task as completed
   ```

5. Search and filter tasks:
   ```
   Show me all incomplete tasks due this week
   ```

## Requirements

1. Node.js (Latest LTS recommended)
2. TypeScript 5.3 or higher
3. A Google Cloud project with the Calendar API and Tasks API enabled
4. OAuth 2.0 credentials (Client ID and Client Secret)

## Google Cloud Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one.
3. Enable the [Google Calendar API](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com) and [Google Tasks API](https://console.cloud.google.com/apis/library/tasks.googleapis.com) for your project. Ensure that the right project is selected from the top bar before enabling the APIs.
4. Create OAuth 2.0 credentials:
   - Go to Credentials
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "User data" for the type of data that the app will be accessing
   - Add your app name and contact information
   - Add the following scopes:
     - `https://www.googleapis.com/auth/calendar` (for Calendar access)
     - `https://www.googleapis.com/auth/tasks` (for Tasks access)
   - Select "Desktop app" as the application type
   - Add your email address as a test user under the [OAuth Consent screen](https://console.cloud.google.com/apis/credentials/consent)
     - Note: it will take a few minutes for the test user to be added. The OAuth consent will not allow you to proceed until the test user has propogated.
     - Note about test mode: While an app is in test mode the auth tokens will expire after 1 week and need to be refreshed by running `npm run auth`.

## Installation

1. Clone the repository
2. Install dependencies (this also builds the js via postinstall):
   ```bash
   npm install
   ```
3. Download your Google OAuth credentials from the Google Cloud Console (under "Credentials") and rename the file to `gcp-oauth.keys.json` and place it in the root directory of the project.
   - Ensure the file contains credentials for a "Desktop app".
   - Alternatively, copy the provided template file: `cp gcp-oauth.keys.example.json gcp-oauth.keys.json` and populate it with your credentials from the Google Cloud Console.

## Available Scripts

- `npm run build` - Build the TypeScript code (compiles `src` to `build`)
- `npm run typecheck` - Run TypeScript type checking without compiling
- `npm run start` - Start the compiled server (using `node build/index.js`)
- `npm run dev` - Start the server in development mode using ts-node (watches for changes)
- `npm run auth` - Manually start the authentication server for Google OAuth flow (useful if automatic flow fails or for testing)
- `npm test` - Run the unit/integration test suite using Vitest
- `npm run test:watch` - Run tests in watch mode
- `npm run coverage` - Run tests and generate a coverage report

## Authentication

The server supports both automatic and manual authentication flows:

### Automatic Authentication (Recommended)

1. Place your Google OAuth credentials in `gcp-oauth.keys.json`.
2. Start the MCP server: `npm start` or `npm run dev`.
3. If no valid authentication tokens are found in `.gcp-saved-tokens.json`, the server will automatically:
   - Start an authentication server (on ports 3000-3004 by default)
   - Open a browser window for the OAuth flow
   - Save the tokens securely to `.gcp-saved-tokens.json` once authenticated
   - Shut down the auth server
   - Continue normal MCP server operation

The server automatically manages token refresh.

### Manual Authentication

Run `npm run auth` to start only the authentication server. Authenticate via the browser, and the tokens will be saved.

## Testing

Unit and integration tests are implemented using [Vitest](https://vitest.dev/).

- Run tests: `npm test`
- Run tests in watch mode: `npm run test:watch`
- Generate coverage report: `npm run coverage`

Tests mock external dependencies (Google API, filesystem) to ensure isolated testing of server logic and handlers.

## Security Notes

- The server runs locally and requires OAuth authentication.
- OAuth credentials (`gcp-oauth.keys.json`) and saved tokens (`.gcp-saved-tokens.json`) should **never** be committed to version control. Ensure they are added to your `.gitignore` file.
- For production use, consider getting your OAuth application verified by Google.

## Usage with Claude Desktop

1. Add this configuration to your Claude Desktop config file. E.g. `/Users/<user>/Library/Application Support/Claude/claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "google-calendar-tasks": {
         "command": "node",
         "args": ["<absolute-path-to-project-folder>/build/index.js"]
       }
     }
   }
   ```

   Note: Replace `<absolute-path-to-project-folder>` with the actual path to your project directory.

2. Restart Claude Desktop

## Development

### Troubleshooting

1. OAuth Token expires after one week (7 days)

   - If your Google Cloud app is in testing mode, tokens expire weekly. Re-authenticate by running `npm run auth` or restarting the server.

2. OAuth Token Errors / Authentication Failures
   - Ensure `gcp-oauth.keys.json` exists in the project root and contains valid Desktop App credentials.
   - Try deleting `.gcp-saved-tokens.json` and re-authenticating.
   - Check the Google Cloud Console to ensure the Calendar API is enabled and your user is listed as a test user if the app is in testing mode.
   - Verify no other process is using ports 3000-3004 when the auth server needs to start.
3. Build Errors
   - Run `npm install` again.
   - Check Node.js version.
   - Delete the `build/` directory and run `npm run build`.

## License

MIT
