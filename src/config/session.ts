import session from "express-session";

import { mysqlPool } from "../infrastructure/database/mysql.js";
import { MySqlSessionStore } from "../infrastructure/session/mysql-session.store.js";
import { env } from "./env.js";

const sessionLifetimeMs = 1000 * 60 * 60 * 8;

const sessionStore = new MySqlSessionStore(mysqlPool, sessionLifetimeMs);

export const sessionMiddleware = session({
  name: "doctorsa.sid",
  secret: env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.SESSION_COOKIE_SECURE,
    maxAge: sessionLifetimeMs,
  },
});
