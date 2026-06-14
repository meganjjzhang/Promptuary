/**
 * Encode a vault relative path into a sidecar filename.
 * Uses URL-safe base64 of the UTF-8 path to avoid collision:
 *   a/b__c.md  →  YS9iX19j (unique)
 *   a__b/c.md  →  YV9fYi9j (unique)
 *
 * This replaces the previous `__`-substitution scheme which caused
 * collisions when file names themselves contained `__`.
 */
export function encodeSidecarName(filePath: string): string {
  const noExt = filePath.replace(/\.md$/i, "");
  const bytes = new TextEncoder().encode(noExt);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, ""); // base64url (no padding)
}

export function sidecarPath(rootDir: string, filePath: string): string {
  const name = encodeSidecarName(filePath);
  return `${rootDir}/${name}.json`;
}
