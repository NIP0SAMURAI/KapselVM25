// sheets.js – Fetch participants from a published-to-web Google Sheet (CSV)
// Supported CSV headers (case-insensitive):
// - Name / Participant / Participants  -> participant name
// - Flag / Country / Countries         -> flag URL

// Default Google Sheets (published) CSV to use when user chooses "Load".
const DEFAULT_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSac9m1rxVUX63yWLU6cOOBVGxFRhqiNctV8enmlSSB0QsrGSAh2OVCbF4kOrVwwMsf8mksijRvda6l/pub?output=csv";

/** Parse CSV text to rows (very light parser, expects no embedded commas in fields). */
function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",").map((c) => c.trim()))
    .filter((row) => row.length && row.some((c) => c !== ""));
}

/** Convert CSV rows to participants */
function participantsFromCsvRows(rows) {
  if (!rows.length) return [];
  const [header, ...data] = rows;
  // Accept a variety of header names for name and flag
  const idxName = header.findIndex((h) =>
    /^(name|participant|participants)$/i.test(h)
  );
  const idxFlag = header.findIndex((h) =>
    /^(flag|country|countries)$/i.test(h)
  );
  // Fallbacks: first column -> name, second column -> flag
  const nameIdx = idxName >= 0 ? idxName : 0;
  const flagIdx = idxFlag >= 0 ? idxFlag : 1;

  return data
    .map((r, i) => {
      const name = (r[nameIdx] || "").trim();
      const flag = (r[flagIdx] || "").trim();
      if (!name) return null;
      return {
        id: `p_${i}_${Math.random().toString(36).slice(2)}`,
        name,
        flagUrl: flag || undefined,
      };
    })
    .filter(Boolean);
}

/** Fetch participants via a CSV URL */
async function fetchParticipantsFromCsvUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  return participantsFromCsvRows(rows);
}

/** Fetch participants from the default published Google Sheet CSV */
async function fetchParticipantsFromDefaultSheet() {
  return fetchParticipantsFromCsvUrl(DEFAULT_SHEET_CSV_URL);
}

/** Fetch participants from a local sample CSV */
async function fetchParticipantsFromSample() {
  const res = await fetch("assets/sample.csv");
  const text = await res.text();
  const rows = parseCsv(text);
  return participantsFromCsvRows(rows);
}
