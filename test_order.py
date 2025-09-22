#!/usr/bin/env python3

import requests
import json
import time
import random
import uuid
import sys

# API Base URL
BASE_URL = "http://localhost:3002"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# Generate random phone numbers for fresh users with default credits
TEST_PHONE_1 = f'+91{random.randint(9000000000, 9999999999)}'  # User who creates the order
TEST_PHONE_2 = f'+91{random.randint(9000000000, 9999999999)}'  # User who pledges to the order

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
    return None

def check_credit_balance(access_token, user_id):
    """Check user's credit balance"""
    headers = {"Authorization": f"Bearer {access_token}"}
    
    try:
        response = requests.get(f"{BASE_URL}/credits/balance", headers=headers)
        data = print_response(response, f"Credit Balance for {user_id}")
        
        if response.status_code == 200 and data:
            return data.get('credits', 0)
        return 0
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        return 0

def authenticate_user(phone_number):
    """Authenticate user and return access token using debug mode"""
    print(f"\n{Colors.BOLD}Authenticating user: {phone_number}{Colors.ENDC}")
    
    # Step 1: Send OTP
    try:
        response = requests.post(
            f"{BASE_URL}/auth/sendOtp",
            json={"phoneNumber": phone_number}
        )
        
        data = print_response(response, "Send OTP Response")
        if not data or 'tid' not in data:
            print(f"{Colors.FAIL}Failed to get transaction ID{Colors.ENDC}")
            sys.exit(1)
        
        tid = data['tid']
        
        # Step 2: Verify OTP (any OTP will work in debug mode)
        fcm_token = f"fcm-test-{uuid.uuid4()}"  # Unique FCM token
        
        response = requests.post(
            f"{BASE_URL}/auth/verifyOtp",
            json={
                "tid": tid,
                "otp": "000000",  # Any OTP works in debug mode
                "fcmToken": fcm_token
            }
        )
        
        data = print_response(response, "Verify OTP Response")
        if not data or 'accessToken' not in data or 'refreshToken' not in data:
            print(f"{Colors.FAIL}Failed to get authentication tokens{Colors.ENDC}")
            sys.exit(1)
        
        # Extract tokens
        access_token = data['accessToken']
        refresh_token = data['refreshToken']
        user_id = data['user']['id']
        
        print(f"{Colors.GREEN}Successfully authenticated user: {phone_number}{Colors.ENDC}")
        print(f"{Colors.BLUE}User ID:{Colors.ENDC} {user_id}")
        print(f"{Colors.BLUE}FCM Token:{Colors.ENDC} {fcm_token[:15]}...")
        
        return access_token, refresh_token, user_id
        
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def create_order(access_token, user_id):
    """Create a new order"""
    print(f"\n{Colors.BOLD}Creating a new order{Colors.ENDC}")
    
    # Random location in Bangalore
    lat = 12.9716 + random.uniform(-0.1, 0.1)
    lng = 77.5946 + random.uniform(-0.1, 0.1)
    
    order_payload = {
        "platform": "zomato",
        "amountNeeded": 150,  # Need ₹150 total
        "latitude": lat,
        "longitude": lng,
        "initialPledge": 50,  # Initial pledge of ₹50
        "expirySeconds": 5  # 5 seconds for testing
    }
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/orders/createOrder",
            json=order_payload,
            headers=headers
        )
        
        data = print_response(response, "Create Order Response")
        
        if response.status_code != 201 or not data:
            print(f"{Colors.FAIL}Failed to create order{Colors.ENDC}")
            sys.exit(1)
        
        print(f"{Colors.GREEN}Order created successfully:{Colors.ENDC}")
        print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {data['id']}")
        print(f"{Colors.BLUE}Amount Needed:{Colors.ENDC} {data['amountNeeded']}")
        print(f"{Colors.BLUE}Initial Pledge:{Colors.ENDC} {data['totalPledge']} (by user {user_id})")
        print(f"{Colors.BLUE}Platform:{Colors.ENDC} {data['platform']}")
        print(f"{Colors.BLUE}Location:{Colors.ENDC} ({data['latitude']}, {data['longitude']})")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def pledge_to_order(access_token, order_id, user_id, pledge_amount=50):
    """Pledge to an existing order"""
    print(f"\n{Colors.BOLD}Pledging ₹{pledge_amount} to order {order_id}{Colors.ENDC}")
    
    pledge_payload = {
        "orderId": order_id,
        "pledgeAmount": pledge_amount
    }
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/orders/pledgeToOrder",
            json=pledge_payload,
            headers=headers
        )
        
        data = print_response(response, "Pledge Response")
        
        if response.status_code != 200 or not data:
            print(f"{Colors.FAIL}Failed to pledge to order{Colors.ENDC}")
            sys.exit(1)
        
        print(f"{Colors.GREEN}Successfully pledged ₹{pledge_amount} to order{Colors.ENDC}")
        print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {data['id']}")
        print(f"{Colors.BLUE}Total Pledge:{Colors.ENDC} {data['totalPledge']}")
        print(f"{Colors.BLUE}Amount Needed:{Colors.ENDC} {data['amountNeeded']}")
        print(f"{Colors.BLUE}Order Status:{Colors.ENDC} {data['status']}")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def get_active_orders(access_token, lat, lng):
    """Get active orders near a location"""
    print(f"\n{Colors.BOLD}Getting active orders near ({lat:.4f}, {lng:.4f}){Colors.ENDC}")
    
    params = {
        "latitude": lat,
        "longitude": lng,
        "radiusKm": 10  # 10km radius
    }
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    try:
        response = requests.get(
            f"{BASE_URL}/orders/activeOrders",
            params=params,
            headers=headers
        )
        
        data = print_response(response, "Active Orders Response")
        
        if response.status_code != 200:
            print(f"{Colors.FAIL}Failed to get active orders{Colors.ENDC}")
            sys.exit(1)
        
        count = len(data) if data else 0
        print(f"{Colors.GREEN}Found {count} active orders near location{Colors.ENDC}")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def get_order_status(access_token, order_id, user_id):
    """Get status of a specific order"""
    print(f"\n{Colors.BOLD}Getting status for order {order_id}{Colors.ENDC}")
    
    headers = {
        "Authorization": f"Bearer {access_token}"
    }
    
    try:
        response = requests.get(
            f"{BASE_URL}/orders/orderStatus/{order_id}",
            headers=headers
        )
        
        data = print_response(response, "Order Status Response")
        
        if response.status_code != 200 or not data:
            print(f"{Colors.FAIL}Failed to get order status{Colors.ENDC}")
            sys.exit(1)
        
        print(f"{Colors.GREEN}Retrieved order status successfully{Colors.ENDC}")
        print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {data['id']}")
        print(f"{Colors.BLUE}Status:{Colors.ENDC} {data['status']}")
        print(f"{Colors.BLUE}Total Pledge:{Colors.ENDC} {data['totalPledge']} / {data['amountNeeded']}")
        print(f"{Colors.BLUE}Total Users:{Colors.ENDC} {data['totalUsers']}")
        
        # Show pledge details if this user is a pledger
        user_pledge = data.get('pledgeMap', {}).get(user_id)
        if user_pledge:
            print(f"{Colors.BLUE}Your Pledge:{Colors.ENDC} {user_pledge}")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def run_test():
    """Run the order expiry test flow"""
    print(f"\n{Colors.BOLD}{Colors.HEADER}===== BUNDL ORDER EXPIRY TEST ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Testing against API at:{Colors.ENDC} {BASE_URL}")
    print(f"{Colors.BLUE}Order expiry time: 5 seconds{Colors.ENDC}")
    
    # Step 1: Authenticate first user (order creator)
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 1: Authenticate Order Creator{Colors.ENDC}")
    creator_token, _, creator_id = authenticate_user(TEST_PHONE_1)
    
    # Check initial credits
    print(f"\n{Colors.BOLD}Checking initial credit balance{Colors.ENDC}")
    initial_credits = check_credit_balance(creator_token, creator_id)
    print(f"{Colors.BLUE}Creator initial credits:{Colors.ENDC} {initial_credits}")
    
    # Step 2: Authenticate second user (pledger)
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 2: Authenticate Pledger{Colors.ENDC}")
    pledger_token, _, pledger_id = authenticate_user(TEST_PHONE_2)
    
    # Check pledger initial credits
    pledger_initial_credits = check_credit_balance(pledger_token, pledger_id)
    print(f"{Colors.BLUE}Pledger initial credits:{Colors.ENDC} {pledger_initial_credits}")
    
    # Step 3: Create an order
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 3: Create New Order (5 second expiry){Colors.ENDC}")
    order = create_order(creator_token, creator_id)
    order_id = order['id']
    
    # Check credits after order creation
    creator_credits_after_create = check_credit_balance(creator_token, creator_id)
    print(f"{Colors.BLUE}Creator credits after order creation:{Colors.ENDC} {creator_credits_after_create}")
    print(f"{Colors.WARNING}Credits deducted for order creation:{Colors.ENDC} {initial_credits - creator_credits_after_create}")
    
    # Step 4: Make a pledge quickly
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 4: Make Quick Pledge Before Expiry{Colors.ENDC}")
    pledge_result = pledge_to_order(pledger_token, order_id, pledger_id, 50)
    
    # Check pledger credits after pledge
    pledger_credits_after_pledge = check_credit_balance(pledger_token, pledger_id)
    print(f"{Colors.BLUE}Pledger credits after pledge:{Colors.ENDC} {pledger_credits_after_pledge}")
    print(f"{Colors.WARNING}Credits deducted for pledge:{Colors.ENDC} {pledger_initial_credits - pledger_credits_after_pledge}")
    
    # Step 5: Wait for expiry and monitor
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 5: Wait for Order Expiry (5 seconds){Colors.ENDC}")
    print(f"{Colors.BLUE}Waiting for order to expire...{Colors.ENDC}")
    
    time.sleep(7)  # Wait a bit longer than expiry time
    
    # Step 6: Check credits after expiry
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 6: Check Credits After Expiry{Colors.ENDC}")
    
    creator_credits_final = check_credit_balance(creator_token, creator_id)
    pledger_credits_final = check_credit_balance(pledger_token, pledger_id)
    
    print(f"{Colors.BLUE}Creator credits after expiry:{Colors.ENDC} {creator_credits_final}")
    print(f"{Colors.BLUE}Pledger credits after expiry:{Colors.ENDC} {pledger_credits_final}")
    
    # Calculate refunds
    creator_refund = creator_credits_final - creator_credits_after_create
    pledger_refund = pledger_credits_final - pledger_credits_after_pledge
    
    print(f"\n{Colors.BOLD}{Colors.HEADER}===== CREDIT REFUND ANALYSIS ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Creator refund:{Colors.ENDC} {creator_refund} credits")
    print(f"{Colors.BLUE}Pledger refund:{Colors.ENDC} {pledger_refund} credits")
    
    # Expected: Each user should get back exactly 1 credit
    print(f"\n{Colors.BOLD}Expected refunds:{Colors.ENDC} 1 credit each")
    
    if creator_refund == 1:
        print(f"{Colors.GREEN}✓ Creator refund correct: {creator_refund} credit{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}✗ Creator refund WRONG: {creator_refund} credits (expected 1){Colors.ENDC}")
    
    if pledger_refund == 1:
        print(f"{Colors.GREEN}✓ Pledger refund correct: {pledger_refund} credit{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}✗ Pledger refund WRONG: {pledger_refund} credits (expected 1){Colors.ENDC}")
    
    # Summary
    print(f"\n{Colors.BOLD}{Colors.HEADER}===== TEST SUMMARY ====={Colors.ENDC}")
    if creator_refund == 1 and pledger_refund == 1:
        print(f"{Colors.GREEN}✓ PASS: Credit refunds are correct{Colors.ENDC}")
    else:
        print(f"{Colors.FAIL}✗ FAIL: Credit refund bug detected!{Colors.ENDC}")
        print(f"{Colors.WARNING}Creator got {creator_refund} credits instead of 1{Colors.ENDC}")
        print(f"{Colors.WARNING}Pledger got {pledger_refund} credits instead of 1{Colors.ENDC}")
if __name__ == "__main__":
    try:
        run_test()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Test interrupted by user{Colors.ENDC}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{Colors.FAIL}Unexpected error: {e}{Colors.ENDC}")
        sys.exit(1) 
