# Bundl Android App Integration Guide

## Initial Setup Requirements

1. **Location Permission**
   - Request `ACCESS_FINE_LOCATION` permission at app startup
   - Required for finding nearby orders

2. **Firebase Cloud Messaging (FCM)**
   - Implement FCM for push notifications
   - Handle `onNewToken` callback to update the user's FCM token

3. **Network Layer Setup**
   - Implement interceptors for 401/403 handling:
     - 401: Token expired -> Call refresh token endpoint
     - 403: Invalid/blacklisted token -> Force logout and redirect to login

## Authentication Flow

### 1. Send OTP
```http
POST /auth/sendOtp
Content-Type: application/json

{
    "phoneNumber": "+919876543210"
}

Response: 200 OK
{
    "success": true,
    "message": "OTP sent successfully"
}
```

### 2. Verify OTP
```http
POST /auth/verifyOtp
Content-Type: application/json

{
    "phoneNumber": "+919876543210",
    "otp": "123456"
}

Response: 200 OK
{
    "accessToken": "...",
    "refreshToken": "...",
    "user": {
        "id": "...",
        "credits": 10,
        // other user fields
    }
}
```

### 3. Update FCM Token
```http
POST /auth/updateFcmToken
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "fcmToken": "..."
}

Response: 200 OK
{
    "success": true
}
```

## User Credits

### Get User Credits
```http
GET /credits/balance
Authorization: Bearer <access_token>

Response: 200 OK
{
    "credits": 10
}
```

## Orders Management

### Get Active Orders Near Location
```http
GET /orders/near?latitude=12.9716&longitude=77.5946&radiusKm=5
Authorization: Bearer <access_token>

Response: 200 OK
{
    "orders": [
        {
            "id": "...",
            "amountNeeded": 1000,
            "totalPledge": 500,
            "platform": "swiggy",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "status": "ACTIVE"
        }
        // ... more orders
    ]
}
```

### Create New Order
```http
POST /orders/createOrder
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "amountNeeded": 1000,
    "platform": "swiggy",
    "latitude": 12.9716,
    "longitude": 77.5946,
    "initialPledge": 200,  // optional
    "expirySeconds": 600   // optional, defaults to 600 (10 minutes)
}

Response: 200 OK
{
    "id": "...",
    "status": "ACTIVE",
    // ... other order fields
}
```

### Get Order Status
```http
GET /orders/orderStatus/:orderId
Authorization: Bearer <access_token>

Response: 200 OK
{
    "id": "...",
    "status": "ACTIVE|COMPLETED|EXPIRED",
    "amountNeeded": 1000,
    "totalPledge": 500,
    "pledgeMap": {
        "userId": pledgeAmount
        // Only shows your pledge if order is active
        // Shows all pledges if order is completed
    }
}
```

### Pledge to Order
```http
POST /orders/pledge
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "orderId": "...",
    "pledgeAmount": 200
}

Response: 200 OK
{
    // Updated order object
}
```

## Credits Purchase Flow

### 1. Get Price Calculation
```http
GET /credits/calculatePrice?credits=15
Authorization: Bearer <access_token>

Response: 200 OK
{
    "credits": 15,
    "pricePerCredit": {
        "0-5": 100,    // ₹100 per credit for first 5
        "5-10": 80,    // ₹80 per credit for next 5
        "10+": 60      // ₹60 per credit for remaining
    },
    "totalAmount": 1100  // Total price in INR
}
```

### 2. Create Payment Order
```http
POST /credits/createOrder
Authorization: Bearer <access_token>
Content-Type: application/json

{
    "credits": 10  // Number of credits to purchase
}

Response: 200 OK
```json
{
    "message": "Use Google Play Billing directly from the app",
    "productId": "bundle_10_credits",
    "credits": 10,
    "price": "₹8.00",
    "instructions": "Complete purchase through Google Play in the mobile app"
}
```

### 2. Process Payment via Google Play Billing
- Use Google Play Billing Client to process payment using the `productId`
- Follow [Google Play Billing Documentation](https://developer.android.com/google/play/billing)
- RevenueCat SDK handles billing integration automatically

### 3. Payment Verification
Payment verification happens automatically via RevenueCat webhooks.
The backend will receive webhooks when purchases are completed and credits will be awarded automatically.

```http
GET /credits/history
Authorization: Bearer <access_token>

Response: 200 OK
{
    "purchases": [
        {
            "id": "...",
            "credits": 10,
            "amount": "₹8.00",
            "date": "2023-12-01T10:00:00Z",
            "status": "completed"
        }
    ]
}
```

## Additional Notes

RevenueCat handles all payment processing and validation automatically.
The backend receives webhooks for successful purchases and awards credits accordingly.
No manual payment verification is required with the RevenueCat integration.
```

## Push Notifications

The app will receive push notifications for the following events:
1. New pledge on your order
2. Order completed
3. Order expired
4. Pledge failure

Notification payload structure:
```json
{
    "orderId": "...",
    "eventType": "new_pledge|order_completed|order_expired|pledge_failure",
    "message": "..."
}
```

## Error Handling

Common error responses:
- 400: Bad Request (invalid input)
- 401: Unauthorized (token expired)
- 403: Forbidden (invalid/blacklisted token)
- 404: Not Found
- 429: Too Many Requests (rate limit exceeded)

Error response format:
```json
{
    "statusCode": 400,
    "message": "Error description",
    "error": "Bad Request"
}
```

## Token Refresh Flow

When receiving a 401:

1. Call refresh token endpoint:
```http
POST /auth/refresh
Content-Type: application/json

{
    "refreshToken": "..."
}

Response: 200 OK
{
    "accessToken": "...",
    "refreshToken": "..."
}
```

2. Update stored tokens
3. Retry failed request with new access token

If refresh fails (403), force logout and redirect to login screen. 