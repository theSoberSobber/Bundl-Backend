#!/usr/bin/env python3

import requests
import json
import time
import random
import uuid
import sys
import websocket
import threading

# API Base URL
BASE_URL = "http://localhost:3002"
WS_URL = "ws://localhost:3002/chat"

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

# Test phone numbers (random numbers for debug mode)
def generate_random_phone():
    """Generate a random Indian phone number"""
    # Generate random 10-digit number avoiding common test patterns
    import random
    # Start with 9 and then 9 random digits to avoid conflicts
    return f"+919{random.randint(100000000, 999999999)}"

TEST_PHONE_1 = generate_random_phone()  # User 1
TEST_PHONE_2 = generate_random_phone()  # User 2

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
        print(f"{Colors.BLUE}Access Token:{Colors.ENDC} {access_token[:20]}...")
        
        return access_token, refresh_token, user_id
        
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def create_order(access_token, user_id):
    """Create a new order for chat testing"""
    print(f"\n{Colors.BOLD}Creating a new order for chat testing{Colors.ENDC}")
    
    # Random location in Bangalore
    lat = 12.9716 + random.uniform(-0.1, 0.1)
    lng = 77.5946 + random.uniform(-0.1, 0.1)
    
    order_payload = {
        "platform": "zomato",
        "amountNeeded": 150,  # Need ₹150 total
        "latitude": lat,
        "longitude": lng,
        "initialPledge": 50,  # Initial pledge of ₹50
        "expirySeconds": 3600  # 1 hour for chat testing
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
        
        print(f"{Colors.GREEN}Order created successfully for chat testing:{Colors.ENDC}")
        print(f"{Colors.BLUE}Order ID:{Colors.ENDC} {data['id']}")
        print(f"{Colors.BLUE}Creator User ID:{Colors.ENDC} {user_id}")
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def pledge_to_order(access_token, order_id, user_id, pledge_amount=50):
    """Add another user as participant by pledging"""
    print(f"\n{Colors.BOLD}Adding user {user_id} as participant by pledging ₹{pledge_amount}{Colors.ENDC}")
    
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
        
        print(f"{Colors.GREEN}Successfully added user {user_id} as participant{Colors.ENDC}")
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def get_order_status(access_token, order_id, user_id):
    """Get current order status"""
    print(f"\n{Colors.BOLD}Getting order status for {order_id}{Colors.ENDC}")
    
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
        
        return data
    
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        sys.exit(1)

def complete_order(access_token, order_id, user_id, current_total, amount_needed):
    """Complete the order by pledging remaining amount"""
    remaining_amount = amount_needed - current_total
    if remaining_amount <= 0:
        print(f"{Colors.GREEN}Order already complete!{Colors.ENDC}")
        return current_total
    
    print(f"\n{Colors.BOLD}Completing order by pledging remaining ₹{remaining_amount}{Colors.ENDC}")
    return pledge_to_order(access_token, order_id, user_id, remaining_amount)

class ChatClient:
    def __init__(self, user_id, access_token, name):
        self.user_id = user_id
        self.access_token = access_token
        self.name = name
        self.ws = None
        self.messages_received = []
        self.connected = False
        
    def on_message(self, ws, message):
        data = json.loads(message)
        self.messages_received.append(data)
        
        print(f"\n{Colors.BLUE}[{self.name}] Received:{Colors.ENDC}")
        print(json.dumps(data, indent=2))
        
        # Look for debug info
        if 'debug' in data:
            print(f"{Colors.GREEN}🐛 DEBUG INFO FOUND for {self.name}!{Colors.ENDC}")
            debug = data['debug']
            print(f"   Participants: {debug.get('participants', [])}")
            print(f"   Count: {debug.get('participantCount', 0)}")
            print(f"   TTL: {debug.get('ttlSeconds', 0)}s")
        
    def on_error(self, ws, error):
        print(f"{Colors.FAIL}[{self.name}] WebSocket error: {error}{Colors.ENDC}")
        
    def on_close(self, ws, close_status_code, close_msg):
        print(f"{Colors.WARNING}[{self.name}] Connection closed{Colors.ENDC}")
        self.connected = False
        
    def on_open(self, ws):
        print(f"{Colors.GREEN}[{self.name}] Connected to WebSocket{Colors.ENDC}")
        self.connected = True
        
    def connect(self):
        headers = {
            "Authorization": f"Bearer {self.access_token}"
        }
        self.ws = websocket.WebSocketApp(
            WS_URL,
            header=headers,
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        
        # Run WebSocket in a thread
        def run_ws():
            self.ws.run_forever()
            
        ws_thread = threading.Thread(target=run_ws)
        ws_thread.daemon = True
        ws_thread.start()
        
        # Wait for connection
        time.sleep(2)
        return self.connected
        
    def join_order(self, order_id):
        if not self.ws or not self.connected:
            print(f"{Colors.FAIL}[{self.name}] Not connected{Colors.ENDC}")
            return
            
        message = {
            "event": "join_order",
            "data": {
                "orderId": order_id
            }
        }
        
        print(f"{Colors.BLUE}[{self.name}] Joining order {order_id}{Colors.ENDC}")
        self.ws.send(json.dumps(message))
        
    def send_message(self, order_id, text):
        if not self.ws or not self.connected:
            print(f"{Colors.FAIL}[{self.name}] Not connected{Colors.ENDC}")
            return
            
        message = {
            "event": "send_message",
            "data": {
                "orderId": order_id,
                "message": text
            }
        }
        
        print(f"{Colors.BLUE}[{self.name}] Sending: {text}{Colors.ENDC}")
        self.ws.send(json.dumps(message))
        
    def disconnect(self):
        if self.ws:
            self.ws.close()

def run_chat_test():
    """Run the full chat test flow"""
    print(f"\n{Colors.BOLD}{Colors.HEADER}===== BUNDL CHAT FUNCTIONALITY TEST ====={Colors.ENDC}")
    print(f"{Colors.BLUE}Testing against API at:{Colors.ENDC} {BASE_URL}")
    print(f"{Colors.BLUE}WebSocket endpoint:{Colors.ENDC} {WS_URL}")
    print(f"{Colors.BLUE}Debug mode should be enabled in .env with DEBUG_ENABLED=true{Colors.ENDC}")
    print(f"{Colors.BLUE}Random phone numbers:{Colors.ENDC} {TEST_PHONE_1}, {TEST_PHONE_2}")
    
    # Step 1: Authenticate users
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 1: Authenticate Users{Colors.ENDC}")
    user1_token, _, user1_id = authenticate_user(TEST_PHONE_1)
    user2_token, _, user2_id = authenticate_user(TEST_PHONE_2)
    
    # Step 2: Create an order (user1 becomes participant)
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 2: Create Order{Colors.ENDC}")
    order = create_order(user1_token, user1_id)
    order_id = order['id']
    
    # Step 3: Add user2 as participant by pledging
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 3: Add Second Participant{Colors.ENDC}")
    pledge_to_order(user2_token, order_id, user2_id, 50)
    
    # Step 4: Test chat while order is ACTIVE
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 4: Test Chat (Order ACTIVE){Colors.ENDC}")
    test_chat_functionality(user1_token, user1_id, user2_token, user2_id, order_id, "ACTIVE")
    
    # Step 5: Complete the order
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 5: Complete Order{Colors.ENDC}")
    order_status = get_order_status(user1_token, order_id, user1_id)
    complete_order(user1_token, order_id, user1_id, order_status['totalPledge'], order_status['amountNeeded'])
    
    # Step 6: Verify order is completed
    print(f"\n{Colors.BOLD}{Colors.HEADER}Step 6: Verify Order Completion{Colors.ENDC}")
    final_status = get_order_status(user1_token, order_id, user1_id)
    
    if final_status['status'] == 'COMPLETED':
        print(f"{Colors.GREEN}✅ Order successfully completed!{Colors.ENDC}")
        
        # Step 7: Test chat after completion (5-minute grace period)
        print(f"\n{Colors.BOLD}{Colors.HEADER}Step 7: Test Chat After Completion (Grace Period){Colors.ENDC}")
        print(f"{Colors.BLUE}Note: Participants should still be able to chat for 5 minutes after completion{Colors.ENDC}")
        test_chat_functionality(user1_token, user1_id, user2_token, user2_id, order_id, "COMPLETED")
    else:
        print(f"{Colors.WARNING}⚠ Order not completed, status: {final_status['status']}{Colors.ENDC}")
    
    print(f"\n{Colors.BOLD}{Colors.GREEN}✓ Full chat lifecycle test completed!{Colors.ENDC}")

def test_chat_functionality(user1_token, user1_id, user2_token, user2_id, order_id, order_status):
    """Test chat functionality for a given order status"""
    # Setup WebSocket clients
    client1 = ChatClient(user1_id, user1_token, f"User1({order_status})")
    client2 = ChatClient(user2_id, user2_token, f"User2({order_status})")
    
    # Connect to WebSocket
    print(f"{Colors.BLUE}Connecting to WebSocket for {order_status} order...{Colors.ENDC}")
    if not client1.connect():
        print(f"{Colors.FAIL}Failed to connect User1 for {order_status} order{Colors.ENDC}")
        return
        
    if not client2.connect():
        print(f"{Colors.FAIL}Failed to connect User2 for {order_status} order{Colors.ENDC}")
        return
    
    time.sleep(1)
    
    # Join order chat rooms
    print(f"{Colors.BLUE}Joining order chat for {order_status} order...{Colors.ENDC}")
    client1.join_order(order_id)
    time.sleep(1)
    client2.join_order(order_id)
    time.sleep(2)
    
    # Send messages
    print(f"{Colors.BLUE}Testing message exchange for {order_status} order...{Colors.ENDC}")
    client1.send_message(order_id, f"Testing chat in {order_status} state!")
    time.sleep(1)
    client2.send_message(order_id, f"Received! Chat works in {order_status} state.")
    time.sleep(2)
    
    # Check for debug info
    debug_found = False
    for client in [client1, client2]:
        for msg in client.messages_received:
            if 'debug' in msg:
                debug_found = True
                break
    
    print(f"{Colors.BLUE}Results for {order_status} order:{Colors.ENDC}")
    print(f"  User1 Messages: {len(client1.messages_received)}")
    print(f"  User2 Messages: {len(client2.messages_received)}")
    print(f"  Debug Info: {'✅ Found' if debug_found else '❌ Not found'}")
    
    # Cleanup
    client1.disconnect()
    client2.disconnect()
    time.sleep(1)

if __name__ == "__main__":
    try:
        run_chat_test()
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Test interrupted by user{Colors.ENDC}")
        sys.exit(0)
    except Exception as e:
        print(f"\n{Colors.FAIL}Unexpected error: {e}{Colors.ENDC}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
