#!/usr/bin/env python3

import requests
import json
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

def generate_random_phone():
    """Generate a random Indian phone number"""
    import random
    return f"+919{random.randint(100000000, 999999999)}"

def authenticate_user(phone_number):
    """Authenticate user and return access token and user info"""
    try:
        # Step 1: Send OTP
        response = requests.post(
            f"{BASE_URL}/auth/sendOtp",
            json={"phoneNumber": phone_number}
        )
        
        if response.status_code != 200:
            print(f"{Colors.FAIL}Failed to send OTP: {response.status_code}{Colors.ENDC}")
            return None
        
        data = response.json()
        tid = data['tid']
        
        # Step 2: Verify OTP (any OTP works in debug mode)
        import uuid
        fcm_token = f"fcm-test-{uuid.uuid4()}"
        
        response = requests.post(
            f"{BASE_URL}/auth/verifyOtp",
            json={
                "tid": tid,
                "otp": "000000",  # Any OTP works in debug mode
                "fcmToken": fcm_token
            }
        )
        
        if response.status_code != 200:
            print(f"{Colors.FAIL}Failed to verify OTP: {response.status_code}{Colors.ENDC}")
            return None
        
        data = response.json()
        return {
            'token': data['accessToken'],
            'userId': data['user']['id'],
            'phone': phone_number
        }
        
    except Exception as e:
        print(f"{Colors.FAIL}Auth error: {e}{Colors.ENDC}")
        return None

def create_order_with_participants():
    """Create an order and add participants, return order info"""
    print(f"{Colors.HEADER}Creating order with participants for testing...{Colors.ENDC}")
    
    # Authenticate first user (creator)
    phone1 = generate_random_phone()
    user1 = authenticate_user(phone1)
    if not user1:
        return None
    
    print(f"{Colors.GREEN}✅ User 1 authenticated: {user1['userId'][:8]}...{Colors.ENDC}")
    
    # Create order
    import random
    lat = 12.9716 + random.uniform(-0.1, 0.1)
    lng = 77.5946 + random.uniform(-0.1, 0.1)
    
    order_payload = {
        "platform": "zomato",
        "amountNeeded": 150,
        "latitude": lat,
        "longitude": lng,
        "initialPledge": 50,
        "expirySeconds": 3600  # 1 hour
    }
    
    response = requests.post(
        f"{BASE_URL}/orders/createOrder",
        json=order_payload,
        headers={"Authorization": f"Bearer {user1['token']}"}
    )
    
    if response.status_code != 201:
        print(f"{Colors.FAIL}Failed to create order: {response.status_code}{Colors.ENDC}")
        return None
    
    order = response.json()
    order_id = order['id']
    
    print(f"{Colors.GREEN}✅ Order created: {order_id}{Colors.ENDC}")
    
    # Authenticate second user (participant)
    phone2 = generate_random_phone()
    user2 = authenticate_user(phone2)
    if not user2:
        print(f"{Colors.WARNING}⚠ Could not add second participant, but order is still usable{Colors.ENDC}")
        return {
            'orderId': order_id,
            'users': [user1],
            'status': 'ACTIVE'
        }
    
    print(f"{Colors.GREEN}✅ User 2 authenticated: {user2['userId'][:8]}...{Colors.ENDC}")
    
    # Add second participant
    response = requests.post(
        f"{BASE_URL}/orders/pledgeToOrder",
        json={
            "orderId": order_id,
            "pledgeAmount": 50
        },
        headers={"Authorization": f"Bearer {user2['token']}"}
    )
    
    if response.status_code != 200:
        print(f"{Colors.WARNING}⚠ Could not add second participant, but order is still usable{Colors.ENDC}")
        return {
            'orderId': order_id,
            'users': [user1],
            'status': 'ACTIVE'
        }
    
    print(f"{Colors.GREEN}✅ User 2 added as participant{Colors.ENDC}")
    
    return {
        'orderId': order_id,
        'users': [user1, user2],
        'status': 'ACTIVE'
    }

def main():
    print(f"{Colors.BOLD}{Colors.HEADER}===== BUNDL CHAT TEST HELPER ====={Colors.ENDC}")
    print(f"{Colors.BLUE}This script creates an order with participants for chat testing{Colors.ENDC}")
    print()
    
    # Create order with participants
    order_info = create_order_with_participants()
    if not order_info:
        print(f"{Colors.FAIL}❌ Failed to create test order{Colors.ENDC}")
        sys.exit(1)
    
    print(f"\n{Colors.BOLD}{Colors.GREEN}🎉 SUCCESS! Test order created:{Colors.ENDC}")
    print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {order_info['orderId']}")
    print(f"{Colors.BLUE}Status:{Colors.ENDC} {order_info['status']}")
    print(f"{Colors.BLUE}Participants:{Colors.ENDC} {len(order_info['users'])}")
    
    print(f"\n{Colors.BOLD}💡 HOW TO TEST:{Colors.ENDC}")
    print(f"{Colors.BLUE}1. Open the chat test page:{Colors.ENDC} http://localhost:3002/chat-test.html")
    print(f"{Colors.BLUE}2. Use any of these JWT tokens:{Colors.ENDC}")
    
    for i, user in enumerate(order_info['users'], 1):
        print(f"   {Colors.GREEN}User {i}:{Colors.ENDC} {user['token']}")
        print(f"   {Colors.BLUE}User ID:{Colors.ENDC} {user['userId']}")
        print(f"   {Colors.BLUE}Phone:{Colors.ENDC} {user['phone']}")
        print()
    
    print(f"{Colors.BLUE}3. Connect with the JWT token")
    print(f"4. Join order with ID:{Colors.ENDC} {Colors.BOLD}{order_info['orderId']}{Colors.ENDC}")
    print(f"{Colors.BLUE}5. You should see debug participant info!{Colors.ENDC}")
    
    print(f"\n{Colors.WARNING}⚠ Note: This order will expire in 1 hour{Colors.ENDC}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Test interrupted by user{Colors.ENDC}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{Colors.FAIL}Unexpected error: {e}{Colors.ENDC}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
