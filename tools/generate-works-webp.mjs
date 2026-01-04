import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import archiver from "archiver";
import { createWriteStream } from "node:fs";

const ROOT = process.cwd();
const FORMED_DIR = path.join(ROOT, "assets", "images", "works", "formed");

// 固定ルール：サイズと品質
const TARGETS = [
  { size: 960, quality: 70 },
  { size: 1440, quality: 85 },
  { size: 2048, quality: 88 },
];

// 既に派生があっても常に作り直すなら true
const OVERWRITE = false;

function isMainWebp(filename) {
  return filename.endsWith("-main.webp");
}

function derivedName(mainName, size) {
  return mainName.replace("-main.webp", `-${size}.webp`);
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
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

    // 正方形出力：中央トリミング（伸ばさない）
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

async function makeYearZip(year, zipPath) {
  await fs.mkdir(path.dirname(zipPath), { recursive: true });

  const yearDir = path.join(FORMED_DIR, year);
  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("warning", (err) => console.warn("[ZIP warning]", err));
    archive.on("error", reject);
  });

  archive.pipe(output);

  if (await exists(yearDir)) {
    // ZIP内は 2020/... のように年フォルダから開始（浅い）
    archive.directory(yearDir, year);
  } else {
    archive.append(`No data for ${year}\n`, { name: `README-${year}.txt` });
  }

  await archive.finalize();
  await done;
}

async function main() {
  await fs.mkdir(FORMED_DIR, { recursive: true });

  // 1) 派生画像を生成
  const mains = [];
  for await (const file of walk(FORMED_DIR)) {
    if (isMainWebp(path.basename(file))) mains.push(file);
  }
  console.log(`[INFO] Found ${mains.length} main files`);
  for (const m of mains) await ensureGenerated(m);

  // 2) 年別ZIPを作成
  const YEARS = ["2020", "2021", "2022", "2023", "2024", "2025"];
  for (const y of YEARS) {
    const outZip = path.join(ROOT, "dist", `works-${y}.zip`);
    await makeYearZip(y, outZip);
    console.log(`[DONE] ${path.relative(ROOT, outZip)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
