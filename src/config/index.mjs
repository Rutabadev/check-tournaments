export const isLocal = process.env.NODE_ENV === "local";

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

export const TARGET_LEVELS = ["P50", "P100", "P250"];

export const ADMIN_EMAIL = "etienner37@gmail.com";
export const SENDER_EMAIL = "izi.rutabaga@gmail.com";

export function getConfig() {
  const { MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS } = process.env;

  if (!MAILING_LIST || !EMAIL || !EMAIL_APP_PASS || !PASSWORD) {
    throw new Error(
      "Missing env variables, required: MAILING_LIST, EMAIL, PASSWORD, EMAIL_APP_PASS"
    );
  }

  return {
    mailingList: MAILING_LIST.split(","),
    email: EMAIL,
    password: PASSWORD,
    emailAppPass: EMAIL_APP_PASS,
    awsRegion: process.env.AWS_REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY,
    debug: !!process.env.DEBUG,
  };
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
