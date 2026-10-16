/** Only Qloo's image CDN, over https, default port, no credentials. */
export function isAllowedImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === "https:" && u.hostname === "images.qloo.com" && u.port === "" && !u.username && !u.password;
}

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Content types /api/img will forward. Never SVG. */
export const RASTER_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];
