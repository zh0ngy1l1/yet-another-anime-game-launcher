import { log, wait } from "@utils";

interface GameOperationOptions {
  gamedir: string;
  game_type: string; // "hk4e" or "nap"
  tempdir?: string; // sophon manifest and intermediate files
}

export interface SophonInstallOptions extends GameOperationOptions {
  install_reltype: string; // "os", "cn", or "bb"
}

export interface SophonRepairOptions extends GameOperationOptions {
  // "quick" or "reliable"
  // "quick" does file size check, "reliable" does hash check
  repair_mode: string;
}

export interface SophonUpdateOptions extends GameOperationOptions {
  predownload: boolean;
}

interface SophonOperationResponse {
  task_id: string;
  status: string;
  message: string;
}

export interface SophonProgressEvent {
  type: string;
  task_id: string;
  [key: string]: any;
}

export interface SophonOnlineGameInfo {
  game_type: "hk4e" | "nap" | "";
  version: string;
  install_size: number;
  updatable_versions: string[];
  release_type: "os" | "cn" | "bb";
  pre_download: boolean;
  pre_download_version?: string;
  error?: string;
  full_manifest_update?: boolean;
}

export class SophonClient {
  private baseUrl: string;
  private wsUrl: string;

  constructor(host: string, port = 6969) {
    this.baseUrl = `http://${host}:${port}`;
    this.wsUrl = this.baseUrl
      .replace("http://", "ws://")
      .replace("https://", "wss://");
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      if (!response.ok) {
        log(`Health check failed with status: ${response.status}`);
        return false;
      }
      await response.json();
      return true;
    } catch (error) {
      log(`Health check error: ${error}`);
      return false;
    }
  }

  async startGameOperation(
    type: "install" | "repair" | "update",
    options: SophonInstallOptions | SophonRepairOptions | SophonUpdateOptions
  ): Promise<string> {
    log(`Starting ${type} operation with options: ${JSON.stringify(options)}`);

    const response = await fetch(`${this.baseUrl}/api/${type}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      throw new Error(`${type} request failed: ${response.statusText}`);
    }

    const result: SophonOperationResponse = await response.json();
    if (!result.task_id || !["pending", "running"].includes(result.status)) {
      throw new Error(result.message || "Sophon did not start the operation");
    }
    return result.task_id;
  }

  async startInstallation(options: SophonInstallOptions): Promise<string> {
    return this.startGameOperation("install", options);
  }

  async startRepair(options: SophonRepairOptions): Promise<string> {
    return this.startGameOperation("repair", options);
  }

  async startUpdate(options: SophonUpdateOptions): Promise<string> {
    return this.startGameOperation("update", options);
  }

  async *streamOperationProgress(
    taskId: string
  ): AsyncGenerator<SophonProgressEvent> {
    const ws = new WebSocket(`${this.wsUrl}/ws/${taskId}`);
    const messageQueue: SophonProgressEvent[] = [];
    let wake: (() => void) | undefined;
    let malformedMessage = false;
    let nextStatusCheck = 0;

    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as SophonProgressEvent;
        if (
          !message ||
          typeof message.type !== "string" ||
          message.task_id !== taskId
        ) {
          throw new Error("Invalid progress event");
        }
        messageQueue.push(message);
      } catch {
        malformedMessage = true;
      }
      wake?.();
    };
    // A transport failure never means the operation succeeded. REST status
    // continues tracking the worker when the WebSocket cannot deliver events.
    ws.onerror = ws.onclose = () => {
      nextStatusCheck = 0;
      wake?.();
    };

    try {
      while (true) {
        if (malformedMessage)
          throw new Error("Invalid Sophon progress message");
        while (messageQueue.length) {
          const message = messageQueue.shift() as SophonProgressEvent;
          if (message.type === "error" || message.type === "job_error") {
            throw new Error(message.error || "Operation failed");
          }
          yield message;
          if (message.type === "completed") return;
          // job_end precedes worker cleanup and is not authoritative success.
          if (message.type === "job_end") nextStatusCheck = 0;
        }

        if (Date.now() >= nextStatusCheck) {
          const abort = new AbortController();
          const timeout = setTimeout(() => abort.abort(), 10000);
          let status: { task_id: string; status: string; error?: string };
          try {
            const response = await fetch(
              `${this.baseUrl}/api/tasks/${taskId}/status`,
              {
                signal: abort.signal,
              }
            );
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            status = await response.json();
          } catch {
            throw new Error(
              "Cannot confirm Sophon operation status; the update may still be running"
            );
          } finally {
            clearTimeout(timeout);
          }
          if (status.task_id !== taskId)
            throw new Error("Invalid Sophon task status");
          if (status.status === "completed") {
            yield { type: "completed", task_id: taskId };
            return;
          }
          if (status.status !== "pending" && status.status !== "running") {
            throw new Error(
              status.error || `Sophon operation ${status.status || "not found"}`
            );
          }
          nextStatusCheck = Date.now() + 2000;
        }
        if (messageQueue.length) continue;
        await new Promise<void>(resolve => {
          const timer = setTimeout(
            () => wake?.(),
            Math.max(0, nextStatusCheck - Date.now())
          );
          wake = () => {
            clearTimeout(timer);
            wake = undefined;
            resolve();
          };
        });
      }
    } finally {
      ws.onmessage = ws.onclose = ws.onerror = null;
      ws.close();
    }
  }

  async cancelOperation(taskId: string): Promise<void> {
    // Partial support at python server side
    const response = await fetch(`${this.baseUrl}/api/tasks/${taskId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error(`Failed to cancel operation: ${response.statusText}`);
    }
  }

  async getLatestOnlineGameInfo(
    reltype: "os" | "cn" | "bb",
    game: string
  ): Promise<SophonOnlineGameInfo> {
    // Currently only supports "hk4e" for game, "os", "cn", or "bb" for reltype
    const response = await fetch(
      `${this.baseUrl}/api/game/online_info?game=${game}&reltype=${reltype}`
    );

    if (!response.ok) {
      throw new Error(`Failed to get game info: ${response.statusText}`);
    }

    const result: SophonOnlineGameInfo = await response.json();
    if (result.error || !result.version) {
      throw new Error(result.error || "Sophon returned no target version");
    }
    return result;
  }
}

export async function createSophon(
  host: string,
  port: number
): Promise<SophonClient> {
  const client = new SophonClient(host, port);

  if (!(await client.healthCheck())) {
    throw new Error(`Failed to connect to Sophon server at ${host}:${port}`);
  }
  return client;
}

export type Sophon = SophonClient;

export async function createSophonRetry(
  host: string,
  port: number
): Promise<Sophon> {
  for (let i = 0; i < 10; i++) {
    try {
      return await createSophon(host, port);
    } catch (error) {
      log("Failed to create sophon client, retrying..." + error);
      await wait(3000);
    }
  }
  throw new Error("Failed to create sophon client after retries");
}
