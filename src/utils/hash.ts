/**
 * SHA256 of string. Uses Web Crypto in browser/Electron (Obsidian) and falls
 * back to a tiny pure-JS hash if subtle is unavailable.
 */
export async function sha256(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return bufToHex(digest);
  }
  // Fallback: should not happen in Obsidian, but keep the shape consistent.
  return "fallback:" + simpleHash(text).toString(16);
}

function bufToHex(buf: ArrayBuffer): string {
  const arr = Array.from(new Uint8Array(buf));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

export function newAnnotationId(): string {
  const t = Date.now();
  const r = Math.random().toString(36).slice(2, 6);
  return `ann_${t}_${r}`;
}
