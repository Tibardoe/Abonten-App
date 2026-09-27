// Generates the web's raster brand assets from the vector masters in
// public/assets/images/brand (the 2026-09 identity). Email clients and the
// ticket PDF need PNGs, and web push needs PNG icons.
//
// Outputs (committed) — run `node apps/web/scripts/gen-brand-assets.mjs`:
//   brand/abonten-email-tile.png   stacked lockup on a white rounded tile (every email)
//   brand/abonten-pdf-logo.png     stacked lockup, transparent (ticket PDF, printed on white)
//   brand/abonten-push-icon.png    192 px Small mark on a Night tile (web push icon)
//   brand/abonten-push-badge.png    96 px Micro mark, white on transparent (web push badge)
//   brand/abonten-image-fallback.png 1600 px Night square, Small mark at 22% (the placeholder
//                                    Cloudinary serves for a missing image: upload it as
//                                    branding/image-fallback with scripts/upload-image-fallback.mjs)
//   brand/og-default.jpg             1200 x 630 link preview: the logotype over the homepage photo
//
// Not generated here: favicon.ico, favicon.svg and apple-touch-icon.png. The
// 16/24/32 px favicon pixels are drawn by hand in the brand workspace, so
// they are committed as files, not rebuilt from the vectors.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const BRAND = path.join(here, "../public/assets/images/brand");
const NIGHT = "#121410";
const read = (name) => fs.readFileSync(path.join(BRAND, `${name}.svg`), "utf8");
const out = (name) => path.join(BRAND, name);

// Render an SVG master at a given pixel width.
const raster = (name, width) =>
  sharp(Buffer.from(read(name)), { density: 600 })
    .resize(width)
    .png()
    .toBuffer();

// A square mark master placed on a canvas at `frac` of its width.
function markOnCanvas(name, size, frac, bg, radius = 0.19) {
  const box = 800 / frac;
  const off = (box - 800) / 2;
  let svg = read(name).replace(
    /viewBox="[^"]+"/,
    `viewBox="${100 - off} ${90 - off} ${box} ${box}" width="${size}" height="${size}"`,
  );
  if (bg)
    svg = svg.replace(
      /(<svg[^>]*>)/,
      `$1<rect x="${100 - off}" y="${90 - off}" width="${box}" height="${box}" rx="${box * radius}" fill="${bg}"/>`,
    );
  return sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png();
}

async function emailTile() {
  const logoW = 480;
  const logo = await raster("abonten-stacked-light", logoW);
  const { height } = await sharp(logo).metadata();
  const pad = 56;
  const W = logoW + pad * 2;
  const H = height + pad * 2;
  const tile = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" rx="40" fill="#FFFFFF"/></svg>`,
  );
  await sharp(tile)
    .composite([{ input: logo, left: pad, top: pad }])
    .png()
    .toFile(out("abonten-email-tile.png"));
}

await emailTile();
await sharp(await raster("abonten-stacked-light", 480)).toFile(
  out("abonten-pdf-logo.png"),
);
await markOnCanvas("abonten-mark-small-night", 192, 0.62, NIGHT).toFile(
  out("abonten-push-icon.png"),
);
await markOnCanvas("abonten-mark-micro-mono-white", 96, 0.8).toFile(
  out("abonten-push-badge.png"),
);
// Square, with the mark small and centred, so it survives every crop the
// app asks Cloudinary for (wide event heroes, square cards, avatars).
await markOnCanvas("abonten-mark-small-night", 1600, 0.22, NIGHT, 0).toFile(
  out("abonten-image-fallback.png"),
);
// The default link preview (layout.tsx metadata.openGraph): the white
// logotype over the homepage crowd photo, darkened towards the foot.
async function ogDefault() {
  const W = 1200;
  const H = 630;
  const photo = await sharp(
    path.join(here, "../public/assets/images/landing-hero.jpg"),
  )
    .resize(W, H, { fit: "cover", position: "bottom" })
    .toBuffer();
  const shade = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NIGHT}" stop-opacity="0.55"/><stop offset="1" stop-color="${NIGHT}" stop-opacity="0.85"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
  );
  const logoW = 620;
  const logo = await raster("abonten-logotype-night", logoW);
  const { height } = await sharp(logo).metadata();
  await sharp(photo)
    .composite([
      { input: shade },
      {
        input: logo,
        left: Math.round((W - logoW) / 2),
        top: Math.round((H - height) / 2),
      },
    ])
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(out("og-default.jpg"));
}

await ogDefault();
console.log(
  "wrote brand/abonten-{email-tile,pdf-logo,push-icon,push-badge,image-fallback}.png, brand/og-default.jpg",
);
