import * as cheerio from "cheerio";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const SOURCE_URL = "https://yieldmaxetfs.com/our-etfs/chpy/";
const OUTPUT_FILE = "docs/data/history.json";

type Distribution = {
  distributionPerShare: number;
  declaredDate: string;
  exDate: string;
  recordDate: string;
  payableDate: string;
  rocPercent: number | null;
};

type History = {
  ticker: "CHPY";
  source: string;
  updatedAt: string;
  distributions: Distribution[];
};

function parseMoney(value: string): number {
  return Number(value.replace(/[$,]/g, "").trim());
}

function parsePercent(value: string): number | null {
  const text = value.replace("%", "").trim();

  if (
    !text ||
    text === "-" ||
    /^(n\/a|na|pending)$/i.test(text)
  ) {
    return null;
  }

  const valueNumber = Number(text);

  if (!Number.isFinite(valueNumber)) {
    return null;
  }

  return valueNumber;
}

function parseDate(value: string): string {
  const match = value.trim().match(
    /^(\d{2})\/(\d{2})\/(\d{4})$/
  );

  if (!match) {
    throw new Error(`Invalid date: ${value}`);
  }

  const [, month, day, year] = match;

  return `${year}-${month}-${day}`;
}

async function fetchHistory(): Promise<Distribution[]> {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 CHPY-ROC-Tracker/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch CHPY page: HTTP ${response.status}`
    );
  }

  const html = await response.text();

  // HTML 태그 제거 후 텍스트 기준으로 처리
  const $ = cheerio.load(html);

  const text = $.root()
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ");

  const distributionsIndex =
    text.indexOf("DISTRIBUTION PER SHARE");

  if (distributionsIndex === -1) {
    throw new Error(
      "Distribution header was not found in CHPY page."
    );
  }

  // Distribution 섹션부터 이후 텍스트만 사용
  const distributionText =
    text.substring(distributionsIndex);

  /*
   * 데이터 형식:
   *
   * $0.5702
   * 08/18/2026
   * 08/19/2026
   * 08/19/2026
   * 08/20/2026
   * 100.00%
   *
   * 또는 HTML 구조상 값들이 한 줄로 이어져 있어도
   * 정규식으로 직접 추출한다.
   */

  const rowPattern =
    /\$([\d,]+\.\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+([\d.]+%|-|N\/A|NA|Pending)/gi;

  const distributions: Distribution[] = [];

  for (const match of distributionText.matchAll(rowPattern)) {
    const [
      ,
      distributionPerShare,
      declaredDate,
      exDate,
      recordDate,
      payableDate,
      rocPercent
    ] = match;

    distributions.push({
      distributionPerShare: parseMoney(distributionPerShare),
      declaredDate: parseDate(declaredDate),
      exDate: parseDate(exDate),
      recordDate: parseDate(recordDate),
      payableDate: parseDate(payableDate),
      rocPercent: parsePercent(rocPercent)
    });
  }

  if (distributions.length === 0) {
    throw new Error(
      "No CHPY distribution rows were found. The page structure may have changed."
    );
  }

  // declaredDate 기준 중복 제거
  const unique = new Map<string, Distribution>();

  for (const distribution of distributions) {
    unique.set(
      distribution.declaredDate,
      distribution
    );
  }

  return [...unique.values()].sort((a, b) =>
    b.declaredDate.localeCompare(a.declaredDate)
  );
}

async function main() {
  const distributions = await fetchHistory();

  const history: History = {
    ticker: "CHPY",
    source: SOURCE_URL,
    updatedAt: new Date().toISOString(),
    distributions
  };

  await mkdir(dirname(OUTPUT_FILE), {
    recursive: true
  });

  await writeFile(
    OUTPUT_FILE,
    JSON.stringify(history, null, 2) + "\n",
    "utf-8"
  );

  console.log(
    `Updated ${OUTPUT_FILE}: ${distributions.length} distributions collected.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
