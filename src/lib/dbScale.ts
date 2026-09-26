export interface NoiseZone {
  id: string;
  min: number;
  max: number;
  label: string;
  examples: string;
  color: string;
  colorSoft: string;
}

export const GAUGE_MIN_DB = 30;
export const GAUGE_MAX_DB = 120;

// Ordered from quietest to loudest; max is exclusive except for the last zone.
export const NOISE_ZONES: NoiseZone[] = [
  {
    id: "quiet",
    min: -Infinity,
    max: 50,
    label: "Yên tĩnh",
    examples: "Phòng ngủ, thư viện, thì thầm",
    color: "#22c55e",
    colorSoft: "rgba(34, 197, 94, 0.16)",
  },
  {
    id: "normal",
    min: 50,
    max: 70,
    label: "Bình thường",
    examples: "Nói chuyện, văn phòng, tủ lạnh",
    color: "#84cc16",
    colorSoft: "rgba(132, 204, 22, 0.16)",
  },
  {
    id: "loud",
    min: 70,
    max: 85,
    label: "Ồn",
    examples: "Giao thông đông đúc, nhà hàng ồn",
    color: "#f59e0b",
    colorSoft: "rgba(245, 158, 11, 0.18)",
  },
  {
    id: "very-loud",
    min: 85,
    max: 100,
    label: "Rất ồn, có hại nếu nghe lâu",
    examples: "Máy cắt cỏ, còi xe máy, quán karaoke",
    color: "#f97316",
    colorSoft: "rgba(249, 115, 22, 0.2)",
  },
  {
    id: "danger",
    min: 100,
    max: Infinity,
    label: "Nguy hiểm",
    examples: "Máy khoan, buổi hòa nhạc, còi báo động",
    color: "#ef4444",
    colorSoft: "rgba(239, 68, 68, 0.22)",
  },
];

export function getNoiseZone(db: number): NoiseZone {
  for (const zone of NOISE_ZONES) {
    if (db >= zone.min && db < zone.max) return zone;
  }
  return NOISE_ZONES[NOISE_ZONES.length - 1];
}

export function clampToGaugeRange(db: number): number {
  return Math.min(GAUGE_MAX_DB, Math.max(GAUGE_MIN_DB, db));
}
