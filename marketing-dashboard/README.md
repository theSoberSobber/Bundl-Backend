# Bundl Marketing Dashboard

A lightweight standalone dashboard for sending push notifications to Bundl app users.

## Features

- 📱 Send notifications to **All Users**
- 📍 Send notifications to **Users Near Location** (200m radius)
- 🎯 Geohash-based targeting (matches mobile app exactly)
- 🚀 Simple HTML interface
- ✅ Real-time success/failure feedback

## Quick Start

```bash
cd marketing-dashboard
npm install
npm start
```

The dashboard will be available at: **http://localhost:3003**

## Usage

### Send to All Users
1. Enter notification title and message
2. Select "All Users" 
3. Click "Send Notification"

### Send to Nearby Users
1. Enter notification title and message
2. Select "Users Near Location"
3. Enter latitude and longitude (e.g., 12.9716, 77.5946 for Bangalore)
4. Click "Send Notification"

## Configuration

The dashboard reads Firebase configuration from the main app's `.env` file:
- `FCM_SERVICE_FILE_PATH` - Path to Firebase service account JSON

## Technical Details

- **Port**: 3003 (configurable via `MARKETING_PORT` env var)
- **Geohash Precision**: 7 (~153m accuracy)
- **Location Radius**: 200m around specified coordinates
- **Topics**: `all_users` for broadcast, `geohash_[hash]` for location-based

## Example Notifications

**Marketing Campaign**:
```
Title: "Special Weekend Offer! 🎉"
Message: "Get 20% off on all orders above ₹500. Valid till Sunday!"
Target: All Users
```

**Location-Specific Promotion**:
```
Title: "Mall Opening Special! 🛍️"
Message: "Free delivery for orders from Phoenix Mall. Today only!"
Target: Users Near Location (12.9716, 77.5946)
```
