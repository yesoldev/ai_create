/**
 * 아이콘 오프라인 번들 생성.
 *
 * @iconify/react 는 기본적으로 api.iconify.design 에서 아이콘을 런타임에 받아온다.
 * 사내망·오프라인에서는 아이콘이 전부 사라지므로, src 에서 실제로 쓰는 아이콘만
 * 골라 src/lib/icons.generated.ts 로 구워 둔다. (아이콘을 새로 쓰면 `npm run icons`)
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getIcons } from "@iconify/utils";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(SRC, "lib", "icons.generated.ts");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

// src 전체에서 "ph:아이콘-이름" 문자열 수집
const names = new Set();
for (const file of walk(SRC)) {
  if (!/\.(ts|tsx)$/.test(file) || file.endsWith("icons.generated.ts")) continue;
  for (const m of readFileSync(file, "utf8").matchAll(/["'`](ph:[a-z0-9-]+)["'`]/g)) {
    names.add(m[1].slice(3));
  }
}

const full = JSON.parse(
  readFileSync(join(ROOT, "node_modules", "@iconify-json", "ph", "icons.json"), "utf8"),
);
const subset = getIcons(full, [...names]);

const missing = subset?.not_found ?? [];
if (missing.length) {
  console.error(`없는 아이콘 이름: ${missing.join(", ")}`);
  process.exit(1);
}

writeFileSync(
  OUT,
  "// 자동 생성 파일 — 직접 고치지 말고 `npm run icons` 를 실행할 것.\n" +
    "// src 에서 쓰는 Phosphor 아이콘만 담은 오프라인 번들.\n" +
    'import type { IconifyJSON } from "@iconify/react";\n\n' +
    `const icons: IconifyJSON = ${JSON.stringify(subset)};\n\nexport default icons;\n`,
  "utf8",
);

console.log(`아이콘 ${Object.keys(subset.icons).length}개 번들 → ${OUT}`);
