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

function clean(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(value: string): number {
  const parsed = Number(
    value
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .trim()
  );

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid money value: ${value}`);
  }

  return parsed;
}

function parsePercent(value: string): number | null {
  const normalized = clean(value)
    .replace(/%/g, "")
    .trim();

  if (
    normalized === "" ||
    normalized === "-" ||
    /^n\/a$/i.test(normalized) ||
    /^na$/i.test(normalized) ||
    /^pending$/i.test(normalized)
  ) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseDate(value: string): string {
  const match = clean(value).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
  );

  if (!match) {
    throw new Error(`Invalid date value: ${value}`);
  }

  const [, month, day, year] = match;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function extractTables(
  $: cheerio.CheerioAPI
): Distribution[] {
  const distributions: Distribution[] = [];

  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th, thead td")
      .map((_, cell) =>
        clean($(cell).text()).toUpperCase()
      )
      .get();

    console.log("TABLE HEADERS:", headers);

    const hasDistributionHeader = headers.some(
      (header) =>
        header.includes("DISTRIBUTION") &&
        header.includes("SHARE")
    );

    const hasRocHeader = headers.some(
      (header) =>
        header === "ROC" ||
        header.includes("RETURN OF CAPITAL")
    );

    if (!hasDistributionHeader && !hasRocHeader) {
      return;
    }

    console.log("MATCHED DISTRIBUTION TABLE");

    $(table)
      .find("tbody tr")
      .each((_, row) => {
        const cells = $(row)
          .find("th, td")
          .map((_, cell) => clean($(cell).text()))
          .get();

        console.log("ROW:", cells);

        if (cells.length < 5) {
          return;
        }

        try {
          const moneyIndex = cells.findIndex((value) =>
            /^\$?[\d,]+\.\d+$/.test(value)
          );

          const dateValues = cells.filter((value) =>
            /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)
          );

          const rocValue = cells.find((value) =>
            /^\d+(?:\.\d+)?%$/.test(value) ||
            value === "-" ||
            /^n\/a$/i.test(value)
          );

          if (
            moneyIndex === -1 ||
            dateValues.length < 4
          ) {
            return;
          }

          distributions.push({
            distributionPerShare: parseMoney(
              cells[moneyIndex]
            ),
            declaredDate: parseDate(
              dateValues[0]
            ),
            exDate: parseDate(
              dateValues[1]
            ),
            recordDate: parseDate(
              dateValues[2]
            ),
            payableDate: parseDate(
              dateValues[3]
            ),
            rocPercent: rocValue
              ? parsePercent(rocValue)
              : null
          });
        } catch (error) {
          console.log(
            "Failed to parse row:",
            cells,
            error
          );
        }
      });
  });

  return distributions;
}

async function fetchHistory(): Promise<Distribution[]> {
  console.log(`Fetching: ${SOURCE_URL}`);

  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language":
        "en-US,en;q=0.9"
    },
    redirect: "follow"
  });

  console.log("HTTP STATUS:", response.status);
  console.log(
    "FINAL URL:",
    response.url
  );
  console.log(
    "CONTENT TYPE:",
    response.headers.get("content-type")
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch CHPY page: HTTP ${response.status}`
    );
  }

  const html = await response.text();

  console.log(
    "HTML LENGTH:",
    html.length
  );

  /*
   * 중요한 진단 로그입니다.
   *
   * 현재 GitHub Actions가 실제로 어떤 HTML을 받고 있는지
   * 확인하기 위해 주요 키워드 존재 여부를 출력합니다.
   */
  const keywords = [
    "CHPY",
    "Distribution",
    "distribution",
    "ROC",
    "Return of Capital",
    "table",
    "wp-json"
  ];

  console.log("KEYWORD CHECK:");

  for (const keyword of keywords) {
    console.log(
      `${keyword}:`,
      html.includes(keyword)
    );
  }

  /*
   * 응답 HTML의 앞부분을 로그에 출력합니다.
   *
   * 너무 길어지는 것을 방지하기 위해 5,000자까지만 출력합니다.
   */
  console.log("HTML PREVIEW START");
  console.log(
    html.substring(0, 5000)
  );
  console.log("HTML PREVIEW END");

  const $ = cheerio.load(html);

  console.log(
    "TABLE COUNT:",
    $("table").length
  );

  const distributions = extractTables($);

  if (distributions.length === 0) {
    throw new Error(
      [
        "No CHPY distribution rows were found.",
        "Check the GitHub Actions log above.",
        "The log contains HTTP status, final URL, HTML length,",
        "keyword checks, table count, and table headers."
      ].join(" ")
    );
  }

  const unique = new Map<
    string,
    Distribution
  >();

  for (const distribution of distributions) {
    unique.set(
      distribution.declaredDate,
      distribution
    );
  }

  return [...unique.values()].sort(
    (a, b) =>
      b.declaredDate.localeCompare(
        a.declaredDate
      )
  );
}

async function main(): Promise<void> {
  const distributions =
    await fetchHistory();

  const history: History = {
    ticker: "CHPY",
    source: SOURCE_URL,
    updatedAt: new Date().toISOString(),
    distributions
  };

  await mkdir(
    dirname(OUTPUT_FILE),
    {
      recursive: true
    }
  );

  await writeFile(
    OUTPUT_FILE,
    JSON.stringify(
      history,
      null,
      2
    ) + "\n",
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
