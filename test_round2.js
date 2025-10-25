const fs = require("fs");
const vm = require("vm");

const appCode = fs.readFileSync("./app.js", "utf8");

// Minimal DOM mock used by app.js
const elements = {};
function makeEl() {
  return {
    innerHTML: "",
    textContent: "",
    disabled: false,
    value: "",
    children: [],
    className: "",
    appendChild(child) {
      this.children.push(child);
    },
    remove() {},
    addEventListener() {},
    querySelector() {
      return null;
    },
    style: {},
  };
}
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  document: {
    body: { appendChild() {} },
    querySelector(sel) {
      if (!elements[sel]) elements[sel] = makeEl();
      return elements[sel];
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return makeEl();
    },
  },
  window: { addEventListener() {} },
  getComputedStyle() {
    return { paddingTop: "0px" };
  },
  alert() {},
  confirm() {
    return true;
  },
  FileReader: class {
    constructor() {
      this.onload = null;
    }
    readAsText() {
      if (this.onload) this.onload();
    }
  },
  // minimal globals
  btnNext: makeEl(),
  btnReset: makeEl(),
  btnExport: makeEl(),
  fileImport: makeEl(),
  fetchParticipantsFromDefaultSheet: async () => [],
  fetchParticipantsFromSample: async () => [],
};
vm.createContext(sandbox);
vm.runInContext(appCode, sandbox);

function makeParticipant(name) {
  return { id: name.toLowerCase().replace(/\s+/g, "_"), name, flagUrl: "" };
}
function makeMatch(names, points) {
  return {
    id: "m_" + Math.random().toString(36).slice(2),
    slots: names.map((n, i) => ({
      participant: makeParticipant(n),
      points: points[i],
    })),
    isComplete: false,
  };
}

// Build a Round 1 with 6 matches; each match has 4 real players with points 4,3,2,1
const prev = { id: "r1", name: "Round 1", matches: [], computed: true };
for (let i = 0; i < 6; i++) {
  const base = i * 4;
  prev.matches.push(
    makeMatch(
      ["P" + (base + 1), "P" + (base + 2), "P" + (base + 3), "P" + (base + 4)],
      [4, 3, 2, 1]
    )
  );
}

console.log("Running Round2 composition test...");
try {
  const next = sandbox.buildNextRound(prev, 0);
  if (!next) {
    console.log("buildNextRound returned null");
    process.exit(1);
  }
  console.log("Next round name:", next.name);
  next.matches.forEach((m, i) => {
    console.log(
      `Match ${i}:`,
      m.slots.map((s) => s.participant.name)
    );
  });
  // check each next match has 5 players if possible
  const all5 = next.matches.every((m) => m.slots.length === 5);
  console.log("All next matches have 5 players?", all5);
} catch (e) {
  console.error("Error", e);
  process.exit(2);
}
