#!/usr/bin/env python3

import requests
import json
import time
import random
import uuid
import sys

# API Base URL
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

    if response.status_code != 204:
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
    
    try:
        # Step 1: Send OTP
        response = requests.post(
            f"{BASE_URL}/auth/sendOtp",
            json={"phoneNumber": phone_number}
        )
        
        data = print_response(response, "Send OTP Response")
        if not data or 'tid' not in data:
            print(f"{Colors.FAIL}Failed to get transaction ID{Colors.ENDC}")
            sys.exit(1)
        
        tid = data['tid']
        
        # Step 2: Verify OTP (debug mode)
        fcm_token = f"fcm-test-{uuid.uuid4()}"
        response = requests.post(
            f"{BASE_URL}/auth/verifyOtp",
            json={
                "tid": tid,
                "otp": "000000",  # Debug mode OTP
                "fcmToken": fcm_token
            }
        )
        
        data = print_response(response, "Verify OTP Response")
        if not data or 'accessToken' not in data:
            print(f"{Colors.FAIL}Failed to get authentication tokens{Colors.ENDC}")
            sys.exit(1)
        
        return data['accessToken'], data['user']['id']
        
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def create_order(access_token, amount_needed=200):
    """Create a new order"""
    print(f"\n{Colors.BOLD}Creating a new order{Colors.ENDC}")
    
    # Random location in Bangalore
    lat = 12.9716 + random.uniform(-0.01, 0.01)
    lng = 77.5946 + random.uniform(-0.01, 0.01)
    
    # Make initial pledge less than the amount needed to test pledging
    initial_pledge = amount_needed // 2
    
    order_payload = {
        "platform": "zomato",
        "amountNeeded": amount_needed,
        "latitude": lat,
        "longitude": lng,
        "initialPledge": initial_pledge,
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
        print(f"{Colors.BLUE}Initial Pledge:{Colors.ENDC} {data['totalPledge']}")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def pledge_to_order(access_token, order_id, pledge_amount):
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
        
        # Check if order is now completed
        if data.get('status') == 'COMPLETED':
            print(f"{Colors.GREEN}Order is now COMPLETED!{Colors.ENDC}")
            
            # Check for phoneNumberMap
            if 'phoneNumberMap' in data:
                print(f"{Colors.GREEN}phoneNumberMap is present!{Colors.ENDC}")
                print(f"{Colors.BLUE}phoneNumberMap:{Colors.ENDC}")
                print(json.dumps(data['phoneNumberMap'], indent=2))
            else:
                print(f"{Colors.FAIL}phoneNumberMap is MISSING!{Colors.ENDC}")
            
            # Check for note
            if 'note' in data:
                print(f"{Colors.GREEN}note is present!{Colors.ENDC}")
                print(f"{Colors.BLUE}Note:{Colors.ENDC} {data['note']}")
            else:
                print(f"{Colors.FAIL}note is MISSING!{Colors.ENDC}")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def get_order_status(access_token, order_id):
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
        
        # Check for phoneNumberMap in completed order
        if data.get('status') == 'COMPLETED':
            if 'phoneNumberMap' in data:
                print(f"{Colors.GREEN}phoneNumberMap is present in orderStatus!{Colors.ENDC}")
                print(f"{Colors.BLUE}phoneNumberMap:{Colors.ENDC}")
                print(json.dumps(data['phoneNumberMap'], indent=2))
            else:
                print(f"{Colors.FAIL}phoneNumberMap is MISSING in orderStatus!{Colors.ENDC}")
            
            if 'note' in data:
                print(f"{Colors.GREEN}note is present in orderStatus!{Colors.ENDC}")
                print(f"{Colors.BLUE}Note:{Colors.ENDC} {data['note']}")
            else:
                print(f"{Colors.FAIL}note is MISSING in orderStatus!{Colors.ENDC}")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def main():
    # Generate two random phone numbers
    creator_phone = f"+91{random.randint(7000000000, 9999999999)}"
    pledger_phone = f"+91{random.randint(7000000000, 9999999999)}"
    
    print(f"{Colors.BOLD}Creator phone:{Colors.ENDC} {creator_phone}")
    print(f"{Colors.BOLD}Pledger phone:{Colors.ENDC} {pledger_phone}")
    
    # Authenticate both users
    print("\n=== Authenticating Creator ===")
    creator_token, creator_id = authenticate_user(creator_phone)
    
    print("\n=== Authenticating Pledger ===")
    pledger_token, pledger_id = authenticate_user(pledger_phone)
    
    # Create an order with creator (half of amount needed)
    amount_needed = 200
    initial_pledge = 100
    order = create_order(creator_token, amount_needed)
    order_id = order['id']
    
    # Add pledger to complete the order
    remaining_amount = amount_needed - initial_pledge
    pledge_response = pledge_to_order(pledger_token, order_id, remaining_amount)
    
    # Check order status from both perspectives
    print("\n=== Checking Order Status from Creator's Perspective ===")
    creator_view = get_order_status(creator_token, order_id)
    
    print("\n=== Checking Order Status from Pledger's Perspective ===")
    pledger_view = get_order_status(pledger_token, order_id)
    
    print("\n=== Test Complete ===")

if __name__ == "__main__":
    main() 