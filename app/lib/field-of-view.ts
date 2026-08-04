/**
 * Field-of-view geometry for the map layer (kanban t_f8b775ec, design Vera).
 *
 * The map draws the camera's field of view with native Leaflet only:
 *
 *   - DIRECTIONAL cameras with a stored `direction` (bearing 0-359) get a
 *     WEDGE/cone: a ~60° sector of radius ~35 m, vertex at the marker,
 *     oriented at the bearing. Points are computed with plain trigonometry
 *     (equirectangular approximation, accurate enough at this scale) and
 *     rendered as an L.polygon — no L.semiCircle, no new libraries.
 *   - DOME cameras (kind "Fixed dome", see camera-kinds.ts) get a 360°
 *     circle rendered as a native L.circle with the same radius.
 *   - Cameras with no direction (NULL / unknown) draw nothing.
 *
 * Performance (PM directive — ZERO new libraries, viewport culling stays):
 * the cones/circles are drawn only above FOV_MIN_ZOOM and only for records
 * already inside the current viewport (recordsInBounds, same culling as
 * the markers), so the DOM never materialises the full dataset's geometry.
 *
 * All functions are pure and side-effect free so the geometry contract is
 * unit-testable in plain Node (tests/field-of-view.test.mjs).
 */

/** Wedge aperture: 60° (±30° around the bearing). */
export const FOV_OPENING_DEGREES = 60;

/** Wedge/circle radius in metres (~35 m, the "raggio ~30-40 m" directive). */
export const FOV_RADIUS_METERS = 35;

/** Cones and circles are only drawn at this zoom level and above. */
export const FOV_MIN_ZOOM = 16;

/** Arc step: how many degrees between consecutive arc points (smoothness vs nodes). */
export const FOV_ARC_STEP_DEGREES = 5;

/** Metres per degree of latitude (WGS84 mean). */
export const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Compute the polygon ring for a field-of-view wedge.
 *
 * The ring starts at the camera position (the vertex) and follows the arc
 * from bearing−aperture/2 to bearing+aperture/2 at `radiusMeters`, so the
 * polygon is a closed sector. `directionDegrees` is the stored bearing
 * 0-359 (clockwise from north); bearings outside that range are wrapped.
 *
 * Returns [latitude, longitude] pairs in the order Leaflet expects
 * (L.polygon([[lat,lng], …])).
 */
export function fovPolygonPoints(
  latitude: number,
  longitude: number,
  directionDegrees: number,
  radiusMeters: number = FOV_RADIUS_METERS,
  openingDegrees: number = FOV_OPENING_DEGREES,
): [number, number][] {
  const latRad = (latitude * Math.PI) / 180;
  // Metres per degree of longitude shrinks with cos(latitude).
  const metersPerDegreeLng = METERS_PER_DEGREE_LAT * Math.cos(latRad);
  const startBearing = ((directionDegrees - openingDegrees / 2) % 360 + 360) % 360;
  const endBearing = ((directionDegrees + openingDegrees / 2) % 360 + 360) % 360;

  const pointAt = (bearingDegrees: number): [number, number] => {
    const bearing = (bearingDegrees * Math.PI) / 180;
    const dLat = (radiusMeters * Math.cos(bearing)) / METERS_PER_DEGREE_LAT;
    const dLng = (radiusMeters * Math.sin(bearing)) / metersPerDegreeLng;
    return [latitude + dLat, longitude + dLng];
  };

  const points: [number, number][] = [[latitude, longitude]];
  if (startBearing <= endBearing) {
    for (let bearing = startBearing; bearing <= endBearing; bearing += FOV_ARC_STEP_DEGREES) {
      points.push(pointAt(bearing));
    }
    // Ensure the exact far edge is included (step may not divide evenly).
    if (points[points.length - 1] !== undefined && ((endBearing - startBearing) % FOV_ARC_STEP_DEGREES) !== 0) {
      points.push(pointAt(endBearing));
    }
  } else {
    // Wedge wraps around 360° (e.g. bearing 350 with ±30 → 320..370).
    for (let bearing = startBearing; bearing < 360; bearing += FOV_ARC_STEP_DEGREES) {
      points.push(pointAt(bearing));
    }
    for (let bearing = 0; bearing <= endBearing; bearing += FOV_ARC_STEP_DEGREES) {
      points.push(pointAt(bearing));
    }
    points.push(pointAt(endBearing));
  }
  return points;
}

/**
 * Radius (in metres) for the dome's 360° circle. Kept equal to the wedge
 * radius so both render at the same visual scale — a dome "sees" 360° at
 * the same range a directional camera sees its 60° sector.
 */
export function fovCircleRadiusMeters(): number {
  return FOV_RADIUS_METERS;
}
