const RUN_MODES = ["local", "docker", "production"];

/** @type {"local" | "docker" | "production"} */
export const mode = (() => {
  const value = process.env.RUN_MODE || "production";
  if (!RUN_MODES.includes(value)) {
    throw new Error(
      `Invalid RUN_MODE "${value}", expected one of: ${RUN_MODES.join(", ")}`,
    );
  }
  return value;
})();

// Production reads config from Lambda env vars; local and docker read from .env.
if (mode !== "production") {
  await import("dotenv/config");
}

export const SUBDOMAINS = [
  "toulousepadelclub",
  "toppadel",
  "acepadelclub",
  "the-country-club-toulouse",
];

export const DAY_ABBREV_MAP = {
  "lun.": "lundi",
  "mar.": "mardi",
  "mer.": "mercredi",
  "jeu.": "jeudi",
  "ven.": "vendredi",
  "sam.": "samedi",
  "dim.": "dimanche",
};

export const WEEKEND_DAYS = ["samedi", "dimanche"];

export const TARGET_LEVELS = ["P100", "P250"];

export const ADMIN_EMAIL = "etienner37@gmail.com";
export const SENDER_EMAIL = "izi.rutabaga@gmail.com";

export function getConfig() {
  const { MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS } = process.env;

  if (!MAILING_LIST || !EMAIL || !EMAIL_APP_PASS || !PASSWORD) {
    throw new Error(
      "Missing env variables, required: MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS",
    );
  }

  return {
    mailingList: MAILING_LIST.split(","),
    email: EMAIL,
    password: PASSWORD,
    emailAppPass: EMAIL_APP_PASS,
    awsRegion: process.env.AWS_REGION,
    // Production uses the Lambda IAM role (undefined = SDK default chain);
    // local and docker use explicit credentials.
    credentials:
      mode === "production"
        ? undefined
        : {
            accessKeyId: process.env.ACCESS_KEY_ID,
            secretAccessKey: process.env.SECRET_ACCESS_KEY,
          },
    debug: !!Number(process.env.DEBUG),
  };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
