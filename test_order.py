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

# Test phone numbers (only needed for display, not actually used in debug mode)
TEST_PHONE_1 = '+919876543212'  # User who creates the order
TEST_PHONE_2 = '+919876543213'  # User who pledges to the order

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
        "expirySeconds": 600  # 10 minutes
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
    """Run the full test flow"""
    print(f"\n{Colors.BOLD}{Colors.HEADER}===== BUNDL ORDER FUNCTIONALITY TEST ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Testing against API at:{Colors.ENDC} {BASE_URL}")
    print(f"{Colors.BLUE}Debug mode should be enabled in .env with DEBUG_ENABLED=true{Colors.ENDC}")
    
    # Step 1: Authenticate first user (order creator)
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 1: Authenticate Order Creator{Colors.ENDC}")
    creator_token, _, creator_id = authenticate_user(TEST_PHONE_1)
    
    # Step 2: Create an order
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 2: Create New Order{Colors.ENDC}")
    order = create_order(creator_token, creator_id)
    order_id = order['id']
    lat = order['latitude']
    lng = order['longitude']
    
    # Step 3: Check active orders
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 3: Verify Order in Active Orders List{Colors.ENDC}")
    active_orders = get_active_orders(creator_token, lat, lng)
    
    # Step 4: Get order status
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 4: Check Initial Order Status{Colors.ENDC}")
    order_status = get_order_status(creator_token, order_id, creator_id)
    
    # Step 5: Authenticate second user (pledger)
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 5: Authenticate Pledger{Colors.ENDC}")
    pledger_token, _, pledger_id = authenticate_user(TEST_PHONE_2)
    
    # Step 6: Pledge to the order
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 6: Make First Pledge{Colors.ENDC}")
    pledge_result = pledge_to_order(pledger_token, order_id, pledger_id)
    
    # Step 7: Check updated order status
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 7: Check Updated Order Status{Colors.ENDC}")
    updated_status = get_order_status(creator_token, order_id, creator_id)
    
    # Step 8: Make final pledge to complete the order
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 8: Complete Order with Final Pledge{Colors.ENDC}")
    remaining_amount = order['amountNeeded'] - updated_status['totalPledge']
    if remaining_amount > 0:
        print(f"{Colors.BLUE}Remaining amount needed:{Colors.ENDC} ₹{remaining_amount}")
        final_pledge = pledge_to_order(creator_token, order_id, creator_id, remaining_amount)
    else:
        print(f"{Colors.GREEN}Order already complete! No additional pledge needed.{Colors.ENDC}")
    
    # Step 9: Check final order status
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 9: Verify Final Order Status{Colors.ENDC}")
    final_status = get_order_status(creator_token, order_id, creator_id)
    
    # Summary
    print(f"\n{Colors.BOLD}{Colors.GREEN}===== ORDER TEST SUMMARY ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {order_id}")
    print(f"{Colors.BLUE}Final Status:{Colors.ENDC} {final_status['status']}")
    print(f"{Colors.BLUE}Total Pledged:{Colors.ENDC} ₹{final_status['totalPledge']} / ₹{final_status['amountNeeded']}")
    print(f"{Colors.BLUE}Total Users:{Colors.ENDC} {final_status['totalUsers']}")
    print(f"{Colors.BLUE}Pledgers:{Colors.ENDC} {', '.join(list(final_status.get('pledgeMap', {}).keys()))}")
    
    if final_status['status'] == 'COMPLETED':
        print(f"\n{Colors.BOLD}{Colors.GREEN}✓ Test Completed Successfully: Order was completed!{Colors.ENDC}")
    else:
        print(f"\n{Colors.BOLD}{Colors.WARNING}⚠ Test Completed: Order is still in {final_status['status']} state{Colors.ENDC}")

if __name__ == "__main__":
    try:
        run_test()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Test interrupted by user{Colors.ENDC}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{Colors.FAIL}Unexpected error: {e}{Colors.ENDC}")
        sys.exit(1) 
