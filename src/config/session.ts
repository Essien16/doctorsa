import connectPgSimple from "connect-pg-simple";
import session from "express-session";

import { env } from "./env.js";

const PostgreSqlSessionStore = connectPgSimple(session);

const sessionStore = new PostgreSqlSessionStore({
  conString: env.DATABASE_URL,
  tableName: "session",
  createTableIfMissing: false,
});

export const sessionMiddleware = session({
  name: "doctorsa.sid",

  secret: env.SESSION_SECRET,

  store: sessionStore,

  resave: false,
  saveUninitialized: false,

  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8,
  },
});
