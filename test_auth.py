#!/usr/bin/env python3

import requests
import json
import time
import sys

# API Base URL - change this to match your server
BASE_URL = "https://backend-bundl.1110777.xyz"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_response(response, label):
    """Print formatted API response"""
    print(f"\n{Colors.BOLD}{Colors.HEADER}==== {label} ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Status Code:{Colors.ENDC} {response.status_code}")

    if response.status_code != 204:  # No content
        try:
            data = response.json()
            print(f"{Colors.BLUE}Response Body:{Colors.ENDC}")
            print(json.dumps(data, indent=2))
            return data
        except json.JSONDecodeError:
            print(f"{Colors.WARNING}No valid JSON in response{Colors.ENDC}")
            print(response.text)

    return None

def test_send_otp():
    """Test sending OTP"""
    print(f"\n{Colors.BOLD}Testing /auth/sendOtp endpoint{Colors.ENDC}")

    # Get phone number from user
    # phone_number = input("Enter your phone number (e.g. +919770483089): ")
    phone_number = "+919770483089"


    # Send OTP
    response = requests.post(
        f"{BASE_URL}/auth/sendOtp",
        json={"phoneNumber": phone_number}
    )

    data = print_response(response, "Send OTP Response")
    if not data or 'tid' not in data:
        print(f"{Colors.FAIL}Failed to get transaction ID{Colors.ENDC}")
        sys.exit(1)

    return data['tid'], phone_number

def test_verify_otp(tid, phone_number):
    """Test verifying OTP"""
    print(f"\n{Colors.BOLD}Testing /auth/verifyOtp endpoint{Colors.ENDC}")

    # Get OTP from user
    # otp = input(f"Enter the OTP sent to {phone_number}: ")
    otp = "000000"
    # Test FCM token
    fcm_token = "test_fcm_token_" + str(int(time.time()))

    # Verify OTP
    response = requests.post(
        f"{BASE_URL}/auth/verifyOtp",
        json={
            "tid": tid,
            "otp": otp,
            "fcmToken": fcm_token
        }
    )

    data = print_response(response, "Verify OTP Response")
    if not data or 'accessToken' not in data or 'refreshToken' not in data:
        print(f"{Colors.FAIL}Failed to get tokens{Colors.ENDC}")
        sys.exit(1)

    return data['accessToken'], data['refreshToken'], data['user']['id']

def test_update_fcm_token(access_token, user_id):
    """Test updating FCM token"""
    print(f"\n{Colors.BOLD}Testing /auth/updateFcmToken endpoint{Colors.ENDC}")

    # New FCM token
    new_fcm_token = "updated_fcm_token_" + str(int(time.time()))

    # Update FCM token
    response = requests.post(
        f"{BASE_URL}/auth/updateFcmToken",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"fcmToken": new_fcm_token}
    )

    data = print_response(response, "Update FCM Token Response")
    if not data or 'fcmToken' not in data:
        print(f"{Colors.FAIL}Failed to update FCM token{Colors.ENDC}")
    elif data['fcmToken'] != new_fcm_token:
        print(f"{Colors.FAIL}FCM token not updated correctly{Colors.ENDC}")
    else:
        print(f"{Colors.GREEN}FCM token updated successfully{Colors.ENDC}")

    return new_fcm_token

def test_refresh_token(refresh_token):
    """Test refreshing tokens"""
    print(f"\n{Colors.BOLD}Testing /auth/refresh endpoint{Colors.ENDC}")

    # Refresh token
    response = requests.post(
        f"{BASE_URL}/auth/refresh",
        json={"refreshToken": refresh_token}
    )

    data = print_response(response, "Refresh Token Response")
    if not data or 'accessToken' not in data:
        print(f"{Colors.FAIL}Failed to refresh tokens{Colors.ENDC}")
        return None, refresh_token

    print(f"{Colors.GREEN}Tokens refreshed successfully{Colors.ENDC}")
    return data['accessToken'], data['refreshToken']

def test_sign_out(access_token):
    """Test signing out"""
    print(f"\n{Colors.BOLD}Testing /auth/signOut endpoint{Colors.ENDC}")

    # Sign out
    response = requests.post(
        f"{BASE_URL}/auth/signOut",
        headers={"Authorization": f"Bearer {access_token}"}
    )

    data = print_response(response, "Sign Out Response")
    if not data or 'success' not in data or not data['success']:
        print(f"{Colors.FAIL}Failed to sign out{Colors.ENDC}")
    else:
        print(f"{Colors.GREEN}Signed out successfully{Colors.ENDC}")

def test_invalid_access(access_token, refresh_token):
    """Test accessing a protected endpoint after signing out"""
    print(f"\n{Colors.BOLD}Testing access after sign out{Colors.ENDC}")

    # Try to access a protected endpoint
    response = requests.post(
        f"{BASE_URL}/auth/updateFcmToken",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"fcmToken": "test"}
    )

    data = print_response(response, "Protected Endpoint After Sign Out")
    if response.status_code == 401:
        print(f"{Colors.GREEN}Correctly received 401 Unauthorized{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}Did not receive expected 401 Unauthorized{Colors.ENDC}")

    # Try to refresh token
    response = requests.post(
        f"{BASE_URL}/auth/refresh",
        json={"refreshToken": refresh_token}
    )

    data = print_response(response, "Refresh After Sign Out")
    if response.status_code == 403:
        print(f"{Colors.GREEN}Correctly received 403 Forbidden{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}Did not receive expected 403 Forbidden{Colors.ENDC}")

def main():
    print(f"{Colors.BOLD}{Colors.HEADER}===== Bundl Auth API Test =====\n{Colors.ENDC}")

    # Test OTP flow
    tid, phone_number = test_send_otp()
    access_token, refresh_token, user_id = test_verify_otp(tid, phone_number)

    # Test updating FCM token
    new_fcm_token = test_update_fcm_token(access_token, user_id)

    # Wait a moment to ensure tokens are processed
    time.sleep(1)

    # Test refreshing tokens
    new_access_token, new_refresh_token = test_refresh_token(refresh_token)

    # Test signing out
    test_sign_out(new_access_token)

    # Test accessing after sign out
    test_invalid_access(new_access_token, new_refresh_token)

    print(f"\n{Colors.BOLD}{Colors.GREEN}===== Test Completed =====\n{Colors.ENDC}")

if __name__ == "__main__":
    main()
