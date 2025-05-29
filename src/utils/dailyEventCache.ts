// utils/dailyEventCache.ts

import fs from "node:fs";
import path from "node:path";
import type { UserPostType } from "@/types/postsType";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * ONE_DAY_MS;
const MAX_LOCATIONS = 20;

const CACHE_DIR = path.join(process.cwd(), "cache");

export async function getDailyEvent(
  events: UserPostType[],
  location: string,
): Promise<UserPostType | null> {
  try {
    const safeLocation = location.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const cachePath = path.join(CACHE_DIR, `${safeLocation}_dailyEvent.json`);

    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    // Cleanup: remove stale files and limit total
    cleanupOldCacheFiles();

    if (fs.existsSync(cachePath)) {
      const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      const now = Date.now();

      if (now - data.timestamp < ONE_DAY_MS && data.event) {
        return data.event;
      }
    }

    if (!events.length) return null;

    const randomIndex = Math.floor(Math.random() * events.length);
    const newEvent = events[randomIndex];

    fs.writeFileSync(
      cachePath,
      JSON.stringify({ event: newEvent, timestamp: Date.now() }, null, 2),
    );

    return newEvent;
  } catch (err) {
    console.error("Error handling daily event cache:", err);
    return null;
  }
}

function cleanupOldCacheFiles() {
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .filter((file) => file.endsWith("_dailyEvent.json"));

    const now = Date.now();

    // Remove old files
    for (const file of files) {
      const filePath = path.join(CACHE_DIR, file);
      const { timestamp } = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (now - timestamp > THREE_DAYS_MS) {
        fs.unlinkSync(filePath);
      }
    }

    // Enforce limit
    const remainingFiles = fs
      .readdirSync(CACHE_DIR)
      .filter((file) => file.endsWith("_dailyEvent.json"))
      .map((file) => {
        const filePath = path.join(CACHE_DIR, file);
        const { timestamp } = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        return { filePath, timestamp };
      })
      .sort((a, b) => b.timestamp - a.timestamp);

    for (let i = MAX_LOCATIONS; i < remainingFiles.length; i++) {
      fs.unlinkSync(remainingFiles[i].filePath);
    }
  } catch (err) {
    console.error("Error cleaning cache files:", err);
  }
}
