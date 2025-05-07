#!/usr/bin/env python3

import requests
import json
import time
import sys
import hmac
import hashlib
import base64
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# API Base URL - change this to match your server
BASE_URL = "http://localhost:3002"

# Get Cashfree secret from environment
CASHFREE_CLIENT_SECRET = os.getenv('CASHFREE_CLIENT_SECRET', 'test-secret-key')

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

def get_auth_token():
    """Get authentication token for testing"""
    print(f"\n{Colors.BOLD}Getting authentication token{Colors.ENDC}")

    # Get phone number from user
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

    # Get OTP from user
    otp = "000000"

    # Verify OTP
    response = requests.post(
        f"{BASE_URL}/auth/verifyOtp",
        json={
            "tid": data['tid'],
            "otp": otp,
            "fcmToken": "test_fcm_token"
        }
    )

    data = print_response(response, "Verify OTP Response")
    if not data or 'accessToken' not in data:
        print(f"{Colors.FAIL}Failed to get access token{Colors.ENDC}")
        sys.exit(1)

    return data['accessToken'], data['user']['id']

def test_get_packages(access_token):
    """Test getting credit packages"""
    print(f"\n{Colors.BOLD}Testing /credits/packages endpoint{Colors.ENDC}")

    response = requests.get(
        f"{BASE_URL}/credits/packages",
        headers={"Authorization": f"Bearer {access_token}"}
    )

    data = print_response(response, "Get Packages Response")
    if not data:
        print(f"{Colors.FAIL}Failed to get credit packages{Colors.ENDC}")
        sys.exit(1)

    return data[0]  # Return first package for testing

def test_get_balance(access_token):
    """Test getting user's credit balance"""
    print(f"\n{Colors.BOLD}Testing /credits/balance endpoint{Colors.ENDC}")

    response = requests.get(
        f"{BASE_URL}/credits/balance",
        headers={"Authorization": f"Bearer {access_token}"}
    )

    data = print_response(response, "Get Balance Response")
    if not data or 'credits' not in data:
        print(f"{Colors.FAIL}Failed to get credit balance{Colors.ENDC}")
        sys.exit(1)

    return data['credits']

def test_create_order(access_token, credits):
    """Test creating a payment order"""
    print(f"\n{Colors.BOLD}Testing /credits/order endpoint{Colors.ENDC}")

    response = requests.post(
        f"{BASE_URL}/credits/order",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"credits": credits}
    )

    data = print_response(response, "Create Order Response")
    if not data or 'orderId' not in data:
        print(f"{Colors.FAIL}Failed to create order{Colors.ENDC}")
        sys.exit(1)

    return data['orderId'], data['sessionId']

def test_verify_payment(access_token, order_id):
    """Test verifying payment status"""
    print(f"\n{Colors.BOLD}Testing /credits/verify endpoint{Colors.ENDC}")

    response = requests.post(
        f"{BASE_URL}/credits/verify",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"orderId": order_id}
    )

    data = print_response(response, "Verify Payment Response")
    if not data:
        print(f"{Colors.FAIL}Failed to verify payment{Colors.ENDC}")
        sys.exit(1)

    return data['success']

def test_webhook_notification(order_id):
    """Test webhook notification handling"""
    print(f"\n{Colors.BOLD}Testing /credits/webhook endpoint{Colors.ENDC}")

    # Create webhook payload
    timestamp = str(int(time.time()))
    payload = {
        "data": {
            "order": {
                "order_id": order_id
            },
            "payment": {
                "payment_status": "SUCCESS"
            }
        }
    }

    # Calculate signature
    payload_str = json.dumps(payload, separators=(',', ':'))  # Compact JSON without whitespace
    signature_data = payload_str + CASHFREE_CLIENT_SECRET + timestamp
    signature = base64.b64encode(
        hmac.new(
            CASHFREE_CLIENT_SECRET.encode(),
            signature_data.encode(),
            hashlib.sha256
        ).digest()
    ).decode()

    # Send webhook notification
    response = requests.post(
        f"{BASE_URL}/credits/webhook",
        headers={
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": signature,
            "Content-Type": "application/json"
        },
        json=payload
    )

    data = print_response(response, "Webhook Response")
    if not data or not data.get('success'):
        print(f"{Colors.FAIL}Failed to process webhook{Colors.ENDC}")
        sys.exit(1)

    return data['success']

def main():
    print(f"{Colors.BOLD}{Colors.HEADER}===== Bundl Credits API Test =====\n{Colors.ENDC}")

    # Get authentication token
    access_token, user_id = get_auth_token()

    # Get initial balance
    initial_balance = test_get_balance(access_token)
    print(f"\n{Colors.BLUE}Initial credit balance: {initial_balance}{Colors.ENDC}")

    # Get credit packages
    package = test_get_packages(access_token)
    credits_to_buy = package['credits']

    # Create order
    order_id, session_id = test_create_order(access_token, credits_to_buy)
    print(f"\n{Colors.GREEN}Created order: {order_id}{Colors.ENDC}")
    print(f"{Colors.GREEN}Payment session ID: {session_id}{Colors.ENDC}")

    # Simulate payment process
    print(f"\n{Colors.BOLD}Simulating payment process...{Colors.ENDC}")
    time.sleep(2)  # Wait for a moment

    # Test webhook notification (simulating Cashfree callback)
    webhook_success = test_webhook_notification(order_id)
    if webhook_success:
        print(f"{Colors.GREEN}Webhook processed successfully{Colors.ENDC}")

    # Verify payment status
    payment_verified = test_verify_payment(access_token, order_id)
    if payment_verified:
        print(f"{Colors.GREEN}Payment verified successfully{Colors.ENDC}")

    # Check final balance
    final_balance = test_get_balance(access_token)
    print(f"\n{Colors.BLUE}Final credit balance: {final_balance}{Colors.ENDC}")

    # Verify credits were added
    if final_balance == initial_balance + credits_to_buy:
        print(f"{Colors.GREEN}Credits added successfully!{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}Credit balance mismatch!{Colors.ENDC}")

    print(f"\n{Colors.BOLD}{Colors.GREEN}===== Test Completed =====\n{Colors.ENDC}")

if __name__ == "__main__":
    main() 
