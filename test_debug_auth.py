#!/usr/bin/env python3

import requests
import json
import uuid

# API Base URL
BASE_URL = "https://backend-bundl.1110777.xyz"

# Default test phone number (this won't receive actual messages since we're in debug mode)
TEST_PHONE = "+919876543210"

def print_response(response, label):
    """Print formatted API response"""
    print(f"\n==== {label} =====")
    print(f"Status Code: {response.status_code}")

    if response.status_code != 204:  # No content
        try:
            data = response.json()
            print(f"Response Body:")
            print(json.dumps(data, indent=2))
            return data
        except json.JSONDecodeError:
            print(f"No valid JSON in response")
            print(response.text)

    return None

def debug_authenticate():
    """Authenticate using debug mode - no real OTP needed"""
    print("\nTesting debug authentication flow")
    print("Debug mode should be enabled in .env with DEBUG_ENABLED=true")

    # Send OTP request (debug mode will return a fake tid)
    response = requests.post(
        f"{BASE_URL}/auth/sendOtp",
        json={"phoneNumber": TEST_PHONE}
    )

    data = print_response(response, "Send OTP Response")
    if not data or 'tid' not in data:
        print("Failed to get transaction ID")
        return None, None

    tid = data['tid']
    
    # Verify OTP with any value since we're in debug mode
    fcm_token = f"debug-fcm-{uuid.uuid4()}"
    
    response = requests.post(
        f"{BASE_URL}/auth/verifyOtp",
        json={
            "tid": tid,
            "otp": "000000",  # Any value works in debug mode
            "fcmToken": fcm_token
        }
    )

    data = print_response(response, "Verify OTP Response")
    if not data or 'accessToken' not in data or 'refreshToken' not in data:
        print("Failed to get tokens")
        return None, None

    access_token = data['accessToken']
    refresh_token = data['refreshToken']
    
    print("\nAuthentication successful!")
    print(f"User ID: {data['user']['id']}")
    print(f"FCM Token: {fcm_token}")
    print(f"Access Token: {access_token[:20]}...")
    print(f"Refresh Token: {refresh_token[:20]}...")
    
    return access_token, refresh_token

def test_protected_endpoint(access_token):
    """Test a protected endpoint using the access token"""
    if not access_token:
        print("No access token available, skipping protected endpoint test")
        return
        
    print("\nTesting protected endpoint (updateFcmToken)")
    
    # Update FCM token as a sample protected endpoint
    new_fcm_token = f"updated-fcm-{uuid.uuid4()}"
    
    response = requests.post(
        f"{BASE_URL}/auth/updateFcmToken",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"fcmToken": new_fcm_token}
    )
    
    print_response(response, "Protected Endpoint Response")
    
    if response.status_code == 200:
        print("Successfully accessed protected endpoint")
    else:
        print("Failed to access protected endpoint")

def main():
    print("===== Bundl Debug Auth Test =====")
    
    # Get authentication tokens
    access_token, refresh_token = debug_authenticate()
    
    # Test a protected endpoint
    if access_token:
        test_protected_endpoint(access_token)
    
    print("\n===== Test Completed =====")

if __name__ == "__main__":
    main() 
