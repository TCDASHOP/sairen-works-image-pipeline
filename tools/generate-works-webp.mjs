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

  // ✅ ZIP内の見た目だけ "out/{size}/YYYY/..." に整形
  // 例: out/960/2020/artifact-08-960.webp
  //     out/1440/2020/artifact-08-1440.webp
  //     out/2048/2020/artifact-08-2048.webp
  //     out/main/2020/artifact-08-main.webp（任意で入れる）
  if (!(await exists(FORMED_DIR))) {
    archive.append("formed directory is missing in repo.\n", { name: "README-EMPTY.txt" });
    await archive.finalize();
    await done;
    return;
  }

  for await (const file of walk(FORMED_DIR)) {
    const rel = path.relative(FORMED_DIR, file); // 例: 2020/artifact-08-960.webp
    const base = path.basename(file);

    // mainも入れたいなら true（不要なら false）
    const INCLUDE_MAIN = true;

    if (INCLUDE_MAIN && base.endsWith("-main.webp")) {
      archive.file(file, { name: path.join("out", "main", rel) });
      continue;
    }

    // -960/-1440/-2048 だけ out/{size}/ に入れる
    const m = base.match(/-(960|1440|2048)\.webp$/);
    if (m) {
      const size = m[1];
      archive.file(file, { name: path.join("out", size, rel) });
    }
  }

  await archive.finalize();
  await done;
}
