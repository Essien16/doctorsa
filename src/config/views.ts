import path from "node:path";

import express, { type Express } from "express";
import mustacheExpress from "mustache-express";

export function configureViews(app: Express): void {
  app.engine("mustache", mustacheExpress());

  app.set("view engine", "mustache");
  app.set("views", path.join(process.cwd(), "src/views"));

  app.use("/public", express.static(path.join(process.cwd(), "src/public")));
}
