// Replaces the placeholder Cloudinary serves for any missing image (the `d_`
// default in @abonten/core/cloudinaryUrl, public id `branding/image-fallback`)
// with public/assets/images/brand/abonten-image-fallback.png, which
// gen-brand-assets.mjs draws from the brand masters.
//
// Overwrites in place and invalidates the CDN copies, so every surface —
// web, admin, and the mobile apps already on people's phones — picks up the
// new placeholder without a release. Run it by hand, once, from apps/web:
//
//   node scripts/upload-image-fallback.mjs
//
// Reads NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and
// CLOUDINARY_API_SECRET from the environment or apps/web/.env.local; prints
// no secret.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";

const here = path.dirname(fileURLToPath(import.meta.url));
const image = path.join(
  here,
  "../public/assets/images/brand/abonten-image-fallback.png",
);

function readEnvFile() {
  const file = path.join(here, "../.env.local");
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Z0-9_]+=/.test(line))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, "")];
      }),
  );
}

const fileEnv = readEnvFile();
const env = (name) => process.env[name] || fileEnv[name];

cloudinary.config({
  cloud_name: env("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"),
  api_key: env("CLOUDINARY_API_KEY"),
  api_secret: env("CLOUDINARY_API_SECRET"),
});

const result = await cloudinary.uploader.upload(image, {
  public_id: "branding/image-fallback",
  overwrite: true,
  invalidate: true,
  resource_type: "image",
});
console.log(
  `uploaded ${result.public_id}.${result.format} ${result.width}x${result.height} (version ${result.version})`,
);
