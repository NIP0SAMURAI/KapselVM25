const fs = require("fs");
const vm = require("vm");

const appCode = fs.readFileSync("./app.js", "utf8");

// Minimal DOM / window mocks
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
  // document mock
  document: {
    body: { appendChild() {}, removeChild() {} },
    querySelector(sel) {
      // normalize selectors used in app.js
      const key = sel;
      if (!elements[key]) elements[key] = makeEl();
      return elements[key];
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag) {
      return makeEl();
    },
  },
  window: {
    addEventListener() {},
  },
  getComputedStyle() {
    return { paddingTop: "0px" };
  },
  alert(msg) {
    console.log("[alert]", msg);
  },
  confirm(msg) {
    console.log("[confirm]", msg);
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
  // minimal globals used by app.js
  fetchParticipantsFromDefaultSheet: async () => [],
  fetchParticipantsFromSample: async () => [],
};

// Provide globals that app.js sometimes expects as implicit globals (ids -> globals in browsers)
sandbox.btnNext = makeEl();
sandbox.btnReset = makeEl();
sandbox.btnExport = makeEl();
sandbox.fileImport = makeEl();

// Run app.js in the sandbox
vm.createContext(sandbox);
vm.runInContext(appCode, sandbox);

// Helper to build a match with given participant names and points
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

function runScenario(name, prevRound) {
  console.log("\n=== SCENARIO:", name, "===");
  // attach prev to sandbox and call buildNextRound
  try {
    const result = sandbox.buildNextRound(prevRound, 0);
    console.log(
      "buildNextRound returned:",
      result && {
        name: result.name,
        matches: result.matches.map((m) =>
          m.slots.map((s) => s.participant.name)
        ),
      }
    );
  } catch (e) {
    console.error("Error calling buildNextRound:", e);
  }
}

// Scenario 1: previous round has 3 matches each with 3 real players (semifinal candidate)
const prev1 = {
  id: "r1",
  name: "Round X",
  matches: [
    makeMatch(["A", "B", "C"], [3, 2, 1]),
    makeMatch(["D", "E", "F"], [3, 2, 1]),
    makeMatch(["G", "H", "I"], [3, 2, 1]),
  ],
  computed: true,
};
runScenario("3 matches of 3 players (should form Semifinal)", prev1);

// Scenario 2: previous round has winners but more candidates (pool > 9)
// build 6 matches -> winners+seconds = 12 advancers
const prev2 = { id: "r2", name: "Round Y", matches: [], computed: true };
for (let i = 0; i < 6; i++) {
  const base = i * 4;
  prev2.matches.push(
    makeMatch(
      ["P" + (base + 1), "P" + (base + 2), "P" + (base + 3), "P" + (base + 4)],
      [3, 2, 1, 0]
    )
  );
}
runScenario(
  "6 matches of 4 players (pool > 9, should NOT form Semifinal)",
  prev2
);

// Scenario 3: mixed matches producing exactly 9 candidates via winners->seconds->thirds
// Build 4 matches where winners (4) + seconds (3) + thirds (2) -> 9
const prev3 = { id: "r3", name: "Round Z", matches: [], computed: true };
// 4 matches: set points to arrange seconds selection
prev3.matches.push(makeMatch(["W1", "W2", "W3", "W4"], [3, 2, 1, 0]));
prev3.matches.push(makeMatch(["X1", "X2", "X3", "X4"], [3, 2, 1, 0]));
prev3.matches.push(makeMatch(["Y1", "Y2", "Y3", "Y4"], [3, 2, 1, 0]));
prev3.matches.push(makeMatch(["Z1", "Z2", "Z3", "Z4"], [3, 2, 1, 0]));
// Here winners=4, seconds=4 (total 8), thirds=4 available; candidate pool will be winners + seconds + thirds but unique and selected -> may be >9
runScenario(
  "4 matches of 4 players (likely pool >9, should NOT form Semifinal)",
  prev3
);

console.log("\nTest harness finished.");
