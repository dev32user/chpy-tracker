import { mkdir } from "node:fs/promises";
import { join } from "node:path";
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

function formatRoc(value: number | null): string {
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

  return `chpy-${declaredDate}-${roc}.png`;
}

export async function generateOgImage(
  data: OgImageData
): Promise<string> {
  await mkdir(OUTPUT_DIR, {
    recursive: true
  });

  const fileName = createFileName(
    data.declaredDate,
    data.rocPercent
  );

  const outputFile = join(
    OUTPUT_DIR,
    fileName
  );

  const date = escapeXml(
    data.declaredDate
  );

  const roc = escapeXml(
    formatRoc(data.rocPercent)
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

  await sharp(
    Buffer.from(svg)
  )
    .png()
    .toFile(outputFile);

  console.log(
    `Generated OG image: ${outputFile}`
  );

  return outputFile;
}
