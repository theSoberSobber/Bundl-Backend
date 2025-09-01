/**
 * Custom lightweight Geohash implementation for location-based subscriptions
 * 
 * This implementation provides the core geohash functionality needed for
 * dividing the world into grid squares with unique identifiers.
 * 
 * Geohash precision and approximate cell size:
 * - Precision 4: ~20 km x 20 km
 * - Precision 5: ~2.4 km x 4.8 km  
 * - Precision 6: ~0.61 km x 1.22 km
 * - Precision 7: ~0.153 km x 0.153 km (153 meters - ideal for 200m targeting)
 * - Precision 8: ~0.038 km x 0.019 km (38m x 19m - very precise)
 * - Precision 9: ~0.0048 km x 0.0048 km (4.8 meters - ultra-precise)
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

interface GridSize {
  latDegrees: number;
  lonDegrees: number;
}

export class GeohashUtils {
  private static readonly BASE32_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
  private static readonly BASE32_MAP = GeohashUtils.createBase32Map();

  private static createBase32Map(): Map<string, number> {
    const map = new Map<string, number>();
    for (let i = 0; i < GeohashUtils.BASE32_ALPHABET.length; i++) {
      map.set(GeohashUtils.BASE32_ALPHABET[i], i);
    }
    return map;
  }

  /**
   * Encode latitude and longitude to a geohash string
   */
  static encode(latitude: number, longitude: number, precision: number = 5): string {
    if (latitude < -90 || latitude > 90) {
      throw new Error('Latitude must be between -90 and 90');
    }
    if (longitude < -180 || longitude > 180) {
      throw new Error('Longitude must be between -180 and 180');
    }
    if (precision <= 0) {
      throw new Error('Precision must be positive');
    }

    const latRange = [-90.0, 90.0];
    const lonRange = [-180.0, 180.0];

    let isEven = true;
    let bit = 0;
    let base32Index = 0;
    let geohash = '';

    while (geohash.length < precision) {
      if (isEven) {
        // Process longitude
        const mid = (lonRange[0] + lonRange[1]) / 2;
        if (longitude > mid) {
          base32Index = (base32Index << 1) | 1;
          lonRange[0] = mid;
        } else {
          base32Index = base32Index << 1;
          lonRange[1] = mid;
        }
      } else {
        // Process latitude
        const mid = (latRange[0] + latRange[1]) / 2;
        if (latitude > mid) {
          base32Index = (base32Index << 1) | 1;
          latRange[0] = mid;
        } else {
          base32Index = base32Index << 1;
          latRange[1] = mid;
        }
      }

      isEven = !isEven;

      if (++bit === 5) {
        geohash += GeohashUtils.BASE32_ALPHABET[base32Index];
        bit = 0;
        base32Index = 0;
      }
    }

    return geohash;
  }

  /**
   * Decode a geohash string to latitude and longitude
   */
  static decode(geohash: string): LatLng {
    if (!geohash) {
      throw new Error('Geohash cannot be empty');
    }
    
    for (const char of geohash) {
      if (!GeohashUtils.BASE32_MAP.has(char)) {
        throw new Error('Invalid geohash characters');
      }
    }

    const latRange = [-90.0, 90.0];
    const lonRange = [-180.0, 180.0];

    let isEven = true;

    for (const char of geohash) {
      const base32Index = GeohashUtils.BASE32_MAP.get(char);
      if (base32Index === undefined) continue;

      for (let i = 4; i >= 0; i--) {
        const bit = (base32Index >> i) & 1;

        if (isEven) {
          // Process longitude
          const mid = (lonRange[0] + lonRange[1]) / 2;
          if (bit === 1) {
            lonRange[0] = mid;
          } else {
            lonRange[1] = mid;
          }
        } else {
          // Process latitude
          const mid = (latRange[0] + latRange[1]) / 2;
          if (bit === 1) {
            latRange[0] = mid;
          } else {
            latRange[1] = mid;
          }
        }

        isEven = !isEven;
      }
    }

    return {
      latitude: (latRange[0] + latRange[1]) / 2,
      longitude: (lonRange[0] + lonRange[1]) / 2,
    };
  }

  /**
   * Get all geohashes covering a circular area around a center point
   */
  static getCoverageGeohashes(
    centerLat: number,
    centerLon: number,
    radiusMeters: number,
    precision: number,
  ): Set<string> {
    const geohashes = new Set<string>();

    // Calculate the approximate degree equivalent of the radius
    const earthRadiusMeters = 6371000.0;
    const latDegreesPerMeter = 1.0 / (earthRadiusMeters * Math.PI / 180.0);
    const lonDegreesPerMeter = 1.0 / (earthRadiusMeters * Math.PI / 180.0 * Math.cos(centerLat * Math.PI / 180.0));

    const latRadius = radiusMeters * latDegreesPerMeter;
    const lonRadius = radiusMeters * lonDegreesPerMeter;

    // Calculate approximate grid step size for the given precision
    const gridSize = GeohashUtils.getApproximateGridSize(precision);
    const latStep = gridSize.latDegrees;
    const lonStep = gridSize.lonDegrees;

    // Generate grid of points covering the area
    const minLat = centerLat - latRadius;
    const maxLat = centerLat + latRadius;
    const minLon = centerLon - lonRadius;
    const maxLon = centerLon + lonRadius;

    let lat = minLat;
    while (lat <= maxLat) {
      let lon = minLon;
      while (lon <= maxLon) {
        // Check if this point is within the radius
        if (GeohashUtils.distanceMeters(centerLat, centerLon, lat, lon) <= radiusMeters) {
          const geohash = GeohashUtils.encode(lat, lon, precision);
          geohashes.add(geohash);
        }
        lon += lonStep;
      }
      lat += latStep;
    }

    // Always include the center point
    geohashes.add(GeohashUtils.encode(centerLat, centerLon, precision));

    return geohashes;
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  static distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadius = 6371000.0; // meters

    const dLat = GeohashUtils.toRadians(lat2 - lat1);
    const dLon = GeohashUtils.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(GeohashUtils.toRadians(lat1)) * Math.cos(GeohashUtils.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
  }

  /**
   * Get approximate grid size for a given precision
   */
  private static getApproximateGridSize(precision: number): GridSize {
    // More accurate cell dimensions in degrees for different precisions
    // Based on geohash bit allocation: longitude gets more bits on even positions
    switch (precision) {
      case 1:
        return { latDegrees: 45.0, lonDegrees: 45.0 }; // ~5000km
      case 2:
        return { latDegrees: 11.25, lonDegrees: 5.625 }; // ~1250km x 625km
      case 3:
        return { latDegrees: 1.40625, lonDegrees: 1.40625 }; // ~156km
      case 4:
        return { latDegrees: 0.3515625, lonDegrees: 0.17578125 }; // ~39km x 19.5km
      case 5:
        return { latDegrees: 0.0439453125, lonDegrees: 0.0439453125 }; // ~4.9km (2.4km radius)
      case 6:
        return { latDegrees: 0.010986328125, lonDegrees: 0.0054931640625 }; // ~1.2km x 0.6km
      case 7:
        return { latDegrees: 0.001373291015625, lonDegrees: 0.001373291015625 }; // ~153m
      case 8:
        return { latDegrees: 0.000343322753906, lonDegrees: 0.000171661376953 }; // ~38m x 19m
      case 9:
        return { latDegrees: 0.000042915344238, lonDegrees: 0.000042915344238 }; // ~4.8m
      default:
        return { latDegrees: 0.00001, lonDegrees: 0.00001 }; // Fallback for higher precisions
    }
  }

  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
