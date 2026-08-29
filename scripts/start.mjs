import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
process.env.NCRP_DATABASE_PATH ||= path.join(
  projectRoot,
  "data",
  "ncrp-one-case.db",
);
process.env.NCRP_UPLOAD_DIR ||= path.join(projectRoot, "uploads");
await import(
  pathToFileURL(path.join(projectRoot, ".next", "standalone", "server.js")).href
);
