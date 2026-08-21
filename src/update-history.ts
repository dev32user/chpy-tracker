import * as cheerio from "cheerio";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const SOURCE_URL = "https://yieldmaxetfs.com/our-etfs/chpy/";
const OUTPUT_FILE = "docs/data/history.json";
const CHECK_ONLY = process.argv.includes("--check");

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

function clean(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseMoney(value: string): number {
  const n = Number(value.replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid money value: ${value}`);
  return n;
}

function parsePercent(value: string): number | null {
  const normalized = clean(value).replace("%", "");
  if (
    normalized === "" ||
    normalized === "-" ||
    /^(n\/a|na|pending)$/i.test(normalized)
  ) {
    return null;
  }

  const n = Number(normalized);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ROC value: ${value}`);
  }
  return n;
}

function parseDate(value: string): string {
  const match = clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) throw new Error(`Invalid date value: ${value}`);

  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function findDistributionTable($: cheerio.CheerioAPI) {
  const table = $("table").filter((_, element) => {
    const headers = $(element)
      .find("thead th, thead td")
      .map((_, cell) => clean($(cell).text()).toUpperCase())
      .get();

    const allText = clean($(element).text()).toUpperCase();

    return (
      headers.some((header) => header.includes("DISTRIBUTION PER SHARE")) &&
      (headers.some((header) => header === "ROC") || allText.includes("ROC"))
    );
  }).first();

  if (!table.length) {
    throw new Error(
      "CHPY distribution table was not found. The YieldMax page structure may have changed."
    );
  }

  return table;
}

async function fetchHistory(): Promise<Distribution[]> {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "User-Agent": "CHPY-ROC-Tracker/1.0 (personal historical data monitor)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch CHPY page: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const table = findDistributionTable($);
  const rows: Distribution[] = [];

  table.find("tbody tr").each((_, row) => {
    const cells = $(row)
      .find("th, td")
      .map((_, cell) => clean($(cell).text()))
      .get();

    if (cells.length < 6) return;

    try {
      rows.push({
        distributionPerShare: parseMoney(cells[0]),
        declaredDate: parseDate(cells[1]),
        exDate: parseDate(cells[2]),
        recordDate: parseDate(cells[3]),
        payableDate: parseDate(cells[4]),
        rocPercent: parsePercent(cells[5])
      });
    } catch {
      // Ignore non-data rows, but fail below if no valid distribution rows exist.
    }
  });

  if (rows.length === 0) {
    throw new Error(
      "No valid CHPY distribution rows were parsed. Check the page structure."
    );
  }

  const unique = new Map(rows.map((row) => [row.declaredDate, row]));
  return [...unique.values()].sort(
    (a, b) => b.declaredDate.localeCompare(a.declaredDate)
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

  if (CHECK_ONLY) {
    console.log(JSON.stringify(history, null, 2));
    return;
  }

  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(history, null, 2) + "\n");

  console.log(
    `Updated ${OUTPUT_FILE}: ${distributions.length} distributions collected.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
