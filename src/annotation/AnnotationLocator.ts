import { Annotation, LocateResult } from "./AnnotationModel";

interface RawMatch {
  from: number;
  to: number;
  line: number;
}

function findAll(doc: string, needle: string): RawMatch[] {
  if (!needle) return [];
  const out: RawMatch[] = [];
  let i = 0;
  while (i <= doc.length - needle.length) {
    const idx = doc.indexOf(needle, i);
    if (idx < 0) break;
    out.push({ from: idx, to: idx + needle.length, line: lineOf(doc, idx) });
    i = idx + Math.max(1, needle.length);
  }
  return out;
}

function lineOf(doc: string, offset: number): number {
  // 1-based line number, matching Obsidian's lineHint
  let line = 1;
  for (let i = 0; i < offset && i < doc.length; i++) {
    if (doc.charCodeAt(i) === 10) line++;
  }
  return line;
}

/**
 * Locate an annotation in `doc` using the layered strategy from
 * docs/technical-design.md §4.3.
 */
export function locate(doc: string, ann: Annotation): LocateResult {
  if (!ann.selectedText) return { status: "drifted" };

  // Step 1: full anchor (contextBefore + selectedText + contextAfter)
  const full = ann.contextBefore + ann.selectedText + ann.contextAfter;
  let matches = findAll(doc, full);
  if (matches.length === 1) {
    const m = matches[0];
    const from = m.from + ann.contextBefore.length;
    const to = from + ann.selectedText.length;
    return { status: "strict", from, to };
  }

  if (matches.length > 1) {
    const sorted = [...matches].sort(
      (a, b) => Math.abs(a.line - ann.lineHint) - Math.abs(b.line - ann.lineHint),
    );
    const best = sorted[0];
    const from = best.from + ann.contextBefore.length;
    const to = from + ann.selectedText.length;
    return { status: "strict", from, to };
  }

  // Step 2: contextBefore + selectedText (right context dropped)
  matches = findAll(doc, ann.contextBefore + ann.selectedText);
  if (matches.length === 1) {
    const m = matches[0];
    const from = m.from + ann.contextBefore.length;
    const to = from + ann.selectedText.length;
    return { status: "strict", from, to };
  }

  // Step 3: selectedText + contextAfter (left context dropped)
  matches = findAll(doc, ann.selectedText + ann.contextAfter);
  if (matches.length === 1) {
    const m = matches[0];
    const from = m.from;
    const to = from + ann.selectedText.length;
    return { status: "strict", from, to };
  }

  // Step 4: bare selectedText, disambiguated by occurrenceIndex / lineHint
  const occ = findAll(doc, ann.selectedText);
  if (occ.length === 0) return { status: "drifted" };
  if (occ.length === 1) {
    return { status: "fuzzy", from: occ[0].from, to: occ[0].to };
  }
  // Prefer occurrenceIndex if in range, otherwise nearest lineHint.
  let pick: RawMatch | undefined;
  if (ann.occurrenceIndex >= 0 && ann.occurrenceIndex < occ.length) {
    pick = occ[ann.occurrenceIndex];
  } else {
    pick = [...occ].sort(
      (a, b) => Math.abs(a.line - ann.lineHint) - Math.abs(b.line - ann.lineHint),
    )[0];
  }
  return {
    status: "fuzzy",
    from: pick.from,
    to: pick.to,
    candidates: occ.filter((m) => m !== pick).map((m) => ({ from: m.from, to: m.to })),
  };
}

/**
 * Compute the occurrenceIndex of `selectedText` whose match starts at
 * exactly `at` (used at creation time).
 */
export function computeOccurrenceIndex(doc: string, selectedText: string, at: number): number {
  if (!selectedText) return 0;
  let count = 0;
  let i = 0;
  while (i <= at) {
    const idx = doc.indexOf(selectedText, i);
    if (idx < 0 || idx > at) break;
    if (idx === at) return count;
    count++;
    i = idx + Math.max(1, selectedText.length);
  }
  return count;
}

export function computeLineHint(doc: string, at: number): number {
  return lineOf(doc, at);
}

export function extractContext(doc: string, from: number, to: number, span = 50): {
  contextBefore: string;
  contextAfter: string;
} {
  const start = Math.max(0, from - span);
  const end = Math.min(doc.length, to + span);
  return {
    contextBefore: doc.slice(start, from),
    contextAfter: doc.slice(to, end),
  };
}
