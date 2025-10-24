// app.js – Tournament logic + UI (vanilla JS)

const uid = () => Math.random().toString(36).slice(2);

// --- Data types in comments ---
// Participant: { id, name, flagUrl }
// PlayerSlot: { participant, points }
// Match: { id, slots: PlayerSlot[4], isComplete, placements?: Participant[] }
// Round: { id, name, matches: Match[], computed }

const state = {
  participants: [],
  rounds: [],
};

// ====== Helpers ======
function chunk4(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4));
  return out;
}

function makeByes(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bye_${i}_${uid()}`,
    name: "BYE",
  }));
}

function seedInitialRound(players) {
  const groups = chunk4(players);
  const matches = groups.map((g) => {
    const filled = g.length < 4 ? [...g, ...makeByes(4 - g.length)] : g;
    return {
      id: `m_${uid()}`,
      slots: filled.map((p) => ({
        participant: p,
        points: p.name === "BYE" ? 0 : undefined,
      })),
      isComplete: false,
    };
  });
  return { id: `r_${uid()}`, name: "Round 1", matches, computed: false };
}

function computePlacements(match) {
  // Incomplete if any real participant lacks points
  const needs = match.slots.some(
    (s) =>
      s.participant &&
      s.participant.name !== "BYE" &&
      typeof s.points !== "number"
  );
  if (needs) return { ...match, isComplete: false };

  const withIdx = match.slots.map((s, idx) => ({ idx, slot: s }));
  const sorted = withIdx.sort((a, b) => {
    const pa = a.slot.points ?? -Infinity;
    const pb = b.slot.points ?? -Infinity;
    if (pb !== pa) return pb - pa; // desc
    const na = a.slot.participant?.name || "";
    const nb = b.slot.participant?.name || "";
    if (na !== nb) return na.localeCompare(nb);
    return (a.slot.participant?.id || "").localeCompare(
      b.slot.participant?.id || ""
    );
  });
  const placements = sorted.map((x) => x.slot.participant).filter(Boolean);
  return { ...match, placements, isComplete: true };
}

function nextRoundFrom(current) {
  const advancers = [];
  const thirds = []; // { p, points }
  current.matches.forEach((m) => {
    const cm = computePlacements(m);
    if (!cm.isComplete || !cm.placements) return;
    const [first, second, third] = cm.placements;
    if (first && first.name !== "BYE") advancers.push(first);
    if (second && second.name !== "BYE") advancers.push(second);
    if (third && third.name !== "BYE") {
      const pts =
        m.slots.find((s) => s.participant?.id === third.id)?.points ?? 0;
      thirds.push({ p: third, points: pts });
    }
  });
  return { advancers, thirds };
}

function buildNextRound(prev, roundIndex) {
  const { advancers, thirds } = nextRoundFrom(prev);
  if (advancers.length === 0) return null;

  const mod = advancers.length % 4;
  if (mod !== 0) {
    const need = 4 - mod;
    const sortedThirds = [...thirds].sort(
      (a, b) => b.points - a.points || a.p.name.localeCompare(b.p.name)
    );
    advancers.push(...sortedThirds.slice(0, need).map((t) => t.p));
  }

  const groups = chunk4(advancers);
  const isFinal = advancers.length === 4;
  const roundName = isFinal ? "Final Table" : `Round ${roundIndex + 2}`;
  const matches = groups.map((g) => ({
    id: `m_${uid()}`,
    slots: g.map((p) => ({ participant: p })),
    isComplete: false,
  }));
  return { id: `r_${uid()}`, name: roundName, matches, computed: false };
}

// ====== UI ======
const el = (sel) => document.querySelector(sel);
const pCount = el("#pCount");
const pList = el("#pList");
const roundsContainer = el("#roundsContainer");

const btnLoad = el("#btnLoad");
const btnUseSample = el("#btnUseSample");
const btnSeed = el("#btnSeed");
const btnCompute = el("#btnCompute");
const btnNext = el("#btnNext");
const btnReset = el("#btnReset");
const btnExport = el("#btnExport");
const fileImport = el("#fileImport");

function renderParticipants() {
  pCount.textContent = String(state.participants.length);
  pList.innerHTML = "";
  state.participants.forEach((p) => {
    const div = document.createElement("div");
    div.className = "pill";
    const img = document.createElement("img");
    img.src = p.flagUrl || "";
    img.alt = "";
    div.appendChild(img);
    const span = document.createElement("span");
    span.textContent = p.name;
    div.appendChild(span);
    pList.appendChild(div);
  });
}

function slotRow(slot, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "slot";

  const img = document.createElement("img");
  img.className = "flag";
  img.src = slot.participant?.flagUrl || "";
  wrap.appendChild(img);

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = slot.participant?.name || "";
  wrap.appendChild(name);

  const input = document.createElement("input");
  input.type = "number";
  input.className = "points";
  input.min = "0";
  input.step = "1";
  if (typeof slot.points === "number") input.value = String(slot.points);
  input.disabled = slot.participant?.name === "BYE";
  input.addEventListener("input", () => onChange(Number(input.value)));
  wrap.appendChild(input);

  return { wrap, input };
}

function renderRounds() {
  roundsContainer.innerHTML = "";
  state.rounds.forEach((round, rIdx) => {
    const roundEl = document.createElement("div");
    roundEl.className = "round";
    const h3 = document.createElement("h3");
    h3.textContent = round.name;
    roundEl.appendChild(h3);

    const meta = document.createElement("div");
    meta.className = "meta";
    const stats = `${round.matches.length} match(es)`;
    meta.textContent = stats;
    roundEl.appendChild(meta);

    round.matches.forEach((m, mIdx) => {
      const matchEl = document.createElement("div");
      matchEl.className = "match";

      const updated = () => {
        // Normalize empty -> undefined
        m.slots.forEach((s) => {
          if (typeof s.points === "number" && Number.isNaN(s.points))
            s.points = undefined;
        });
      };

      // 4 slots
      m.slots.forEach((s, sIdx) => {
        const { wrap } = slotRow(s, (val) => {
          s.points = Number.isNaN(val) ? undefined : val;
          updated();
        });
        matchEl.appendChild(wrap);
      });

      // if complete, highlight top 2
      const cm = computePlacements(m);
      if (cm.isComplete && cm.placements) {
        // map placements to slot indices to add highlight
        const sorted = [...m.slots].sort(
          (a, b) => (b.points ?? -Infinity) - (a.points ?? -Infinity)
        );
        const top2 = sorted.slice(0, 2).map((x) => x.participant?.id);
        Array.from(matchEl.querySelectorAll(".slot")).forEach((slotDiv, i) => {
          const id = m.slots[i].participant?.id;
          if (top2.includes(id)) slotDiv.classList.add("highlight");
        });
      }

      roundEl.appendChild(matchEl);
    });

    roundsContainer.appendChild(roundEl);
  });

  // Control buttons state
  btnSeed.disabled = state.participants.length === 0 || state.rounds.length > 0;
  const hasRounds = state.rounds.length > 0;
  btnCompute.disabled = !hasRounds;
  btnNext.disabled = !hasRounds;
}

function computeCurrentRound() {
  if (!state.rounds.length) return;
  const r = state.rounds[state.rounds.length - 1];
  // Validate all matches complete
  const allComplete = r.matches.every((m) => computePlacements(m).isComplete);
  if (!allComplete) {
    alert(
      "Fill points for all non-BYE players in this round before computing."
    );
    return;
  }
  r.computed = true;
  renderRounds();
}

function buildNext() {
  if (!state.rounds.length) return;
  const prev = state.rounds[state.rounds.length - 1];
  if (!prev.computed) {
    alert("Compute the current round first.");
    return;
  }
  const next = buildNextRound(prev, state.rounds.length - 1);
  if (!next) {
    alert("No advancers.");
    return;
  }
  state.rounds.push(next);
  renderRounds();
}

// ====== Wiring ======
btnLoad.addEventListener("click", async () => {
  // Use the bundled default Google Sheet CSV URL (published sheet)
  try {
    const people = await fetchParticipantsFromDefaultSheet();
    state.participants = people;
    state.rounds = [];
    renderParticipants();
    renderRounds();
  } catch (e) {
    console.error(e);
    alert("Failed to load CSV. See console for details.");
  }
});

btnUseSample.addEventListener("click", async () => {
  const people = await fetchParticipantsFromSample();
  state.participants = people;
  state.rounds = [];
  renderParticipants();
  renderRounds();
});

btnSeed.addEventListener("click", () => {
  if (!state.participants.length) return;
  const r1 = seedInitialRound(state.participants);
  state.rounds = [r1];
  renderRounds();
});

btnCompute.addEventListener("click", () => computeCurrentRound());
btnNext.addEventListener("click", () => buildNext());

btnReset.addEventListener("click", () => {
  if (!confirm("Clear participants and rounds?")) return;
  state.participants = [];
  state.rounds = [];
  renderParticipants();
  renderRounds();
});

btnExport.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tournament-state-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

fileImport.addEventListener("change", (ev) => {
  const file = ev.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const obj = JSON.parse(String(reader.result));
      if (
        !obj ||
        !Array.isArray(obj.participants) ||
        !Array.isArray(obj.rounds)
      )
        throw new Error("Bad file");
      state.participants = obj.participants;
      state.rounds = obj.rounds;
      renderParticipants();
      renderRounds();
    } catch (e) {
      alert("Invalid state file.");
    }
  };
  reader.readAsText(file);
});

// Initialize
renderParticipants();
renderRounds();
