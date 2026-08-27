import {
  mkdir,
  readdir,
  unlink
} from "node:fs/promises";

import {
  join,
  resolve
} from "node:path";

import sharp from "sharp";

export type OgImageData = {
  declaredDate: string;
  rocPercent: number | null;
};

const OUTPUT_DIR = "docs/og";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatRoc(
  value: number | null
): string {
  if (value === null) {
    return "-";
  }

  return `${value.toFixed(2)}%`;
}

function createFileName(
  declaredDate: string,
  rocPercent: number | null
): string {
  const roc =
    rocPercent === null
      ? "na"
      : rocPercent.toFixed(2);

  return `chpy-${declaredDate}-${roc}.jpg`;
}

async function removeOldOgImages(
  keepFile: string
): Promise<void> {
  const files = await readdir(
    OUTPUT_DIR,
    {
      withFileTypes: true
    }
  );

  const keepFilePath = resolve(
    keepFile
  );

  const imageExtensions =
    /\.(png|jpg|jpeg|webp)$/i;

  for (const file of files) {
    if (
      !file.isFile() ||
      !imageExtensions.test(file.name)
    ) {
      continue;
    }

    const filePath = join(
      OUTPUT_DIR,
      file.name
    );

    if (
      resolve(filePath) ===
      keepFilePath
    ) {
      continue;
    }

    await unlink(filePath);

    console.log(
      `Removed old OG image: ${filePath}`
    );
  }
}

export async function generateOgImage(
  data: OgImageData
): Promise<string> {
  await mkdir(
    OUTPUT_DIR,
    {
      recursive: true
    }
  );

  const fileName =
    createFileName(
      data.declaredDate,
      data.rocPercent
    );

  const outputFile =
    join(
      OUTPUT_DIR,
      fileName
    );

  const date =
    escapeXml(
      data.declaredDate
    );

  const roc =
    escapeXml(
      formatRoc(
        data.rocPercent
      )
    );

  const svg = `
<svg
  width="1200"
  height="630"
  viewBox="0 0 1200 630"
  xmlns="http://www.w3.org/2000/svg"
>
  <rect
    width="1200"
    height="630"
    fill="#ffffff"
  />

  <rect
    x="60"
    y="60"
    width="1080"
    height="510"
    rx="32"
    fill="#f8f9fa"
    stroke="#dddddd"
    stroke-width="2"
  />

  <text
    x="600"
    y="180"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="64"
    font-weight="700"
    fill="#111111"
  >
    CHPY ROC History
  </text>

  <line
    x1="200"
    y1="240"
    x2="1000"
    y2="240"
    stroke="#dddddd"
    stroke-width="2"
  />

  <text
    x="600"
    y="350"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="72"
    font-weight="600"
    fill="#222222"
  >
    ${date}
  </text>

  <text
    x="600"
    y="470"
    text-anchor="middle"
    font-family="Arial, sans-serif"
    font-size="88"
    font-weight="700"
    fill="#111111"
  >
    ROC: ${roc}
  </text>
</svg>
`.trim();

  /*
   * 먼저 새 이미지를 생성합니다.
   * 생성이 성공하기 전에는 기존 이미지를 삭제하지 않습니다.
   */
  await sharp(
    Buffer.from(svg)
  )
    .jpeg({
      quality: 70,
      progressive: true,
      mozjpeg: true
    })
    .toFile(
      outputFile
    );

  console.log(
    `Generated OG image: ${outputFile}`
  );

  /*
   * 새 이미지 생성이 성공한 후,
   * 새 파일을 제외한 기존 OG 이미지를 삭제합니다.
   */
  await removeOldOgImages(
    outputFile
  );

  return outputFile;
}
