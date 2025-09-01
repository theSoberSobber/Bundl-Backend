require('dotenv').config({ path: '../.env' });
const express = require('express');
const path = require('path');
const admin = require('firebase-admin');

// Import geohash utilities (simplified version for this standalone server)
class GeohashUtils {
  static BASE32_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
  static BASE32_MAP = GeohashUtils.createBase32Map();

  static createBase32Map() {
    const map = new Map();
    for (let i = 0; i < GeohashUtils.BASE32_ALPHABET.length; i++) {
      map.set(GeohashUtils.BASE32_ALPHABET[i], i);
    }
    return map;
  }

  static encode(latitude, longitude, precision = 7) {
    if (latitude < -90 || latitude > 90) throw new Error('Invalid latitude');
    if (longitude < -180 || longitude > 180) throw new Error('Invalid longitude');

    const latRange = [-90.0, 90.0];
    const lonRange = [-180.0, 180.0];
    let isEven = true;
    let bit = 0;
    let base32Index = 0;
    let geohash = '';

    while (geohash.length < precision) {
      if (isEven) {
        const mid = (lonRange[0] + lonRange[1]) / 2;
        if (longitude > mid) {
          base32Index = (base32Index << 1) | 1;
          lonRange[0] = mid;
        } else {
          base32Index = base32Index << 1;
          lonRange[1] = mid;
        }
      } else {
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

  static getCoverageGeohashes(centerLat, centerLon, radiusMeters = 200, precision = 7) {
    const geohashes = new Set();
    const earthRadiusMeters = 6371000.0;
    const latDegreesPerMeter = 1.0 / (earthRadiusMeters * Math.PI / 180.0);
    const lonDegreesPerMeter = 1.0 / (earthRadiusMeters * Math.PI / 180.0 * Math.cos(centerLat * Math.PI / 180.0));

    const latRadius = radiusMeters * latDegreesPerMeter;
    const lonRadius = radiusMeters * lonDegreesPerMeter;

    const gridSize = precision === 7 ? 0.001373291015625 : 0.01; // ~153m for precision 7
    const latStep = gridSize;
    const lonStep = gridSize;

    const minLat = centerLat - latRadius;
    const maxLat = centerLat + latRadius;
    const minLon = centerLon - lonRadius;
    const maxLon = centerLon + lonRadius;

    for (let lat = minLat; lat <= maxLat; lat += latStep) {
      for (let lon = minLon; lon <= maxLon; lon += lonStep) {
        if (GeohashUtils.distanceMeters(centerLat, centerLon, lat, lon) <= radiusMeters) {
          geohashes.add(GeohashUtils.encode(lat, lon, precision));
        }
      }
    }

    geohashes.add(GeohashUtils.encode(centerLat, centerLon, precision));
    return geohashes;
  }

  static distanceMeters(lat1, lon1, lat2, lon2) {
    const earthRadius = 6371000.0;
    const dLat = GeohashUtils.toRadians(lat2 - lat1);
    const dLon = GeohashUtils.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(GeohashUtils.toRadians(lat1)) * Math.cos(GeohashUtils.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadius * c;
  }

  static toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }
}

const app = express();
const PORT = process.env.MARKETING_PORT || 3003;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Firebase Admin (reuse from main app)
let firebaseInitialized = false;

function initializeFirebase() {
  try {
    if (admin.apps.length > 0) {
      console.log('Firebase already initialized');
      firebaseInitialized = true;
      return;
    }

    const serviceFilePath = process.env.FCM_SERVICE_FILE_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceFilePath) {
      console.warn('FCM_SERVICE_FILE_PATH not found, notifications will be logged only');
      return;
    }

    const fs = require('fs');
    let absolutePath;
    
    // In Docker, check if service file is mounted directly
    if (fs.existsSync('/app/service.json')) {
      absolutePath = '/app/service.json';
    } else {
      // Local development - look in parent directory
      absolutePath = path.resolve(process.cwd(), '..', serviceFilePath);
    }
    
    if (!fs.existsSync(absolutePath)) {
      console.warn(`FCM service file not found at ${absolutePath}`);
      return;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(absolutePath, 'utf-8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseInitialized = true;
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Firebase:', error.message);
  }
}

// Send notification endpoint
app.post('/send-notification', async (req, res) => {
  try {
    const { title, message, targetType, latitude, longitude } = req.body;

    if (!title || !message || !targetType) {
      return res.status(400).json({ error: 'Title, message, and target type are required' });
    }

    if (targetType === 'location' && (!latitude || !longitude)) {
      return res.status(400).json({ error: 'Latitude and longitude are required for location targeting' });
    }

    console.log(`📱 Marketing Notification Request:`, { title, message, targetType, latitude, longitude });

    if (!firebaseInitialized) {
      console.log(`[SIMULATION] Would send: "${title}" - "${message}" to ${targetType}`);
      return res.json({ 
        success: true, 
        message: 'Notification simulated (FCM not configured)',
        totalTopics: targetType === 'location' ? 4 : 1,
        successful: targetType === 'location' ? 4 : 1,
        failed: 0
      });
    }

    if (targetType === 'all') {
      // Send to all users topic
      const message_payload = {
        topic: 'all_users',
        notification: { title, body: message },
        data: {
          type: 'marketing',
          timestamp: new Date().toISOString(),
        },
        android: { priority: 'high' }
      };

      const response = await admin.messaging().send(message_payload);
      console.log(`✅ Sent to all users:`, response);

      res.json({
        success: true,
        message: 'Notification sent to all users',
        messageId: response,
        totalTopics: 1,
        successful: 1,
        failed: 0
      });

    } else if (targetType === 'location') {
      // Calculate geohashes for location
      const geohashes = GeohashUtils.getCoverageGeohashes(
        parseFloat(latitude),
        parseFloat(longitude),
        200, // 200m radius
        7    // precision 7
      );

      const topics = Array.from(geohashes).map(hash => `geohash_${hash}`);
      console.log(`📍 Targeting ${topics.length} geohash topics:`, topics);

      // Send to all geohash topics
      const results = await Promise.all(
        topics.map(async (topic) => {
          try {
            const message_payload = {
              topic,
              notification: { title, body: message },
              data: {
                type: 'marketing',
                latitude: latitude.toString(),
                longitude: longitude.toString(),
                timestamp: new Date().toISOString(),
              },
              android: { priority: 'high' }
            };

            const response = await admin.messaging().send(message_payload);
            return { topic, success: true, messageId: response };
          } catch (error) {
            console.error(`Failed to send to topic ${topic}:`, error.message);
            return { topic, success: false, error: error.message };
          }
        })
      );

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      console.log(`✅ Location notification sent: ${successful}/${topics.length} successful`);

      res.json({
        success: true,
        message: `Notification sent to users near ${latitude}, ${longitude}`,
        totalTopics: topics.length,
        successful,
        failed,
        geohashes: Array.from(geohashes),
        topics
      });
    }

  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ 
      error: 'Failed to send notification: ' + error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    firebase: firebaseInitialized ? 'connected' : 'not configured',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Bundl Marketing Dashboard running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  
  // Initialize Firebase
  initializeFirebase();
});
