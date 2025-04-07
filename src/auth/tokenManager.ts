import { OAuth2Client, Credentials } from "google-auth-library";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import { getSecureTokenPath } from "./utils.js";
import { GaxiosError } from "gaxios";

// Define shutdown phases
enum ShutdownPhase {
  RUNNING = "running",
  PREPARING = "preparing",
  FINALIZING = "finalizing",
  COMPLETE = "complete",
}

// Utility for managing temporary files
class TempFileManager {
  private tempFiles: Map<string, string> = new Map(); // path -> operation id

  async createTempFile(baseFile: string, operationId: string): Promise<string> {
    const tempPath = `${baseFile}.${Date.now()}.${Math.random()
      .toString(36)
      .substring(2)}.tmp`;
    this.tempFiles.set(tempPath, operationId);
    return tempPath;
  }

  isTemporaryFile(path: string): boolean {
    return this.tempFiles.has(path);
  }

  releaseTemporaryFile(path: string): void {
    this.tempFiles.delete(path);
  }

  async cleanupAllTemporaryFiles(): Promise<void> {
    const tempPaths = Array.from(this.tempFiles.keys());
    console.error(`Cleaning up ${tempPaths.length} temporary files`);

    for (const tempPath of tempPaths) {
      try {
        await fs.access(tempPath).then(
          async () => {
            await fs.unlink(tempPath);
            console.error(`Cleaned up temp file: ${tempPath}`);
          },
          () => {
            // File doesn't exist, skip
          }
        );
        this.tempFiles.delete(tempPath);
      } catch (error) {
        console.error(`Error cleaning up temp file ${tempPath}:`, error);
      }
    }
  }
}

// Simple file locking mechanism
class FileLock {
  private locks: Map<string, boolean> = new Map();

  async acquire(filePath: string, timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (!this.locks.has(filePath)) {
        this.locks.set(filePath, true);
        return true;
      }
      // Small delay before retrying
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return false; // Failed to acquire lock within timeout
  }

  release(filePath: string): void {
    this.locks.delete(filePath);
  }

  async withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const lockAcquired = await this.acquire(filePath);
    if (!lockAcquired) {
      throw new Error(`Failed to acquire lock for ${filePath}`);
    }

    try {
      return await operation();
    } finally {
      this.release(filePath);
    }
  }
}

// Utility for retrying operations
async function withRetry<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 300
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      console.error(
        `Operation failed (attempt ${attempt + 1}/${retries}):`,
        error
      );

      // Skip delay on last attempt
      if (attempt < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Enhanced operation tracking
interface Operation<T> {
  id: string;
  promise: Promise<T>;
  status: "pending" | "in-progress" | "completed" | "failed";
  resources: string[]; // e.g., temp file paths
  startTime: number;
}

export class TokenManager {
  private oauth2Client: OAuth2Client;
  private tokenPath: string;
  private shutdownPhase: ShutdownPhase = ShutdownPhase.RUNNING;
  private pendingOperations: Map<string, Operation<any>> = new Map();
  private tokenListener: ((tokens: Credentials) => void) | null = null;
  private fileLock: FileLock = new FileLock();
  private tempFileManager: TempFileManager = new TempFileManager();

  constructor(oauth2Client: OAuth2Client) {
    this.oauth2Client = oauth2Client;
    this.tokenPath = getSecureTokenPath();
    this.setupTokenRefresh();
  }

  // Add a method to mark the manager as shutting down
  async markAsShuttingDown(): Promise<void> {
    // Skip if already in shutdown
    if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
      console.error(`Already in shutdown phase: ${this.shutdownPhase}`);
      return;
    }

    // Phase 1: Preparing - Stop accepting new operations
    this.shutdownPhase = ShutdownPhase.PREPARING;
    console.error("Token manager preparing for shutdown");

    // Remove any token listeners
    this.removeTokenListener();

    // Wait for pending operations with a reasonable timeout
    await this.waitForPendingOperations(3000);

    // Phase 2: Finalizing - Cleanup temporary resources
    this.shutdownPhase = ShutdownPhase.FINALIZING;
    console.error("Token manager finalizing shutdown");

    // Clean up any temporary files
    await this.tempFileManager.cleanupAllTemporaryFiles();

    // Phase 3: Complete
    this.shutdownPhase = ShutdownPhase.COMPLETE;
    console.error("Token manager shutdown complete");
  }

  // Register an operation with the pending operations map
  private registerOperation<T>(
    id: string,
    operation: Promise<T>,
    resources: string[] = []
  ): Promise<T> {
    // Don't register new operations if shutting down
    if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
      console.error(
        `Rejecting new operation ${id} during shutdown phase: ${this.shutdownPhase}`
      );
      return Promise.reject(
        new Error(
          `Cannot start new operations during shutdown phase: ${this.shutdownPhase}`
        )
      );
    }

    const op: Operation<T> = {
      id,
      promise: operation,
      status: "pending",
      resources,
      startTime: Date.now(),
    };

    // Update status when operation starts
    op.status = "in-progress";

    const trackedOperation = operation
      .then((result) => {
        // Update status and clean up on completion
        op.status = "completed";
        this.pendingOperations.delete(id);
        return result;
      })
      .catch((error) => {
        // Update status and clean up on failure
        op.status = "failed";
        this.pendingOperations.delete(id);
        throw error;
      });

    this.pendingOperations.set(id, op);
    return trackedOperation;
  }

  // Wait for all pending operations to complete
  private async waitForPendingOperations(
    timeout: number = 2000
  ): Promise<void> {
    if (this.pendingOperations.size === 0) return;

    console.error(
      `Waiting for ${this.pendingOperations.size} pending token operations...`
    );

    // Log the pending operations
    for (const [id, op] of this.pendingOperations.entries()) {
      console.error(
        `  - ${id} (status: ${op.status}, started: ${new Date(
          op.startTime
        ).toISOString()})`
      );
    }

    const operations = Array.from(this.pendingOperations.values());

    // Add timeout to avoid waiting forever
    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => {
        console.error(`Timeout waiting for operations after ${timeout}ms`);
        resolve(null);
      }, timeout)
    );

    // Wait for all operations or timeout
    await Promise.race([
      Promise.all(operations.map((op) => op.promise.catch((e) => e))), // Catch errors to prevent rejection
      timeoutPromise,
    ]);

    if (this.pendingOperations.size > 0) {
      console.error(
        `Timed out waiting for ${this.pendingOperations.size} token operations`
      );
      // Log operations that are still pending
      for (const [id, op] of this.pendingOperations.entries()) {
        console.error(`  - ${id} still ${op.status} after timeout`);
        // Force cleanup of resources even if operation is still running
        for (const resource of op.resources) {
          if (this.tempFileManager.isTemporaryFile(resource)) {
            console.error(`    Cleaning up resource: ${resource}`);
            this.tempFileManager.releaseTemporaryFile(resource);
            await fs.unlink(resource).catch(() => {});
          }
        }
      }
    }
  }

  // Remove the token event listener
  private removeTokenListener(): void {
    if (this.tokenListener) {
      this.oauth2Client.removeListener("tokens", this.tokenListener);
      this.tokenListener = null;
      console.error("Token refresh listener removed");
    }
  }

  private async ensureTokenDirectoryExists(): Promise<void> {
    try {
      const dir = path.dirname(this.tokenPath);
      await fs.mkdir(dir, { recursive: true });
    } catch (error: unknown) {
      // Ignore errors if directory already exists, re-throw others
      if (
        error instanceof Error &&
        "code" in error &&
        error.code !== "EEXIST"
      ) {
        console.error("Failed to create token directory:", error);
        throw error;
      }
    }
  }

  private setupTokenRefresh(): void {
    // Store the listener function for later removal
    this.tokenListener = async (newTokens) => {
      // Skip token refresh if we're shutting down
      if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
        console.error("Skipping token refresh during shutdown");
        return;
      }

      // Register this token refresh operation
      this.registerOperation(
        `token-refresh-${Date.now()}`,
        this.refreshTokensInternal(newTokens).catch((err) => {
          console.error("Error in token refresh operation:", err);
        })
      );
    };

    // Add the listener
    this.oauth2Client.on("tokens", this.tokenListener);
  }

  // Separate method for the token refresh implementation
  private async refreshTokensInternal(newTokens: Credentials): Promise<void> {
    // Check for shutdown again as the operation might have been queued before shutdown
    if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
      console.error(
        `Skipping queued token refresh during shutdown phase: ${this.shutdownPhase}`
      );
      return;
    }

    // Generate a unique operation ID for this refresh
    const operationId = `token-refresh-${Date.now()}`;
    let tempTokenPath: string | null = null;

    try {
      // Create a unique temp file path for this operation
      tempTokenPath = await this.tempFileManager.createTempFile(
        this.tokenPath,
        operationId
      );
      console.error(`Created temp file for token refresh: ${tempTokenPath}`);

      // Use the FileLock to ensure exclusive access to the token file
      await this.fileLock.withLock(this.tokenPath, async () => {
        // Check for shutdown again inside the lock
        if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
          console.error(
            `Aborting token refresh during shutdown phase: ${this.shutdownPhase}`
          );
          return;
        }

        // First try to load existing tokens if they exist
        let updatedTokens = { ...newTokens };

        try {
          // Try to read and merge with existing tokens
          await this.ensureTokenDirectoryExists();
          const fileExists = await fs
            .access(this.tokenPath)
            .then(() => true)
            .catch(() => false);

          if (fileExists) {
            const fileContent = await fs.readFile(this.tokenPath, "utf-8");
            const currentTokens = JSON.parse(fileContent);
            // Merge tokens, preserving the refresh token if not in new tokens
            updatedTokens = {
              ...currentTokens,
              ...newTokens,
              refresh_token:
                newTokens.refresh_token || currentTokens.refresh_token,
            };
          }
        } catch (readError) {
          // If reading fails, just use the new tokens
          console.error(
            "Could not read existing tokens, using only new tokens:",
            readError
          );
        }

        // Check for shutdown again before file operations
        if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
          console.error(
            `Aborting token refresh during shutdown phase: ${this.shutdownPhase}`
          );
          return;
        }

        // Use the retry mechanism for writing the file
        await withRetry(async () => {
          await fs.writeFile(
            tempTokenPath!,
            JSON.stringify(updatedTokens, null, 2),
            { mode: 0o600 }
          );
        }, 3);

        // Verify the file was written correctly
        try {
          const fileContent = await fs.readFile(tempTokenPath!, "utf-8");
          const parsedTokens = JSON.parse(fileContent);

          if (!parsedTokens || typeof parsedTokens !== "object") {
            throw new Error("Token verification failed during auto-refresh");
          }
        } catch (verifyError) {
          console.error("Token verification failed:", verifyError);
          // Release the temp file tracking before unlinking
          if (tempTokenPath) {
            this.tempFileManager.releaseTemporaryFile(tempTokenPath);
          }
          // Try to clean up the temp file
          try {
            await fs.unlink(tempTokenPath!).catch(() => {});
          } catch (unlinkError) {
            // Ignore cleanup errors
          }
          throw verifyError;
        }

        // Final shutdown check before rename
        if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
          console.error(
            `Aborting token refresh during shutdown phase: ${this.shutdownPhase}`
          );
          return;
        }

        // Use retry mechanism for renaming with better error handling
        try {
          await withRetry(async () => {
            await fs.rename(tempTokenPath!, this.tokenPath);
          }, 3);

          console.error("Tokens updated and saved during refresh");

          // Release the temp file tracking after successful rename
          if (tempTokenPath) {
            this.tempFileManager.releaseTemporaryFile(tempTokenPath);
            tempTokenPath = null;
          }
        } catch (renameError) {
          // If rename fails, try copy approach with retry
          console.error(
            "Rename failed during token refresh, trying copy approach:",
            renameError
          );

          try {
            // Check if temp file still exists
            const tempExists = await fs
              .access(tempTokenPath!)
              .then(() => true)
              .catch(() => false);

            if (!tempExists) {
              console.error(
                "Temp file no longer exists, writing tokens directly"
              );
              // Write directly to the final file if temp is gone but we have tokens in memory
              await fs.writeFile(
                this.tokenPath,
                JSON.stringify(updatedTokens, null, 2),
                { mode: 0o600 }
              );
              console.error("Tokens saved directly to final location");
            } else {
              // Read the temp file content and write to final file
              const tempContent = await fs.readFile(tempTokenPath!, "utf-8");
              await fs.writeFile(this.tokenPath, tempContent, { mode: 0o600 });
              console.error("Tokens saved using copy approach");

              // Try to delete the temp file
              await fs.unlink(tempTokenPath!).catch(() => {});
            }

            // Release the temp file tracking after direct write
            if (tempTokenPath) {
              this.tempFileManager.releaseTemporaryFile(tempTokenPath);
              tempTokenPath = null;
            }
          } catch (copyError) {
            console.error(
              "Failed to save tokens using copy approach:",
              copyError
            );
            throw copyError;
          }
        }
      });
    } catch (error: unknown) {
      console.error("Error during token refresh save:", error);

      // Clean up temp file if still exists
      if (tempTokenPath) {
        try {
          const tempExists = await fs
            .access(tempTokenPath)
            .then(() => true)
            .catch(() => false);

          if (tempExists) {
            await fs.unlink(tempTokenPath);
          }
          this.tempFileManager.releaseTemporaryFile(tempTokenPath);
        } catch (cleanupError) {
          console.error("Error cleaning up temp file:", cleanupError);
        }
      }

      throw error;
    }
  }

  async loadSavedTokens(): Promise<boolean> {
    return this.registerOperation(
      "load-tokens",
      this.loadSavedTokensInternal()
    );
  }

  private async loadSavedTokensInternal(): Promise<boolean> {
    try {
      await this.ensureTokenDirectoryExists();

      // Check if token file exists
      const fileExists = await fs
        .access(this.tokenPath)
        .then(() => true)
        .catch(() => false);

      if (!fileExists) {
        console.error("No token file found at:", this.tokenPath);
        return false;
      }

      let fileContent: string;
      try {
        fileContent = await fs.readFile(this.tokenPath, "utf-8");
      } catch (readError) {
        console.error("Error reading token file:", readError);
        return false;
      }

      let tokens: any;
      try {
        tokens = JSON.parse(fileContent);
      } catch (parseError) {
        console.error("Error parsing token file (invalid JSON):", parseError);
        // Attempt to delete corrupted token file
        try {
          await fs.unlink(this.tokenPath);
          console.error("Removed corrupted token file");
        } catch (unlinkErr) {
          /* ignore */
        }
        return false;
      }

      if (!tokens || typeof tokens !== "object" || !tokens.access_token) {
        console.error("Invalid token format in file:", this.tokenPath);
        // Attempt to delete invalid token file
        try {
          await fs.unlink(this.tokenPath);
          console.error("Removed invalid token file");
        } catch (unlinkErr) {
          /* ignore */
        }
        return false;
      }

      this.oauth2Client.setCredentials(tokens);
      return true;
    } catch (error: unknown) {
      console.error("Error loading tokens:", error);
      // Attempt to delete potentially corrupted token file
      if (
        error instanceof Error &&
        "code" in error &&
        error.code !== "ENOENT"
      ) {
        try {
          await fs.unlink(this.tokenPath);
          console.error("Removed potentially corrupted token file");
        } catch (unlinkErr) {
          /* ignore */
        }
      }
      return false;
    }
  }

  async refreshTokensIfNeeded(): Promise<boolean> {
    return this.registerOperation(
      "refresh-tokens",
      this.refreshTokensIfNeededInternal()
    );
  }

  private async refreshTokensIfNeededInternal(): Promise<boolean> {
    const expiryDate = this.oauth2Client.credentials.expiry_date;
    const isExpired = expiryDate
      ? Date.now() >= expiryDate - 5 * 60 * 1000 // 5 minute buffer
      : !this.oauth2Client.credentials.access_token; // No token means we need one

    if (isExpired && this.oauth2Client.credentials.refresh_token) {
      console.error("Auth token expired or nearing expiry, refreshing...");
      try {
        const response = await this.oauth2Client.refreshAccessToken();
        const newTokens = response.credentials;

        if (!newTokens.access_token) {
          throw new Error("Received invalid tokens during refresh");
        }
        // The 'tokens' event listener should handle saving
        this.oauth2Client.setCredentials(newTokens);
        console.error("Token refreshed successfully");
        return true;
      } catch (refreshError) {
        if (
          refreshError instanceof GaxiosError &&
          refreshError.response?.data?.error === "invalid_grant"
        ) {
          console.error(
            "Error refreshing auth token: Invalid grant. Token likely expired or revoked. Re-authentication required"
          );
          // Optionally clear the potentially invalid tokens here
          // await this.clearTokens();
          return false; // Indicate failure due to invalid grant
        } else {
          // Handle other refresh errors
          console.error("Error refreshing auth token:", refreshError);
          return false;
        }
      }
    } else if (
      !this.oauth2Client.credentials.access_token &&
      !this.oauth2Client.credentials.refresh_token
    ) {
      console.error("No access or refresh token available");
      return false;
    } else {
      // Token is valid or no refresh token available
      return true;
    }
  }

  async validateTokens(): Promise<boolean> {
    return this.registerOperation(
      "validate-tokens",
      this.validateTokensInternal()
    );
  }

  private async validateTokensInternal(): Promise<boolean> {
    if (
      !this.oauth2Client.credentials ||
      !this.oauth2Client.credentials.access_token
    ) {
      // Try loading first if no credentials set
      if (!(await this.loadSavedTokensInternal())) {
        return false; // No saved tokens to load
      }
      // Check again after loading
      if (
        !this.oauth2Client.credentials ||
        !this.oauth2Client.credentials.access_token
      ) {
        return false; // Still no token after loading
      }
    }
    return this.refreshTokensIfNeededInternal();
  }

  async saveTokens(tokens: Credentials): Promise<void> {
    return this.registerOperation(
      "save-tokens",
      this.saveTokensInternal(tokens)
    );
  }

  private async saveTokensInternal(tokens: Credentials): Promise<void> {
    // Check if we're shutting down
    if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
      console.error(
        `Skipping token save during shutdown phase: ${this.shutdownPhase}`
      );
      throw new Error(
        `Skipping token save during shutdown phase: ${this.shutdownPhase}`
      );
    }

    const operationId = `save-tokens-${Date.now()}`;
    let tempTokenPath: string | null = null;

    try {
      await this.ensureTokenDirectoryExists();

      // Create a unique temp file
      tempTokenPath = await this.tempFileManager.createTempFile(
        this.tokenPath,
        operationId
      );
      console.error(`Created temp file for token save: ${tempTokenPath}`);

      // Use the FileLock to ensure exclusive access
      await this.fileLock.withLock(this.tokenPath, async () => {
        // Check for shutdown again inside the lock
        if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
          console.error(
            `Aborting token save during shutdown phase: ${this.shutdownPhase}`
          );
          return;
        }

        // Use retry for writing to the temp file
        await withRetry(async () => {
          await fs.writeFile(tempTokenPath!, JSON.stringify(tokens, null, 2), {
            mode: 0o600,
          });
        }, 3);

        // Verify the file was written correctly
        try {
          const fileContent = await fs.readFile(tempTokenPath!, "utf-8");
          const parsedTokens = JSON.parse(fileContent);

          // Ensure the tokens were written correctly
          if (
            !parsedTokens ||
            typeof parsedTokens !== "object" ||
            !parsedTokens.access_token
          ) {
            throw new Error("Token verification failed, invalid token format");
          }

          // Final shutdown check before rename
          if (this.shutdownPhase !== ShutdownPhase.RUNNING) {
            console.error(
              `Aborting token save during shutdown phase: ${this.shutdownPhase}`
            );
            return;
          }

          // Use retry for renaming
          try {
            await withRetry(async () => {
              await fs.rename(tempTokenPath!, this.tokenPath);
            }, 3);

            console.error("Tokens saved and verified successfully");

            // Release temp file tracking after successful rename
            if (tempTokenPath) {
              this.tempFileManager.releaseTemporaryFile(tempTokenPath);
              tempTokenPath = null;
            }
          } catch (renameError) {
            // If rename fails, try copy approach with retry
            console.error(
              "Rename failed during token save, trying copy approach:",
              renameError
            );

            try {
              // Check if temp file still exists
              const tempExists = await fs
                .access(tempTokenPath!)
                .then(() => true)
                .catch(() => false);

              if (!tempExists) {
                console.error(
                  "Temp file no longer exists, writing tokens directly"
                );
                // Write directly to the final file if temp is gone
                await fs.writeFile(
                  this.tokenPath,
                  JSON.stringify(tokens, null, 2),
                  { mode: 0o600 }
                );
                console.error("Tokens saved directly to final location");
              } else {
                // Read the temp file content and write to final file
                const tempContent = await fs.readFile(tempTokenPath!, "utf-8");
                await fs.writeFile(this.tokenPath, tempContent, {
                  mode: 0o600,
                });
                console.error("Tokens saved using copy approach");

                // Try to delete the temp file
                await fs.unlink(tempTokenPath!).catch(() => {});
              }

              // Release temp file tracking after direct write
              if (tempTokenPath) {
                this.tempFileManager.releaseTemporaryFile(tempTokenPath);
                tempTokenPath = null;
              }
            } catch (copyError) {
              console.error(
                "Failed to save tokens using copy approach:",
                copyError
              );
              throw copyError;
            }
          }

          // Set the tokens in the OAuth client
          this.oauth2Client.setCredentials(tokens);
        } catch (verifyError) {
          // Remove the temp file if verification failed
          if (tempTokenPath) {
            try {
              await fs.unlink(tempTokenPath);
              this.tempFileManager.releaseTemporaryFile(tempTokenPath);
              tempTokenPath = null;
            } catch (unlinkError) {
              // Ignore errors when removing temp file
            }
          }
          throw verifyError;
        }
      });
    } catch (error: unknown) {
      console.error("Error saving tokens:", error);

      // Clean up temp file if still exists
      if (tempTokenPath) {
        try {
          const tempExists = await fs
            .access(tempTokenPath)
            .then(() => true)
            .catch(() => false);

          if (tempExists) {
            await fs.unlink(tempTokenPath);
          }
          this.tempFileManager.releaseTemporaryFile(tempTokenPath);
        } catch (cleanupError) {
          console.error("Error cleaning up temp file:", cleanupError);
        }
      }

      throw error;
    }
  }

  async clearTokens(): Promise<void> {
    return this.registerOperation("clear-tokens", this.clearTokensInternal());
  }

  private async clearTokensInternal(): Promise<void> {
    try {
      this.oauth2Client.setCredentials({}); // Clear in memory
      await fs.unlink(this.tokenPath);
      console.error("Tokens cleared successfully");
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        // File already gone, which is fine
        console.error("Token file already deleted");
      } else {
        console.error("Error clearing tokens:", error);
        // Don't re-throw, clearing is best-effort
      }
    }
  }

  // Synchronous method for saving tokens during critical shutdown
  syncSaveTokens(tokens: Credentials): void {
    if (this.shutdownPhase === ShutdownPhase.COMPLETE) {
      console.error("Cannot save tokens in COMPLETE shutdown phase");
      return;
    }

    console.error("Performing synchronous token save during shutdown");

    try {
      // Ensure directory exists synchronously
      const dir = path.dirname(this.tokenPath);
      if (!fsSync.existsSync(dir)) {
        fsSync.mkdirSync(dir, { recursive: true });
      }

      // Write directly to token file synchronously (skip temp file)
      fsSync.writeFileSync(this.tokenPath, JSON.stringify(tokens, null, 2), {
        mode: 0o600,
      });

      // Set the credentials in the client
      this.oauth2Client.setCredentials(tokens);
      console.error("Tokens saved synchronously");
    } catch (error) {
      console.error("Error in synchronous token save:", error);
    }
  }

  // Critical shutdown method for emergency situations
  emergencyShutdown(): void {
    // Set phase to FINALIZING to prevent new operations
    this.shutdownPhase = ShutdownPhase.FINALIZING;
    console.error("Emergency shutdown initiated");

    // Remove token listener
    this.removeTokenListener();

    // Check if we have any tokens to save
    if (this.oauth2Client.credentials?.access_token) {
      // Save tokens synchronously
      this.syncSaveTokens(this.oauth2Client.credentials);
    }

    // Set phase to COMPLETE
    this.shutdownPhase = ShutdownPhase.COMPLETE;
    console.error("Emergency shutdown complete");
  }
}
