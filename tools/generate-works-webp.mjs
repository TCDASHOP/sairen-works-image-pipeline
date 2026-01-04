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

// true: formed/ を丸ごとZIP（main + 派生）
// false: 派生（-960/-1440/-2048）だけZIP
const ZIP_ALL_FORMED = true;

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

    if (!OVERWRITE && (await exists(outPath))) {
      console.log(`[SKIP] ${path.relative(ROOT, outPath)} (already exists)`);
      continue;
    }

    // 中央トリミング（伸ばさない）= cover + center
    // withoutEnlargement:true → 小さい元画像を無理に拡大しない（品質事故防止）
    await sharp(mainPath, { failOn: "none" })
      .resize(t.size, t.size, {
        fit: "cover",
        position: "center",
        withoutEnlargement: true
      })
      .webp({ quality: t.quality })
      .toFile(outPath);

    console.log(
      `[OK] ${path.relative(ROOT, mainPath)} -> ${path.relative(ROOT, outPath)} (${t.size} q${t.quality})`
    );
  }
}

async function makeZip(zipPath) {
  await fs.mkdir(path.dirname(zipPath), { recursive: true });

  const output = createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on("close", resolve);
    archive.on("warning", (err) => console.warn("[ZIP warning]", err));
    archive.on("error", reject);
  });

  archive.pipe(output);

  if (ZIP_ALL_FORMED) {
    // formed/ を丸ごと
    archive.directory(FORMED_DIR, "assets/images/works/formed");
  } else {
    // 派生だけ
    for await (const file of walk(FORMED_DIR)) {
      const name = path.basename(file);
      if (/-\d+\.webp$/.test(name) && !name.endsWith("-main.webp")) {
        archive.file(file, {
          name: path.join("assets", "images", "works", "formed", path.relative(FORMED_DIR, file))
        });
      }
    }
  }

  await archive.finalize();
  await done;
}

async function main() {
  if (!(await exists(FORMED_DIR))) {
    console.error(`[ERR] Not found: ${FORMED_DIR}`);
    process.exit(1);
  }

  const mains = [];
  for await (const file of walk(FORMED_DIR)) {
    if (isMainWebp(path.basename(file))) mains.push(file);
  }

  console.log(`[INFO] Found ${mains.length} main files`);
  if (mains.length === 0) {
    console.log("[INFO] No *-main.webp found. Nothing to do.");
  } else {
    for (const m of mains) {
      await ensureGenerated(m);
    }
  }

  const outZip = path.join(ROOT, "dist", "works-images.zip");
  await makeZip(outZip);
  console.log(`[DONE] ZIP: ${path.relative(ROOT, outZip)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
