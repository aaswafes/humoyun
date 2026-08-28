// =========================================================
// Qibla — the initial great-circle bearing from the profile
// coordinates to the Kaaba, plus how far away it is.
// Same arithmetic as the prayer times: local, offline, no API.
// =========================================================

export const KAABA = { latitude: 21.4225, longitude: 39.8262 };

const RAD = Math.PI / 180;
const EARTH_KM = 6371;

/** Degrees clockwise from true north, 0..360. */
export function qiblaBearing(latitude: number, longitude: number): number {
  const phi1 = latitude * RAD;
  const phi2 = KAABA.latitude * RAD;
  const delta = (KAABA.longitude - longitude) * RAD;
  const y = Math.sin(delta) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(delta);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

export function distanceToKaabaKm(latitude: number, longitude: number): number {
  const phi1 = latitude * RAD;
  const phi2 = KAABA.latitude * RAD;
  const dPhi = (KAABA.latitude - latitude) * RAD;
  const dLambda = (KAABA.longitude - longitude) * RAD;
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return Math.round(EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function compassPoint(degrees: number): string {
  return POINTS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

const POINT_NAMES: Record<string, string> = {
  N: "north", NNE: "north-north-east", NE: "north-east", ENE: "east-north-east",
  E: "east", ESE: "east-south-east", SE: "south-east", SSE: "south-south-east",
  S: "south", SSW: "south-south-west", SW: "south-west", WSW: "west-south-west",
  W: "west", WNW: "west-north-west", NW: "north-west", NNW: "north-north-west",
};

export function compassPointName(degrees: number): string {
  return POINT_NAMES[compassPoint(degrees)] ?? compassPoint(degrees);
}

/** Point on a circle for a bearing, with 0 degrees pointing up. */
export function polar(cx: number, cy: number, radius: number, degrees: number) {
  const theta = degrees * RAD;
  return { x: cx + radius * Math.sin(theta), y: cy - radius * Math.cos(theta) };
}
