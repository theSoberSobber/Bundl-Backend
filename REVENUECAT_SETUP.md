# RevenueCat Setup Guide

## Overview
This guide covers the complete setup for RevenueCat integration with Google Play Billing for the Bundl backend.

## Required Environment Variables

Add these to your `.env` file:

```bash
# RevenueCat Configuration
REVENUECAT_WEBHOOK_SECRET=your_bearer_token_here        # Authorization header value (Bearer token)

# Google Play Console (for RevenueCat setup)
GOOGLE_PLAY_CONSOLE_PROJECT_ID=your_project_id          # Google Play Console project
```

## RevenueCat Best Practices Implemented

### ✅ Event ID Based Idempotency
- Uses RevenueCat's unique `event.id` for deduplication
- Prevents duplicate processing as recommended in RevenueCat docs
- Stores event IDs in database for reliable deduplication

### ✅ Authorization Header Authentication  
- Uses `Authorization: Bearer <token>` header validation
- More secure than timestamp-based signature validation
- Follows RevenueCat's recommended webhook security pattern

### ✅ Quick Response Pattern
- Responds within 60-second timeout as recommended
- Defers processing after acknowledgment when appropriate
- Prevents RevenueCat webhook retries due to timeouts

### ✅ Future-Proofing
- Gracefully handles unknown event types without errors
- Acknowledges and logs unhandled events as recommended
- Ready for new RevenueCat event types without code changes

### ✅ Trust Store Validation
- Trusts RevenueCat's validation of Google Play Store transactions
- No unnecessary price verification (already validated by RevenueCat)
- Simpler and more reliable than custom validation logic

## Environment Setup

### Production Configuration
```bash
REVENUECAT_WEBHOOK_SECRET=production_webhook_secret
```

## RevenueCat Dashboard Setup Steps

1. **Create RevenueCat Account**
   - Go to https://app.revenuecat.com
   - Sign up with your Google account or email

2. **Create New Project**
   - Name: "Bundl"
   - Platform: Android

3. **Add Google Play Store Integration**
   - Upload your Google Play service account JSON
   - Add package name: `com.yourpackage.bundl`

4. **Configure Products**
   - Add products matching your current packages:
     - `bundle_5_credits`: ₹5 for 5 credits
     - `bundle_10_credits`: ₹8 for 10 credits  
     - `bundle_20_credits`: ₹12 for 20 credits

5. **Set Up Webhooks**
   - URL: `https://yourdomain.com/credits/webhook/revenuecat`
   - Events: Check all purchase-related events  
   - Authorization: Set a secure Bearer token
   - Copy the Bearer token to `REVENUECAT_WEBHOOK_SECRET`

## Security Considerations

1. **Authorization Header Security**
   - Use strong Bearer tokens for webhook authentication
   - RevenueCat sends: `Authorization: Bearer <your_token>`
   - Rotate tokens periodically for security

2. **Event ID Deduplication**
   - Each event has unique `event.id` for idempotency
   - Database stores event IDs to prevent duplicate processing
   - More reliable than Redis locks for distributed systems

3. **Store Trust Model**
   - RevenueCat validates purchases with Google Play/App Store
   - No need for additional price verification on your backend
   - Trust the validated transaction data from RevenueCat

## Migration Checklist

- [ ] RevenueCat account created
- [ ] Google Play integration configured
- [ ] Products created in Google Play Console
- [ ] Products configured in RevenueCat
- [ ] Webhook endpoint configured
- [ ] Environment variables set
- [ ] Android app updated with RevenueCat SDK
- [ ] Testing completed in sandbox mode
- [ ] Production deployment planned
- [ ] Rollback plan prepared
