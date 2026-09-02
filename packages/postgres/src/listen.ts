import pg from "pg";
import { quoteIdent } from "./ident.js";
import type { Queryable } from "./pool.js";

const { Client } = pg;

const RECONNECT_MS = 1_000;

export interface PgChannelListenerOptions {
  connectionString: string;
  channel: string;
  onNotification: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}

/**
 * Dedicated connection that LISTENs on a Postgres channel and reconnects
 * if the socket drops. Use {@link notifyChannel} on any pooled client to fan
 * the event out to every listener in the database.
 */
export class PgChannelListener {
  private client: pg.Client | undefined;
  private stopped = true;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private handling = false;
  private queued = false;

  constructor(private readonly options: PgChannelListenerOptions) {
    quoteIdent(options.channel);
  }

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    const client = this.client;
    this.client = undefined;
    if (!client) {
      return;
    }
    client.removeAllListeners();
    await client.end().catch(() => undefined);
  }

  private async connect(): Promise<void> {
    if (this.stopped) {
      return;
    }

    const client = new Client({ connectionString: this.options.connectionString });
    this.client = client;
    client.on("notification", (message) => {
      if (message.channel !== this.options.channel) {
        return;
      }
      void this.dispatch();
    });
    client.on("error", (error) => {
      this.options.onError?.(error);
      this.scheduleReconnect();
    });
    client.on("end", () => {
      if (!this.stopped && this.client === client) {
        this.scheduleReconnect();
      }
    });

    await client.connect();
    try {
      await client.query(`LISTEN ${quoteIdent(this.options.channel)}`);
    } catch (error) {
      this.client = undefined;
      client.removeAllListeners();
      await client.end().catch(() => undefined);
      throw error;
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const stale = this.client;
    this.client = undefined;
    stale?.removeAllListeners();
    void stale?.end().catch(() => undefined);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error: unknown) => {
        this.options.onError?.(error);
        this.scheduleReconnect();
      });
    }, RECONNECT_MS);
  }

  private async dispatch(): Promise<void> {
    if (this.handling) {
      this.queued = true;
      return;
    }
    this.handling = true;
    try {
      do {
        this.queued = false;
        await this.options.onNotification();
      } while (this.queued && !this.stopped);
    } catch (error) {
      this.options.onError?.(error);
    } finally {
      this.handling = false;
    }
  }
}

/** Wake every {@link PgChannelListener} subscribed to `channel` in this database. */
export async function notifyChannel(
  queryable: Queryable,
  channel: string,
): Promise<void> {
  await queryable.query(`NOTIFY ${quoteIdent(channel)}`);
}
