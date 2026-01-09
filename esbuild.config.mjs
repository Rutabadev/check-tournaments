import * as esbuild from "esbuild";

await esbuild.build({
  logLevel: "info",
  entryPoints: ["src/handler.mjs"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/index.mjs",
  external: [
    "@aws-sdk/*",
    "@sparticuz/chromium",
    "puppeteer",
    "puppeteer-core",
    "nodemailer",
    "dotenv",
    "dotenv/*",
  ],
  banner: {
    js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);',
  },
});
