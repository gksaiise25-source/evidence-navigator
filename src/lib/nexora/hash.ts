export async function sha256(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  let buf: ArrayBuffer;
  if (typeof data === "string") {
    buf = new TextEncoder().encode(data).buffer as ArrayBuffer;
  } else if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    buf = copy.buffer;
  } else {
    buf = data;
  }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function shortHash(h: string) {
  return `${h.slice(0, 12)}…${h.slice(-8)}`;
}
