#!/usr/bin/env python3

import requests
import json
import time
import random
import uuid
import sys
import subprocess

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
    if not data or 'accessToken' not in data:
        print(f"{Colors.FAIL}Failed to get authentication tokens{Colors.ENDC}")
        sys.exit(1)
    
    # Extract tokens
    access_token = data['accessToken']
    user_id = data['user']['id']
    
    print(f"{Colors.GREEN}Successfully authenticated user: {phone_number}{Colors.ENDC}")
    print(f"{Colors.BLUE}User ID:{Colors.ENDC} {user_id}")
    
    return access_token, user_id

def create_order(access_token, user_id):
    """Create a new order"""
    print(f"\n{Colors.BOLD}Creating a new order for expiry test{Colors.ENDC}")
    
    # Random location in Bangalore
    lat = 12.9716 + random.uniform(-0.1, 0.1)
    lng = 77.5946 + random.uniform(-0.1, 0.1)
    
    order_data = {
        "amountNeeded": 100,
        "initialPledge": 25,
        "platform": "swiggy",
        "latitude": lat,
        "longitude": lng
    }
    
    response = requests.post(
        f"{BASE_URL}/orders/createOrder",
        json=order_data,
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    data = print_response(response, "Create Order Response")
    if not data or 'id' not in data:
        print(f"{Colors.FAIL}Failed to create order{Colors.ENDC}")
        sys.exit(1)
    
    order_id = data['id']
    print(f"{Colors.GREEN}Order created successfully:{Colors.ENDC}")
    print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {order_id}")
    print(f"{Colors.BLUE}Amount Needed:{Colors.ENDC} {data['amountNeeded']}")
    print(f"{Colors.BLUE}Initial Pledge:{Colors.ENDC} {data['totalPledge']}")
    print(f"{Colors.BLUE}Platform:{Colors.ENDC} {data['platform']}")
    
    return order_id, data

def check_redis_keys(order_id):
    """Check Redis keys for the order"""
    print(f"\n{Colors.BOLD}Checking Redis keys for order {order_id}{Colors.ENDC}")
    
    try:
        # Check order key TTL
        result = subprocess.run([
            'docker', 'exec', 'b0cd35dec18c', 'redis-cli', 
            'TTL', f'bundl:order:{order_id}'
        ], capture_output=True, text=True)
        order_ttl = result.stdout.strip()
        print(f"{Colors.BLUE}Order Key TTL:{Colors.ENDC} {order_ttl}")
        
        # Check if order exists in geo set
        result = subprocess.run([
            'docker', 'exec', 'b0cd35dec18c', 'redis-cli', 
            'ZRANGE', 'bundl:orders:geo', '0', '-1'
        ], capture_output=True, text=True)
        geo_entries = result.stdout.strip().split('\n') if result.stdout.strip() else []
        print(geo_entries)
        order_in_geo = f'order:{order_id}' in geo_entries
        print(f"{Colors.BLUE}Order in Geo Set:{Colors.ENDC} {order_in_geo}")
        
        # Check participants set TTL
        result = subprocess.run([
            'docker', 'exec', 'b0cd35dec18c', 'redis-cli', 
            'TTL', f'bundl:order:{order_id}:participants'
        ], capture_output=True, text=True)
        participants_ttl = result.stdout.strip()
        print(f"{Colors.BLUE}Participants TTL:{Colors.ENDC} {participants_ttl}")
        
        # Check keyspace notifications config
        result = subprocess.run([
            'docker', 'exec', 'b0cd35dec18c', 'redis-cli', 
            'CONFIG', 'GET', 'notify-keyspace-events'
        ], capture_output=True, text=True)
        keyspace_config = result.stdout.strip().split('\n')
        if len(keyspace_config) >= 2:
            print(f"{Colors.BLUE}Keyspace Events Config:{Colors.ENDC} {keyspace_config[1]}")
        
        return {
            'order_ttl': int(order_ttl) if order_ttl.lstrip('-').isdigit() else None,
            'order_in_geo': order_in_geo,
            'participants_ttl': int(participants_ttl) if participants_ttl.lstrip('-').isdigit() else None
        }
    except Exception as e:
        print(f"{Colors.FAIL}Error checking Redis: {e}{Colors.ENDC}")
        return None

def main():
    print(f"{Colors.BOLD}{Colors.HEADER}===== BUNDL ORDER EXPIRY TEST ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Testing order expiry mechanism (30 seconds){Colors.ENDC}")
    print(f"Testing against API at: {BASE_URL}")
    
    # Test phone numbers (random numbers for debug mode)
    def generate_random_phone():
        """Generate a random Indian phone number"""
        # Generate random 10-digit number avoiding common test patterns
        import random
        # Start with 9 and then 9 random digits to avoid conflicts
        return f"+919{random.randint(100000000, 999999999)}"

    TEST_PHONE_1 = generate_random_phone()  # User 1

    # Step 1: Authenticate user
    access_token, user_id = authenticate_user(TEST_PHONE_1)
    
    # Step 2: Create order that will expire
    order_id, order_data = create_order(access_token, user_id)
    
    # Step 3: Check initial Redis state
    print(f"\n{Colors.BOLD}Step 3: Check Initial Redis State{Colors.ENDC}")
    initial_state = check_redis_keys(order_id)
    
    # Step 4: Wait and monitor expiry
    print(f"\n{Colors.BOLD}Step 4: Monitor Order Expiry (30 seconds){Colors.ENDC}")
    print(f"{Colors.WARNING}Waiting for order to expire...{Colors.ENDC}")
    
    start_time = time.time()
    check_interval = 5  # Check every 5 seconds
    
    while time.time() - start_time < 40:  # Wait up to 40 seconds
        elapsed = int(time.time() - start_time)
        print(f"\n{Colors.BLUE}[{elapsed}s] Checking Redis state...{Colors.ENDC}")
        
        current_state = check_redis_keys(order_id)
        if current_state:
            if current_state['order_ttl'] == -2:  # Key doesn't exist (expired)
                print(f"{Colors.GREEN}✅ Order key has expired and been deleted!{Colors.ENDC}")
                break
            elif current_state['order_ttl'] and current_state['order_ttl'] > 0:
                print(f"{Colors.WARNING}Order expires in {current_state['order_ttl']} seconds{Colors.ENDC}")
        
        time.sleep(check_interval)
    
    # Step 5: Final state check
    print(f"\n{Colors.BOLD}Step 5: Final Redis State Check{Colors.ENDC}")
    final_state = check_redis_keys(order_id)
    
    # Step 6: Summary
    print(f"\n{Colors.BOLD}{Colors.HEADER}===== EXPIRY TEST SUMMARY ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {order_id}")
    
    if final_state:
        if final_state['order_ttl'] == -2:
            print(f"{Colors.GREEN}✅ Order Key:{Colors.ENDC} Properly expired and deleted")
        else:
            print(f"{Colors.FAIL}❌ Order Key:{Colors.ENDC} Still exists (TTL: {final_state['order_ttl']})")
        
        if not final_state['order_in_geo']:
            print(f"{Colors.GREEN}✅ Geo Set:{Colors.ENDC} Order properly removed from geo set")
        else:
            print(f"{Colors.FAIL}❌ Geo Set:{Colors.ENDC} Order still in geo set")
        
        if final_state['participants_ttl'] == -2:
            print(f"{Colors.GREEN}✅ Participants:{Colors.ENDC} Properly cleaned up")
        else:
            print(f"{Colors.WARNING}⚠️  Participants:{Colors.ENDC} TTL: {final_state['participants_ttl']}s")
    
    print(f"\n{Colors.GREEN}Test completed!{Colors.ENDC}")

if __name__ == "__main__":
    main()
