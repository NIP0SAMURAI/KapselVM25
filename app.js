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

/**
 * Distribute players into groups where each group has at least 4 players.
 * When possible, groups will be sized 4 or 5 so the real participants per
 * match are balanced and no match has fewer than 4 real players.
 */
function distributeIntoGroups(players) {
  const N = players.length;
  if (N === 0) return [];

  const minMatches = Math.ceil(N / 5);
  const maxMatches = Math.floor(N / 4);

  let m;
  if (minMatches <= maxMatches) {
    m = maxMatches; // prefer more matches (closer to 4 players each)
  } else {
    m = Math.ceil(N / 4); // fallback
  }

  const base = Math.floor(N / m);
  const rem = N % m;

  const groups = [];
  let idx = 0;
  for (let i = 0; i < m; i++) {
    const size = base + (i < rem ? 1 : 0);
    groups.push(players.slice(idx, idx + size));
    idx += size;
  }
  return groups;
}

function makeByes(count) {
  return Array.from({ length: count }, (_, i) => ({
    id: `bye_${i}_${uid()}`,
    name: "BYE",
  }));
}

function seedInitialRound(players) {
  const groups = distributeIntoGroups(players);
  const matches = groups.map((g) => {
    // Ensure each match has at least 4 slots (pad with BYEs if needed)
    const desiredSize = Math.max(4, g.length);
    const filled =
      g.length < desiredSize ? [...g, ...makeByes(desiredSize - g.length)] : g;
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
  // Debug: report advancers and previous round
  try {
    console.log(
      "[buildNextRound] prev.name=",
      prev.name,
      "advancers=",
      advancers.length,
      advancers.map((p) => p?.name)
    );
  } catch (err) {
    console.log("[buildNextRound] debug log failed", err);
  }

  // If previous round is already the Semifinal, build the Final Table from it:
  // take the 3 winners plus the best second (by points) -> final 4.
  if (prev.name === "Semifinal") {
    const cms = prev.matches.map((m) => computePlacements(m));
    try {
      console.log(
        "[buildNextRound] from Semifinal placements=",
        cms.map((c) => ({
          isComplete: c.isComplete,
          placements: (c.placements || []).map((p) => p?.name),
        }))
      );
    } catch (e) {
      console.log("[buildNextRound] debug placements failed", e);
    }
    if (
      !cms.every(
        (cm) => cm.isComplete && cm.placements && cm.placements.length >= 2
      )
    ) {
      return null; // need placements
    }
    const winners = cms.map((cm) => cm.placements[0]).filter(Boolean);
    const seconds = cms
      .map((cm, idx) => {
        const second = cm.placements[1];
        const pts =
          prev.matches[idx].slots.find((s) => s.participant?.id === second?.id)
            ?.points ?? 0;
        return { p: second, points: pts };
      })
      .filter((x) => x.p)
      .sort((a, b) => b.points - a.points || a.p.name.localeCompare(b.p.name));

    const bestSecond = seconds[0]?.p;
    const adv = [...winners];
    if (bestSecond) adv.push(bestSecond);
    const uniqueAdv = Array.from(new Map(adv.map((p) => [p.id, p])).values());
    if (uniqueAdv.length !== 4) return null;
    const groups = chunk4(uniqueAdv);
    const matches = groups.map((g) => ({
      id: `m_${uid()}`,
      slots: g.map((p) => ({ participant: p })),
      isComplete: false,
    }));
    return { id: `r_${uid()}`, name: "Final Table", matches, computed: false };
  }

  // Attempt to form a Semifinal of 9 players (3 matches × 3 players).
  // Build a candidate pool: winners first, then seconds (by points), then
  // third-placed players (by points). If we can select 9 unique players,
  // create the Semifinal and skip the minimum-4-player rule for this round.
  if (prev.name !== "Semifinal") {
    const cms = prev.matches.map((m) => computePlacements(m));
    // need placements for all matches to reason about winners/seconds/thirds
    if (cms.every((cm) => cm.isComplete && cm.placements)) {
      const winners = cms
        .map((cm) => cm.placements[0])
        .filter((p) => p && p.name !== "BYE");

      const seconds = cms
        .map((cm, idx) => {
          const second = cm.placements[1];
          if (!second || second.name === "BYE") return null;
          const pts =
            prev.matches[idx].slots.find((s) => s.participant?.id === second.id)
              ?.points ?? 0;
          return { p: second, points: pts };
        })
        .filter(Boolean)
        .sort(
          (a, b) => b.points - a.points || a.p.name.localeCompare(b.p.name)
        );

      // thirds param already contains third-placed players with points
      const thirdsSorted = [...thirds].sort(
        (a, b) => b.points - a.points || a.p.name.localeCompare(b.p.name)
      );

      // build candidate list: winners (unique), then seconds, then thirds
      const seen = new Set();
      const pool = [];
      winners.forEach((w) => {
        if (!seen.has(w.id)) {
          seen.add(w.id);
          pool.push(w);
        }
      });
      seconds.forEach((s) => {
        if (!seen.has(s.p.id)) {
          seen.add(s.p.id);
          pool.push(s.p);
        }
      });
      thirdsSorted.forEach((t) => {
        if (!seen.has(t.p.id)) {
          seen.add(t.p.id);
          pool.push(t.p);
        }
      });

      // Debug: log candidate pool before deciding on Semifinal
      try {
        console.log(
          "[buildNextRound] candidate pool length=",
          pool.length,
          "pool=",
          pool.map((p) => p?.name)
        );
      } catch (e) {
        console.log("[buildNextRound] debug pool log failed", e);
      }

      // Only create a Semifinal when we can select exactly 9 players.
      // Using >= allowed premature creation; require === 9 to match rule.
      if (pool.length === 9) {
        const selected = pool.slice(0, 9);
        const groups = [];
        for (let i = 0; i < 3; i++)
          groups.push(selected.slice(i * 3, i * 3 + 3));
        const matches = groups.map((g) => ({
          id: `m_${uid()}`,
          slots: g.map((p) => ({ participant: p })),
          isComplete: false,
        }));
        return {
          id: `r_${uid()}`,
          name: "Semifinal",
          matches,
          computed: false,
        };
      }
    }
  }

  // Special case: Semifinal-like format (three matches where each has at
  // least two real players). This covers BYE-padded matches (e.g. 3 real + 1 BYE)
  // We only create the Final Table here when taking the 3 winners + best
  // second yields exactly 4 unique advancers. Otherwise fall back to normal
  // advancer distribution.
  const isSemifinalFormat =
    prev.matches.length === 3 &&
    prev.matches.every((m) => {
      const realPlayers = m.slots.filter(
        (s) => s.participant && s.participant.name !== "BYE"
      );
      // require at least two real players so a 'second' position exists
      return realPlayers.length >= 2;
    });

  if (isSemifinalFormat) {
    // Ensure placements are computed for all matches
    const cms = prev.matches.map((m) => computePlacements(m));
    if (
      !cms.every(
        (cm) => cm.isComplete && cm.placements && cm.placements.length >= 2
      )
    ) {
      // can't proceed if placements not available
      return null;
    }

    const winners = cms.map((cm) => cm.placements[0]).filter(Boolean);
    const seconds = cms
      .map((cm, idx) => {
        const second = cm.placements[1];
        const pts =
          prev.matches[idx].slots.find((s) => s.participant?.id === second?.id)
            ?.points ?? 0;
        return { p: second, points: pts };
      })
      .filter((x) => x.p);

    // choose best second (points desc, then name)
    seconds.sort(
      (a, b) => b.points - a.points || a.p.name.localeCompare(b.p.name)
    );
    const bestSecond = seconds[0]?.p;
    const advCandidates = [...winners];
    if (bestSecond) advCandidates.push(bestSecond);

    // de-duplicate by id and ensure we have exactly 4 advancers before treating
    // this as the Final Table special case
    const uniqueAdv = Array.from(
      new Map(advCandidates.map((p) => [p.id, p])).values()
    );

    if (uniqueAdv.length === 4) {
      const groups = chunk4(uniqueAdv);
      const roundName = "Final Table";
      const matches = groups.map((g) => ({
        id: `m_${uid()}`,
        slots: g.map((p) => ({ participant: p })),
        isComplete: false,
      }));
      return { id: `r_${uid()}`, name: roundName, matches, computed: false };
    }
    // otherwise fall through to the normal advancer distribution logic
  }

  // Distribute advancers preferring 4/5 sized matches when possible
  let groups = distributeIntoGroups(advancers);

  // If any group has fewer than 4 real players, top-up with best third-placed players
  let remainingThirds = [...thirds].sort(
    (a, b) => b.points - a.points || a.p.name.localeCompare(b.p.name)
  );
  groups = groups.map((g) => {
    if (g.length >= 4) return g;
    const need = 4 - g.length;
    const take = remainingThirds.splice(0, need).map((t) => t.p);
    return [...g, ...take];
  });

  const totalAdv = groups.reduce((s, g) => s + g.length, 0);
  const isFinal = totalAdv === 4;
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
btnSeed.disabled = state.participants.length === 0 || state.rounds.length > 0;
const hasRounds = state.rounds.length > 0;
btnCompute.disabled = !hasRounds;
// Disable "Next" when there are no rounds or the last round is the Final Table
const lastRound = hasRounds ? state.rounds[state.rounds.length - 1] : null;
const lastIsFinal = lastRound && lastRound.name === "Final Table";
btnNext.disabled = !hasRounds || Boolean(lastIsFinal);

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

      // Highlight players who actually advance to the next round (if known)
      // We compute the candidate next round and mark any participant that
      // appears in its matches as an advancer.
      let advancerIds = new Set();
      if (round.computed) {
        try {
          const next = buildNextRound(round, rIdx);
          if (next && next.matches) {
            next.matches.forEach((nm) =>
              nm.slots.forEach((s) => {
                if (s.participant && s.participant.id) advancerIds.add(s.participant.id);
              })
            );
          }
        } catch (e) {
          // buildNextRound can return null or throw if placements missing; ignore
        }
      }

      if (advancerIds.size) {
        Array.from(matchEl.querySelectorAll(".slot")).forEach((slotDiv, i) => {
          const id = m.slots[i].participant?.id;
          if (id && advancerIds.has(id)) slotDiv.classList.add("highlight");
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

  // If this is the Final Table, determine the winner and show a popup
  const isFinalByName = r.name === "Final Table";
  if (isFinalByName) {
    // assume single final match
    const finalMatch = r.matches[0];
    if (finalMatch) {
      const cm = computePlacements(finalMatch);
      if (cm.isComplete && cm.placements && cm.placements.length) {
        const winner = cm.placements[0];
        if (winner && winner.name && winner.name !== "BYE") {
          showWinnerPopup(winner);
        }
      }
    }
  }
}

function buildNext() {
  if (!state.rounds.length) return;
  const prev = state.rounds[state.rounds.length - 1];
  // If we're already at the Final Table, do not build further rounds
  if (prev.name === "Final Table") {
    alert("Already at the Final Table. No further rounds can be generated.");
    return;
  }

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

/** Show a simple modal congratulating the winner */
function showWinnerPopup(winner) {
  // Guard
  if (!winner) return;
  // Remove existing overlay if present
  const existing = document.querySelector(".winner-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "winner-overlay";

  const card = document.createElement("div");
  card.className = "winner-card";

  if (winner.flagUrl) {
    const img = document.createElement("img");
    img.src = winner.flagUrl;
    img.alt = `${winner.name} flag`;
    card.appendChild(img);
  }

  const h = document.createElement("h2");
  h.textContent = `Congratulations, ${winner.name}!`;
  card.appendChild(h);

  const desc = document.createElement("p");
  desc.textContent = "You are the champion — well played!";
  card.appendChild(desc);

  const btn = document.createElement("button");
  btn.textContent = "Close";
  btn.addEventListener("click", () => overlay.remove());
  card.appendChild(btn);

  overlay.appendChild(card);
  document.body.appendChild(overlay);
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

if (btnUseSample) {
  btnUseSample.addEventListener("click", async () => {
    const people = await fetchParticipantsFromSample();
    state.participants = people;
    state.rounds = [];
    renderParticipants();
    renderRounds();
  });
}

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

if (btnExport) {
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
}

if (fileImport) {
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
}

/** Render tournament history inside the popup (replaces card content) */
function renderHistoryInPopup(overlay, card) {
  // Clear card
  card.innerHTML = "";
  const title = document.createElement("h2");
  title.textContent = "Tournament history";
  card.appendChild(title);

  const hist = document.createElement("div");
  hist.className = "history";

  if (!state.rounds.length) {
    const p = document.createElement("p");
    p.textContent = "No rounds yet.";
    hist.appendChild(p);
  } else {
    state.rounds.forEach((round, rIdx) => {
      const rdiv = document.createElement("div");
      rdiv.className = "round-entry";
      const rh = document.createElement("strong");
      rh.textContent = `${round.name} (${round.matches.length} match(es))`;
      rdiv.appendChild(rh);

      round.matches.forEach((m, mIdx) => {
        const mdiv = document.createElement("div");
        mdiv.className = "match-entry";
        const mh = document.createElement("div");
        mh.textContent = `Match ${mIdx + 1}`;
        mdiv.appendChild(mh);

        // compute placements to show points
        const cm = computePlacements(m);
        const list = document.createElement("div");
        cm.placements =
          cm.placements || m.slots.map((s) => s.participant).filter(Boolean);
        // show participants in order of placement if available, otherwise show slots
        const players = cm.placements.length
          ? cm.placements
          : m.slots.map((s) => s.participant).filter(Boolean);
        players.forEach((p) => {
          const pl = document.createElement("div");
          pl.className = "player-line";
          const img = document.createElement("img");
          img.src = p?.flagUrl || "";
          img.alt = "";
          pl.appendChild(img);
          const name = document.createElement("div");
          name.className = "player-name";
          name.textContent = p?.name || "";
          pl.appendChild(name);
          const points = m.slots.find(
            (s) => s.participant?.id === p?.id
          )?.points;
          const pts = document.createElement("div");
          pts.className = "player-points";
          pts.textContent = typeof points === "number" ? String(points) : "-";
          pl.appendChild(pts);
          list.appendChild(pl);
        });

        mdiv.appendChild(list);
        rdiv.appendChild(mdiv);
      });

      hist.appendChild(rdiv);
    });
  }

  card.appendChild(hist);

  const back = document.createElement("button");
  back.textContent = "Back";
  back.addEventListener("click", () => {
    overlay.remove();
    // Re-open winner popup by finding winner from last final round if any
    const last = state.rounds[state.rounds.length - 1];
    if (last && last.name === "Final Table") {
      const fm = last.matches[0];
      if (fm) {
        const cm = computePlacements(fm);
        const winner = cm.placements?.[0];
        if (winner) showWinnerPopup(winner);
      }
    }
  });
  card.appendChild(back);
}

// Initialize
renderParticipants();
renderRounds();

// Ensure main content is pushed below the fixed header so it doesn't hide under it.
function adjustMainPadding() {
  const topbar = document.querySelector(".topbar");
  const mainEl = document.querySelector("main");
  if (!topbar || !mainEl) return;
  const cs = getComputedStyle(mainEl);
  const currentTop = parseFloat(cs.paddingTop) || 0;
  // Set padding-top to existing top padding plus header height
  // Add extra 24px so content is comfortably below the fixed header
  const EXTRA_OFFSET = 24; // px
  mainEl.style.paddingTop = `${
    topbar.offsetHeight + currentTop + EXTRA_OFFSET
  }px`;
}

window.addEventListener("resize", () => adjustMainPadding());
// run after a short delay to allow fonts and layout to stabilise
setTimeout(adjustMainPadding, 50);
