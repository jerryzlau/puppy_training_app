/** Deterministic jitter: stable pseudo-random rotation (−3°…+3°) seeded by an id. */
export function jitter(id: string, max = 3): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const unit = ((h % 1000) + 1000) % 1000 / 1000; // 0..1
  return Math.round((unit * 2 - 1) * max * 10) / 10;
}
