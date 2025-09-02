# Dummy Account Implementation for Google Play Store Closed Testing

## Overview

This implementation adds support for dummy test accounts that bypass OTP verification for Google Play Store closed testing. These accounts allow testers to authenticate without requiring actual OTP verification through the Orvio service.

## Implementation Details

### Phone Number Pattern

Dummy accounts are identified by phone numbers consisting of exactly **10 consecutive 9's** in the actual phone number portion:

**Supported Formats:**
- `9999999999` (10 digits)
- `+919999999999` (with +91 country code)
- `919999999999` (with 91 country code)
- `0919999999999` (with 091 prefix)
- `+91-9999-999-999` (formatted)
- `+91 9999 999 999` (spaced)

### Architecture Decision

The implementation leverages the existing debug mode infrastructure by combining dummy account detection with debug mode using a simple OR condition (`this.isDebugMode || isDummyAccount`). This approach:

- **Eliminates code duplication** - Both modes share the same bypass logic
- **Maintains separation of concerns** - Dummy account detection is separate but integrates cleanly
- **Simplifies maintenance** - Single code path for OTP bypassing
- **Preserves existing functionality** - Debug mode continues to work independently

### Code Changes

#### 1. AuthService (`src/auth/auth.service.ts`)

**New Method: `isDummyTestAccount(phoneNumber: string): boolean`**
- Removes all non-digit characters from phone number
- Checks for three valid patterns:
  - 10 digits: `9999999999`
  - 12 digits: `919999999999` (91 + 10 nines)
  - 13 digits: `0919999999999` (091 + 10 nines)

**Modified Method: `sendOtp(phoneNumber: string)`**
- Added dummy account check and combined with existing debug mode logic
- Uses `this.isDebugMode || isDummyAccount` condition for cleaner code
- Generates appropriate transaction ID prefix (`debug-` or `dummy-`)
- Dynamic logging based on account type
- Skips actual OTP sending for both debug and dummy accounts

**Modified Method: `verifyOtpAndLoginOrCreateUser(tid: string, otp: string, fcmToken?: string)`**
- Combined dummy account and debug mode checks with OR condition
- Completely bypasses Orvio OTP verification for both modes
- Any OTP value will be accepted for dummy accounts and debug mode
- Dynamic logging with appropriate prefixes

#### 2. Test Coverage

**Unit Tests (`src/auth/auth.service.spec.ts`)**
- Comprehensive test suite for `isDummyTestAccount` method
- Tests all valid dummy account formats
- Tests rejection of invalid patterns
- Tests edge cases and boundary conditions

**Integration Test Script (`test_dummy_accounts.py`)**
- Python script to test the end-to-end flow
- Tests both dummy and regular accounts
- Provides clear success/failure feedback

## Security Considerations

1. **Production Safety**: The dummy account pattern (`9999999999`) is extremely unlikely to be a real phone number
2. **Logging**: All dummy account authentications are clearly logged with `[DUMMY ACCOUNT]` prefix
3. **No Bypass of Business Logic**: Only OTP verification is bypassed; all other authentication logic remains intact
4. **User Creation**: Dummy accounts still create real user records in the database

## Usage for Google Play Store Testing

1. **For Testers**: Use phone number `9999999999` (or any of the supported formats) during app testing
2. **Send OTP**: The app will receive a valid transaction ID
3. **Verify OTP**: Any OTP value (e.g., `123456`) will be accepted
4. **Authentication**: User will be successfully authenticated and can use the app normally

## Monitoring

### Console Logs
- `[DUMMY ACCOUNT] Sending fake OTP to 9999999999`
- `[DUMMY ACCOUNT] Bypassing OTP verification for 9999999999`
- `[DEBUG] Sending fake OTP to 1234567890` (for debug mode)
- `[DEBUG] Bypassing OTP verification for 1234567890` (for debug mode)

### Expected Behavior
- Dummy accounts bypass OTP verification entirely
- Regular accounts continue to require proper Orvio OTP verification
- Debug mode continues to work independently of dummy accounts

## Testing

Run the unit tests:
```bash
npm test -- --testPathPattern=auth.service.spec.ts
```

Run the integration test (requires server to be running):
```bash
python3 test_dummy_accounts.py
```

## Rollback Plan

If needed, the dummy account functionality can be disabled by:
1. **Simple approach**: Modify `isDummyTestAccount()` to always return `false`
2. **Complete removal**: Remove the `isDummyTestAccount()` method and the `|| isDummyAccount` conditions

The implementation is designed to be non-intrusive and easily removable. Since it integrates with the existing debug mode logic, disabling it won't affect any other functionality.
