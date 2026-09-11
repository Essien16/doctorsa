import session, { type SessionData } from "express-session";
import type { Pool, RowDataPacket } from "mysql2/promise";

interface SessionRow extends RowDataPacket {
  sess: string | SessionData;
}

type StoreCallback = (error?: unknown) => void;

type GetSessionCallback = (
  error?: unknown,
  sessionData?: SessionData | null,
) => void;

export class MySqlSessionStore extends session.Store {
  constructor(
    private readonly pool: Pool,
    private readonly defaultTtlMs: number,
  ) {
    super();
  }

  get(sessionId: string, callback: GetSessionCallback): void {
    void this.getSession(sessionId)
      .then((sessionData) => {
        callback(undefined, sessionData);
      })
      .catch((error: unknown) => {
        callback(error);
      });
  }

  set(
    sessionId: string,
    sessionData: SessionData,
    callback?: StoreCallback,
  ): void {
    void this.saveSession(sessionId, sessionData)
      .then(() => {
        callback?.();
      })
      .catch((error: unknown) => {
        callback?.(error);
      });
  }

  destroy(sessionId: string, callback?: StoreCallback): void {
    void this.deleteSession(sessionId)
      .then(() => {
        callback?.();
      })
      .catch((error: unknown) => {
        callback?.(error);
      });
  }

  touch(
    sessionId: string,
    sessionData: SessionData,
    callback?: StoreCallback,
  ): void {
    void this.touchSession(sessionId, sessionData)
      .then(() => {
        callback?.();
      })
      .catch((error: unknown) => {
        callback?.(error);
      });
  }

  private async getSession(sessionId: string): Promise<SessionData | null> {
    const [rows] = await this.pool.execute<SessionRow[]>(
      `
        SELECT sess
        FROM sessions
        WHERE sid = ?
          AND expire > UTC_TIMESTAMP(3)
        LIMIT 1
      `,
      [sessionId],
    );

    const row = rows[0];

    if (!row) {
      await this.deleteSession(sessionId);
      return null;
    }

    return this.parseSession(row.sess);
  }

  private async saveSession(
    sessionId: string,
    sessionData: SessionData,
  ): Promise<void> {
    const serializedSession = JSON.stringify(sessionData);
    const expiresAt = this.calculateExpiry(sessionData);

    await this.pool.execute(
      `
        INSERT INTO sessions (
          sid,
          sess,
          expire
        )
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          sess = ?,
          expire = ?
      `,
      [sessionId, serializedSession, expiresAt, serializedSession, expiresAt],
    );
  }

  private async deleteSession(sessionId: string): Promise<void> {
    await this.pool.execute(
      `
        DELETE FROM sessions
        WHERE sid = ?
      `,
      [sessionId],
    );
  }

  private async touchSession(
    sessionId: string,
    sessionData: SessionData,
  ): Promise<void> {
    const expiresAt = this.calculateExpiry(sessionData);

    await this.pool.execute(
      `
        UPDATE sessions
        SET expire = ?
        WHERE sid = ?
      `,
      [expiresAt, sessionId],
    );
  }

  private calculateExpiry(sessionData: SessionData): Date {
    const sessionExpiry: unknown = sessionData.cookie.expires;

    if (
      sessionExpiry instanceof Date &&
      !Number.isNaN(sessionExpiry.getTime())
    ) {
      return sessionExpiry;
    }

    if (typeof sessionExpiry === "string") {
      const parsedExpiry = new Date(sessionExpiry);

      if (!Number.isNaN(parsedExpiry.getTime())) {
        return parsedExpiry;
      }
    }

    return new Date(Date.now() + this.defaultTtlMs);
  }

  private parseSession(storedSession: string | SessionData): SessionData {
    const parsedSession: unknown =
      typeof storedSession === "string"
        ? JSON.parse(storedSession)
        : storedSession;

    if (
      typeof parsedSession !== "object" ||
      parsedSession === null ||
      Array.isArray(parsedSession)
    ) {
      throw new Error("Stored session contains invalid JSON data");
    }

    return parsedSession as SessionData;
  }
}
