// Resolves each card's wikiTitles to Wikimedia image URLs, downloads the image
// bytes into data/images/, and writes a localImages map back into
// data/cards.json so the live site can load pictures from disk instead of
// hitting Wikipedia at view time.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CARDS_PATH = path.join(ROOT, "data", "cards.json");
const IMG_DIR = path.join(ROOT, "data", "images");
const UA =
  "webfalsh-flashcards/1.0 (https://github.com/nivlekwat/webfalsh)";

fs.mkdirSync(IMG_DIR, { recursive: true });
const cards = JSON.parse(fs.readFileSync(CARDS_PATH, "utf8"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, options) {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (res.status === 429 && attempt < maxAttempts) {
      const wait = 1000 * Math.pow(2, attempt - 1) + Math.random() * 500;
      console.log(
        `  429; waiting ${Math.round(wait)}ms (attempt ${attempt}/${maxAttempts})`
      );
      await sleep(wait);
      continue;
    }
    throw new Error(`HTTP ${res.status}`);
  }
  throw new Error("retry exhausted");
}

async function resolveImageUrl(title) {
  const url =
    "https://en.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title);
  const res = await fetchWithRetry(url, {
    headers: { "User-Agent": UA, accept: "application/json" },
  });
  const data = await res.json();
  return (
    (data.originalimage && data.originalimage.source) ||
    (data.thumbnail && data.thumbnail.source) ||
    null
  );
}

async function downloadToFile(url, destFile) {
  const res = await fetchWithRetry(url, { headers: { "User-Agent": UA } });
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destFile, buf);
}

function extFromUrl(url) {
  const m = url.match(/\.(jpg|jpeg|png|gif|webp|svg)(?=\?|$)/i);
  return (m && m[1].toLowerCase()) || "jpg";
}

let modified = false;

for (const card of cards) {
  const titles =
    card.wikiTitles && card.wikiTitles.length
      ? card.wikiTitles
      : card.wikiTitle
      ? [card.wikiTitle]
      : [];
  if (!titles.length) continue;

  card.localImages = card.localImages || {};

  for (const title of titles) {
    const existing = card.localImages[title];
    if (existing && fs.existsSync(path.join(ROOT, existing))) continue;

    await sleep(250); // be polite to Wikipedia REST API
    try {
      const wikiUrl = await resolveImageUrl(title);
      if (!wikiUrl) {
        console.warn(`No image for "${title}"`);
        continue;
      }
      const ext = extFromUrl(wikiUrl);
      const hash = crypto
        .createHash("md5")
        .update(wikiUrl)
        .digest("hex")
        .slice(0, 12);
      const fileName = `${hash}.${ext}`;
      const localPath = `data/images/${fileName}`;
      const fullPath = path.join(ROOT, localPath);

      if (!fs.existsSync(fullPath)) {
        await downloadToFile(wikiUrl, fullPath);
        console.log(`Fetched "${title}" → ${fileName}`);
        modified = true;
      }
      if (card.localImages[title] !== localPath) {
        card.localImages[title] = localPath;
        modified = true;
      }
    } catch (e) {
      console.warn(`Failed for "${title}": ${e.message}`);
    }
  }
}

if (modified) {
  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2) + "\n");
  console.log("Updated cards.json");
} else {
  console.log("No changes needed.");
}
