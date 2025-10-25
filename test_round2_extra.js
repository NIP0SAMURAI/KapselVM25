const fs = require("fs");
const vm = require("vm");
const appCode = fs.readFileSync("./app.js", "utf8");

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

function runScenario(name, prev) {
  console.log("\n=== SCENARIO:", name, "===");
  try {
    const res = sandbox.buildNextRound(prev, 0);
    console.log(
      "result:",
      res
        ? {
            name: res.name,
            matches: res.matches.map((m) =>
              m.slots.map((s) => s.participant.name)
            ),
          }
        : null
    );
  } catch (e) {
    console.error("Error", e);
  }
}

// Scenario A: Pair where one match has BYE (only 3 real players)
const prevA = { id: "rA", name: "Round 1", matches: [], computed: true };
prevA.matches.push(makeMatch(["A1", "A2", "A3", "BYE"], [4, 3, 2, 0]));
prevA.matches.push(makeMatch(["B1", "B2", "BYE", "BYE"], [4, 3, 0, 0]));
// fill remaining pairs to make 6 matches total
for (let i = 2; i < 6; i++)
  prevA.matches.push(
    makeMatch(
      [
        "P" + (i * 4 + 1),
        "P" + (i * 4 + 2),
        "P" + (i * 4 + 3),
        "P" + (i * 4 + 4),
      ],
      [4, 3, 2, 1]
    )
  );
runScenario("Round1 with BYEs in a pair", prevA);

// Scenario B: Odd number of matches (5), last pairs with itself
const prevB = { id: "rB", name: "Round 1", matches: [], computed: true };
for (let i = 0; i < 5; i++)
  prevB.matches.push(
    makeMatch(
      ["X" + (i * 3 + 1), "X" + (i * 3 + 2), "X" + (i * 3 + 3)],
      [3, 2, 1]
    )
  );
runScenario("Odd number of matches (5)", prevB);

// Scenario C: Some matches missing thirds (only 2 players)
const prevC = { id: "rC", name: "Round 1", matches: [], computed: true };
prevC.matches.push(makeMatch(["M1", "M2", "BYE", "BYE"], [3, 2, 0, 0]));
prevC.matches.push(makeMatch(["N1", "N2", "N3", "BYE"], [3, 2, 1, 0]));
for (let i = 2; i < 6; i++)
  prevC.matches.push(
    makeMatch(
      [
        "Q" + (i * 4 + 1),
        "Q" + (i * 4 + 2),
        "Q" + (i * 4 + 3),
        "Q" + (i * 4 + 4),
      ],
      [4, 3, 2, 1]
    )
  );
runScenario("Pairs with missing thirds", prevC);

console.log("\nExtra tests finished");
