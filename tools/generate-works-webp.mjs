import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import archiver from "archiver";
import { createWriteStream } from "node:fs";

const ROOT = process.cwd();
const FORMED_DIR = path.join(ROOT, "assets", "images", "works", "formed");

const TARGETS = [
  { size: 960, quality: 70 },
  { size: 1440, quality: 85 },
  { size: 2048, quality: 88 },
];

const ZIP_ALL_FORMED = true;
const OVERWRITE = false;

function isMainWebp(filename) {
  return filename.endsWith("-main.webp");
}
function derivedName(mainName, size) {
  return mainName.replace("-main.webp", `-${size}.webp`);
}
async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}
async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}
async function ensureGenerated(mainPath) {
  const dir = path.dirname(mainPath);
  const base = path.basename(mainPath);

  for (const t of TARGETS) {
    const outPath = path.join(dir, derivedName(base, t.size));
    if (!OVERWRITE && (await exists(outPath))) continue;

    await sharp(mainPath, { failOn: "none" })
      .resize(t.size, t.size, {
        fit: "cover",
        position: "center",
        withoutEnlargement: true
      })
      .webp({ quality: t.quality })
      .toFile(outPath);
  }
}
async function makeZip(zipPath) {
  await fs.mkdir(path.dirname(zipPath), { recursive: true });

  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });

  archive.pipe(output);

  if (await exists(FORMED_DIR)) {
    archive.directory(FORMED_DIR, "assets/images/works/formed");
  } else {
    archive.append("formed directory is missing in repo.\n", { name: "README-EMPTY.txt" });
  }

  await archive.finalize();
  await done;
}
async function main() {
  await fs.mkdir(FORMED_DIR, { recursive: true });

  const mains = [];
  for await (const file of walk(FORMED_DIR)) {
    if (isMainWebp(path.basename(file))) mains.push(file);
  }
  for (const m of mains) await ensureGenerated(m);

  const outZip = path.join(ROOT, "dist", "works-images.zip");
  await makeZip(outZip);
  console.log(`[DONE] ${path.relative(ROOT, outZip)}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
