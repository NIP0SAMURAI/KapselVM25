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

/** Convert 0-based index to alphabetical label: 0->A, 25->Z, 26->AA, etc. */
function indexToLabel(i) {
  const A = 65; // 'A'
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(A + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
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

// Find participant object by id
function findParticipantById(id) {
  return state.participants.find((p) => p.id === id);
}

// Return a set of participant ids assigned in the first round (useful for manual setup)
function assignedInFirstRound() {
  const ids = new Set();
  if (!state.rounds.length) return ids;
  const first = state.rounds[0];
  if (!first) return ids;
  first.matches.forEach((m) =>
    m.slots.forEach((s) => {
      if (s.participant && s.participant.id) ids.add(s.participant.id);
    })
  );
  return ids;
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

/** Compute group sizes for the first (manual) round using same balancing rules
 * so no group will have fewer than 4 real players (sizes are 4 or 5 when possible).
 */
function computeGroupSizes(N) {
  if (N <= 0) return [];
  const minMatches = Math.ceil(N / 5);
  const maxMatches = Math.floor(N / 4) || 1;
  let m;
  if (minMatches <= maxMatches) m = maxMatches;
  else m = Math.ceil(N / 4);
  const base = Math.floor(N / m);
  const rem = N % m;
  const sizes = [];
  for (let i = 0; i < m; i++) sizes.push(base + (i < rem ? 1 : 0));
  return sizes;
}

/** Compute group sizes with fixed group count `gCount` while ensuring each group
 * has at least 4 players if possible. If gCount is too large for N, it will be
 * reduced so groups of at least 4 can be formed.
 */
function computeGroupSizesForCount(N, gCount) {
  if (N <= 0) return [];
  // By default, compute groups while ensuring at least 4 per group when possible.
  // However some users may prefer a forced group count (for example 6 groups)
  // even if that yields groups smaller than 4. The original caller may cap the
  // groups; here we will compute sizes for the requested count but cap it to
  // at most N (can't have more groups than players).
  const mRequested = Math.max(1, Math.min(gCount, N));
  // If mRequested would result in groups smaller than 3 and the caller did not
  // explicitly request such a small group count, the previous behavior kept
  // groups >=4 by capping with Math.floor(N/4). Keep that behavior if the
  // requested count is <= Math.floor(N/4); otherwise honor the request.
  const maxGroupsKeeping4 = Math.max(1, Math.floor(N / 4));
  const m =
    mRequested > maxGroupsKeeping4
      ? mRequested
      : Math.min(mRequested, maxGroupsKeeping4);
  const base = Math.floor(N / m);
  const rem = N % m;
  const sizes = [];
  for (let i = 0; i < m; i++) sizes.push(base + (i < rem ? 1 : 0));
  return sizes;
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

/** Return the points recorded for a participant id in a specific match (or 0).
 * This centralizes the lookup to avoid mismatches between placements and slot data.
 */
function getPointsInMatch(match, participantId) {
  if (!match || !participantId) return 0;
  const slot = match.slots.find((s) => s.participant?.id === participantId);
  return slot && typeof slot.points === "number" ? slot.points : 0;
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
      const pts = getPointsInMatch(m, third.id);
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
        const pts = getPointsInMatch(prev.matches[idx], second?.id);
        return { p: second, points: pts };
      })
      .filter((x) => x.p)
      .sort((a, b) => b.points - a.points || a.p.name.localeCompare(b.p.name));

    const bestSecond = seconds[0]?.p;
    const adv = [...winners];
    if (bestSecond) adv.push(bestSecond);
    const uniqueAdv = Array.from(new Map(adv.map((p) => [p.id, p])).values());
    if (uniqueAdv.length !== 4) return null;

    // Order finalists by the points they scored in the semifinal (desc).
    // Build a lookup of points from the semifinal prev.matches.
    const pointsById = new Map();
    prev.matches.forEach((m) => {
      m.slots.forEach((s) => {
        if (s.participant && typeof s.points === "number") {
          pointsById.set(s.participant.id, s.points);
        }
      });
    });

    uniqueAdv.sort((a, b) => {
      const pa = pointsById.get(a.id) ?? 0;
      const pb = pointsById.get(b.id) ?? 0;
      if (pb !== pa) return pb - pa;
      return (a.name || "").localeCompare(b.name || "");
    });

    const groups = chunk4(uniqueAdv);
    const matches = groups.map((g) => ({
      id: `m_${uid()}`,
      slots: g.map((p) => ({ participant: p })),
      isComplete: false,
    }));
    return { id: `r_${uid()}`, name: "Final Table", matches, computed: false };
  }

  // (Removed older Round 1 special-case that selected 15 advancers by
  // global top-3 thirds. New logic below enforces per-pair 2/2/1 composition
  // for Round 1 and will produce 3 matches of 5 players when possible.)

  // Special Round 1 (6 matches): take top-2 from each match + best 3 thirds
  // globally, then arrange into three next matches with composition
  // 2 firsts, 2 seconds, 1 third while avoiding placing players from the
  // same previous match together when possible.
  if (prev.name === "Round 1" && prev.matches.length === 6) {
    const cms = prev.matches.map((m) => computePlacements(m));
    if (
      cms.every(
        (cm) => cm.isComplete && cm.placements && cm.placements.length >= 2
      )
    ) {
      // collect firsts and seconds
      const firsts = cms
        .map((cm, idx) => ({ p: cm.placements[0], matchIdx: idx }))
        .filter((x) => x.p && x.p.name !== "BYE");
      const seconds = cms
        .map((cm, idx) => ({ p: cm.placements[1], matchIdx: idx }))
        .filter((x) => x.p && x.p.name !== "BYE");
      // collect third-placed players (one per match)
      const thirdsAll = cms
        .map((cm, idx) => ({ p: cm.placements[2], matchIdx: idx }))
        .filter((x) => x.p && x.p.name !== "BYE");
      // sort thirds by points desc, name tiebreak
      thirdsAll.forEach((t) => {
        t.points = getPointsInMatch(prev.matches[t.matchIdx], t.p.id);
        // also capture the first/second points from the source match to use
        // as tie-breakers when multiple thirds have equal points
        const cm = cms[t.matchIdx];
        t.secondPoints =
          cm && cm.placements[1]
            ? getPointsInMatch(prev.matches[t.matchIdx], cm.placements[1].id)
            : 0;
        t.firstPoints =
          cm && cm.placements[0]
            ? getPointsInMatch(prev.matches[t.matchIdx], cm.placements[0].id)
            : 0;
      });
      // sort by: third points desc, secondPoints desc, firstPoints desc, name asc, matchIdx asc
      thirdsAll.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if ((b.secondPoints || 0) !== (a.secondPoints || 0))
          return (b.secondPoints || 0) - (a.secondPoints || 0);
        if ((b.firstPoints || 0) !== (a.firstPoints || 0))
          return (b.firstPoints || 0) - (a.firstPoints || 0);
        const nameCmp = a.p.name.localeCompare(b.p.name);
        if (nameCmp !== 0) return nameCmp;
        return a.matchIdx - b.matchIdx;
      });
      const thirdsSelected = thirdsAll.slice(0, 3);
      try {
        console.log(
          "[buildNextRound] Round1 top-3 thirds:",
          thirdsAll.map((t) => ({
            name: t.p.name,
            points: t.points,
            matchIdx: t.matchIdx,
          })),
          "selected:",
          thirdsSelected.map((t) => t.p.name)
        );
      } catch (e) {}

      // Build 3 groups and attempt to assign exactly 2 firsts, 2 seconds and 1 third
      // per group using a small exhaustive search to guarantee the composition.
      // This search is limited (<= 540 checks) and deterministic.
      if (
        firsts.length === 6 &&
        seconds.length === 6 &&
        thirdsSelected.length === 3
      ) {
        // pair firsts into three groups: (0,1),(2,3),(4,5)
        const firstPairs = [
          [firsts[0], firsts[1]],
          [firsts[2], firsts[3]],
          [firsts[4], firsts[5]],
        ];
        const secIdx = [0, 1, 2, 3, 4, 5];
        let solution = null;
        // choose 2 indices for group0
        for (let i = 0; i < 5 && !solution; i++) {
          for (let j = i + 1; j < 6 && !solution; j++) {
            const rem1 = secIdx.filter((idx) => idx !== i && idx !== j);
            // choose 2 for group1 from rem1
            for (let a = 0; a < rem1.length - 1 && !solution; a++) {
              for (let b = a + 1; b < rem1.length && !solution; b++) {
                const idxG0 = [i, j];
                const idxG1 = [rem1[a], rem1[b]];
                const idxG2 = rem1.filter(
                  (x) => !idxG1.includes(x) && x !== i && x !== j
                );
                // build candidate groups with firsts + seconds
                const groupsCand = [[], [], []];
                const meta = [new Set(), new Set(), new Set()];
                for (let gi = 0; gi < 3; gi++) {
                  groupsCand[gi].push(firstPairs[gi][0].p);
                  groupsCand[gi].push(firstPairs[gi][1].p);
                  meta[gi].add(firstPairs[gi][0].matchIdx);
                  meta[gi].add(firstPairs[gi][1].matchIdx);
                }
                const assignIdxs = [idxG0, idxG1, idxG2];
                let bad = false;
                for (let gi = 0; gi < 3 && !bad; gi++) {
                  for (const sIdx of assignIdxs[gi]) {
                    const sObj = seconds[sIdx];
                    // avoid two players from same previous match in same group
                    if (meta[gi].has(sObj.matchIdx)) {
                      bad = true;
                      break;
                    }
                    groupsCand[gi].push(sObj.p);
                    meta[gi].add(sObj.matchIdx);
                  }
                }
                if (bad) continue;
                // now try all permutations of thirdsSelected (3! = 6)
                const perms = [
                  [0, 1, 2],
                  [0, 2, 1],
                  [1, 0, 2],
                  [1, 2, 0],
                  [2, 0, 1],
                  [2, 1, 0],
                ];
                for (const perm of perms) {
                  const groupsFinal = groupsCand.map((g) => g.slice());
                  const metaFinal = meta.map((s) => new Set(s));
                  let ok = true;
                  for (let gi = 0; gi < 3; gi++) {
                    const t = thirdsSelected[perm[gi]];
                    if (metaFinal[gi].has(t.matchIdx)) {
                      ok = false;
                      break;
                    }
                    groupsFinal[gi].push(t.p);
                    metaFinal[gi].add(t.matchIdx);
                  }
                  if (!ok) continue;
                  if (groupsFinal.every((g) => g.length === 5)) {
                    solution = groupsFinal;
                    break;
                  }
                }
              }
            }
          }
        }
        if (solution) {
          const matches = solution.map((g) => ({
            id: `m_${uid()}`,
            slots: g.map((p) => ({ participant: p })),
            isComplete: false,
          }));
          return {
            id: `r_${uid()}`,
            name: `Round ${roundIndex + 2}`,
            matches,
            computed: false,
          };
        }
        // if no exact assignment found, fall through to the per-pair fallback below
      }
    }
  }

  // New rule: If the previous round is Round 1, prefer to form Round 2
  // matches so that each next-match contains 2 first-places, 2 second-places
  // and 1 third-place drawn from a pair of previous matches. We pair
  // adjacent previous matches (0&1 -> next 0, 2&3 -> next 1, ...). This
  // keeps advancement fair between neighbouring groups and ensures each
  // next-match follows the 2/2/1 composition when possible. If we cannot
  // build all matches with full 5 players this way, we fall back to the
  // default advancer distribution.
  if (prev.name === "Round 1") {
    const cms = prev.matches.map((m) => computePlacements(m));
    // require placements for matches we will use
    if (
      cms.every(
        (cm) => cm.isComplete && cm.placements && cm.placements.length >= 2
      )
    ) {
      const nextMatches = [];
      const usedIds = new Set();
      for (let i = 0; i < prev.matches.length; i += 2) {
        const a = cms[i];
        const b = cms[i + 1];
        // collect firsts and seconds from both matches
        const firsts = [];
        const seconds = [];
        const thirds = [];
        if (a) {
          if (a.placements[0] && a.placements[0].name !== "BYE")
            firsts.push(a.placements[0]);
          if (a.placements[1] && a.placements[1].name !== "BYE")
            seconds.push(a.placements[1]);
          if (a.placements[2] && a.placements[2].name !== "BYE") {
            const pts =
              prev.matches[i].slots.find(
                (s) => s.participant?.id === a.placements[2]?.id
              )?.points ?? 0;
            thirds.push({ p: a.placements[2], points: pts });
          }
        }
        if (b) {
          if (b.placements[0] && b.placements[0].name !== "BYE")
            firsts.push(b.placements[0]);
          if (b.placements[1] && b.placements[1].name !== "BYE")
            seconds.push(b.placements[1]);
          if (b.placements[2] && b.placements[2].name !== "BYE") {
            const pts =
              prev.matches[i + 1].slots.find(
                (s) => s.participant?.id === b.placements[2]?.id
              )?.points ?? 0;
            thirds.push({ p: b.placements[2], points: pts });
          }
        }

        // We expect 2 firsts and 2 seconds to form a full 5-player match
        if (firsts.length >= 2 && seconds.length >= 2 && thirds.length >= 1) {
          // pick the best third by points among the pair
          thirds.sort(
            (x, y) => y.points - x.points || x.p.name.localeCompare(y.p.name)
          );
          const selected = [
            firsts[0],
            firsts[1],
            seconds[0],
            seconds[1],
            thirds[0].p,
          ];
          // ensure uniqueness
          const unique = Array.from(
            new Map(selected.map((p) => [p.id, p])).values()
          );
          if (unique.length === 5) {
            unique.forEach((p) => usedIds.add(p.id));
            nextMatches.push({
              id: `m_${uid()}`,
              slots: unique.map((p) => ({ participant: p })),
              isComplete: false,
            });
            continue;
          }
        }
        // If we couldn't form a full 5-player match for this pair, bail out
        // and fall back to the general distribution below.
        nextMatches.length = 0;
        break;
      }

      if (nextMatches.length > 0) {
        return {
          id: `r_${uid()}`,
          name: `Round ${roundIndex + 2}`,
          matches: nextMatches,
          computed: false,
        };
      }
    }
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
        // Prefer forming the Semifinal by taking 1st/2nd/3rd from each of
        // the three previous matches when possible. This guarantees each
        // semifinal match contains a 1st, 2nd and 3rd from the round before.
        if (pool.length === 9) {
          // Prefer forming the Semifinal by creating cross-group matches so
          // players from the same previous match don't meet again. Given three
          // previous matches A, B, C with placements [A1,A2,A3], [B1,B2,B3],
          // [C1,C2,C3], produce semifinal matches:
          //  - M1 = [A1, B2, C3]
          //  - M2 = [A3, B1, C2]
          //  - M3 = [A2, B3, C1]
          if (prev.matches.length === 3) {
            const [cmA, cmB, cmC] = cms;
            if (
              cmA.placements &&
              cmB.placements &&
              cmC.placements &&
              cmA.placements.length >= 3 &&
              cmB.placements.length >= 3 &&
              cmC.placements.length >= 3
            ) {
              const m1 = [
                cmA.placements[0],
                cmB.placements[1],
                cmC.placements[2],
              ];
              const m2 = [
                cmA.placements[2],
                cmB.placements[0],
                cmC.placements[1],
              ];
              const m3 = [
                cmA.placements[1],
                cmB.placements[2],
                cmC.placements[0],
              ];
              // Ensure none are BYE and all entries exist
              if (
                m1.every((p) => p && p.name !== "BYE") &&
                m2.every((p) => p && p.name !== "BYE") &&
                m3.every((p) => p && p.name !== "BYE")
              ) {
                const matches = [m1, m2, m3].map((g) => ({
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

          // Fallback: take the first 9 players from the pool and split into 3 groups
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
      // Order finalists by the points they scored in the previous round (semifinal-like)
      const pointsById = new Map();
      prev.matches.forEach((m) => {
        m.slots.forEach((s) => {
          if (s.participant && typeof s.points === "number") {
            pointsById.set(s.participant.id, s.points);
          }
        });
      });
      uniqueAdv.sort((a, b) => {
        const pa = pointsById.get(a.id) ?? 0;
        const pb = pointsById.get(b.id) ?? 0;
        if (pb !== pa) return pb - pa;
        return (a.name || "").localeCompare(b.name || "");
      });

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
  const assigned = assignedInFirstRound();
  state.participants.forEach((p) => {
    // Don't show participants already assigned in the manual first round
    if (assigned.has(p.id)) return;
    const div = document.createElement("div");
    div.className = "pill";
    div.draggable = true;
    div.dataset.participantId = p.id;
    const img = document.createElement("img");
    img.src = p.flagUrl || "";
    img.alt = "";
    div.appendChild(img);
    const span = document.createElement("span");
    span.textContent = p.name + (p.section ? ` (S:${p.section})` : "");
    div.appendChild(span);
    div.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/plain", p.id);
      ev.dataTransfer.effectAllowed = "move";
    });
    pList.appendChild(div);
  });
  // allow dropping back to the pool to unassign
  pList.ondragover = (ev) => ev.preventDefault();
  pList.ondrop = (ev) => {
    ev.preventDefault();
    const id = ev.dataTransfer.getData("text/plain");
    if (!id) return;
    // remove assignment from any slot in first round
    if (state.rounds.length) {
      const first = state.rounds[0];
      first.matches.forEach((m) =>
        m.slots.forEach((s) => {
          if (s.participant?.id === id) {
            s.participant = undefined;
            s.points = undefined;
          }
        })
      );
      renderParticipants();
      renderRounds();
    }
  };
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
  input.disabled = !slot.participant || slot.participant?.name === "BYE";
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

    // Create a grid container for matches so we can display them in columns
    const matchesGrid = document.createElement("div");
    matchesGrid.className = "matches-grid";

    round.matches.forEach((m, mIdx) => {
      const matchEl = document.createElement("div");
      matchEl.className = "match";
      // add alphabetical label (Match A, B, C...)
      const lbl = document.createElement("div");
      lbl.className = "match-label";
      lbl.textContent = indexToLabel(mIdx);
      matchEl.appendChild(lbl);

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
        // If this is the manual first round, enable drag & drop on slots
        if (rIdx === 0) {
          wrap.dataset.matchIdx = mIdx;
          wrap.dataset.slotIdx = sIdx;
          wrap.classList.toggle("empty", !s.participant);
          wrap.addEventListener("dragover", (ev) => ev.preventDefault());
          wrap.addEventListener("drop", (ev) => {
            ev.preventDefault();
            const pid = ev.dataTransfer.getData("text/plain");
            if (!pid) return;
            const p = findParticipantById(pid);
            if (!p) return;
            // remove participant from any previous slot in first round first
            const first = state.rounds[0];
            first.matches.forEach((mm) =>
              mm.slots.forEach((sl) => {
                if (sl.participant?.id === pid) {
                  sl.participant = undefined;
                  sl.points = undefined;
                }
              })
            );
            // enforce section constraint: players with same section can't be in same match
            const existingSections = m.slots
              .map((sl) =>
                sl.participant?.section
                  ? String(sl.participant.section).trim()
                  : null
              )
              .filter(Boolean);
            // Allow duplicates for section '4' (lowest-seed group) if needed.
            const pSec = p.section ? String(p.section).trim() : null;
            if (pSec && pSec !== "4" && existingSections.includes(pSec)) {
              alert(
                "Cannot place players from the same section in the same match for Round 1."
              );
              return;
            }
            // assign to this slot
            m.slots[sIdx].participant = p;
            m.slots[sIdx].points = undefined;
            renderParticipants();
            renderRounds();
          });
          // Allow dragging a participant out of a slot to reassign/unassign.
          // When a slot has a participant, make the slot itself draggable so the
          // user can drag the name back to the participants pool or another slot.
          if (s.participant) {
            wrap.draggable = true;
            wrap.addEventListener("dragstart", (ev) => {
              try {
                ev.dataTransfer.setData("text/plain", s.participant.id);
                ev.dataTransfer.effectAllowed = "move";
              } catch (e) {
                // ignore
              }
            });
            // When drag ends without a drop, leave assignment as-is. If dropped
            // on the pool, the pool's drop handler will clear it.
          } else {
            wrap.draggable = false;
          }
        }
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
                if (s.participant && s.participant.id)
                  advancerIds.add(s.participant.id);
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

      matchesGrid.appendChild(matchEl);
    });
    roundEl.appendChild(matchesGrid);
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
  // Create a manual first round where the user can drag participants into groups
  const n = state.participants.length;
  // If there are players marked with section '1', use their count as desired group
  // count (one '1' per group). Cap the group count so each group has at least 4.
  const seatOnes = state.participants.filter(
    (p) => String(p.section).trim() === "1"
  ).length;
  // Default initial group count when no explicit seat-1 markers exist.
  const DEFAULT_INITIAL_GROUPS = 6;
  // Use seatOnes only when it represents at least DEFAULT_INITIAL_GROUPS groups;
  // otherwise prefer the DEFAULT_INITIAL_GROUPS baseline so small seat-1 counts
  // don't force fewer groups than expected.
  const useSeatOnes = seatOnes > 0 && seatOnes >= DEFAULT_INITIAL_GROUPS;
  const sizes = useSeatOnes
    ? computeGroupSizesForCount(n, seatOnes)
    : computeGroupSizesForCount(n, DEFAULT_INITIAL_GROUPS);
  // Debug: log group computation for troubleshooting when users see unexpected
  // number of groups (helps confirm sizes in the browser console).
  try {
    console.log(
      "[btnSeed] participants=",
      n,
      "seatOnes=",
      seatOnes,
      "useSeatOnes=",
      useSeatOnes,
      "sizes=",
      sizes,
      "groups=",
      sizes.length
    );
    console.log(
      "[btnSeed] participant sections=",
      state.participants
        .map((p) => ({ name: p.name, section: p.section }))
        .slice(0, 50)
    );
  } catch (e) {}
  const matches = sizes.map((sz) => ({
    id: `m_${uid()}`,
    slots: Array.from({ length: sz }).map(() => ({
      participant: undefined,
      points: undefined,
    })),
    isComplete: false,
  }));
  const r1 = { id: `r_${uid()}`, name: "Round 1", matches, computed: false };
  state.rounds = [r1];
  renderParticipants();
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
        mh.textContent = `Match ${indexToLabel(mIdx)}`;
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
