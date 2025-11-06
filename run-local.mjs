import "dotenv/config";
process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true";
process.env.PUPPETEER_EXECUTABLE_PATH = process.env.CHROME_PATH;
import { handler } from "./index.mjs";

// Simulate Lambda event
const event = {};
const context = {};

handler(event, context)
  .then((result) => {
    console.log("Result:", result);
  })
  .catch((error) => {
    console.error("Error:", error);
  });
