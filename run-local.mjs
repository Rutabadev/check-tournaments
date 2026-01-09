import "dotenv/config";

if (process.env.RUN_MODE === "test" || process.env.RUN_MODE === "production-test") {
  delete process.env.DEBUG;
  console.log("DEBUG mode disabled for testing");
} else if (process.env.DEBUG) {
  console.log("DEBUG mode enabled (set in .env or environment)");
}

process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
process.env.PUPPETEER_EXECUTABLE_PATH = process.env.CHROME_PATH;

import { handler } from "./src/handler.mjs";

handler()
  .then((result) => {
    console.log("Result:", result);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
