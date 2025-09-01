#!/usr/bin/env python3

import requests
import json
import time
import random
import uuid
import sys
from math import cos, pi

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

def get_current_location():
    """Get current location using IP geolocation"""
    try:
        # Using ipapi.co for geolocation
        response = requests.get('https://ipapi.co/json/')
        data = response.json()
        
        if 'latitude' in data and 'longitude' in data:
            return data['latitude'], data['longitude']
        
        # Fallback to Bangalore coordinates if geolocation fails
        return 12.9716, 77.5946
        
    except Exception as e:
        print(f"{Colors.WARNING}Failed to get location, using Bangalore coordinates: {e}{Colors.ENDC}")
        return 12.9716, 77.5946  # Bangalore coordinates as fallback

def generate_random_location(base_lat, base_lng, radius_km=5):
    """Generate a random location within radius_km of the base location"""
    # Earth's radius in kilometers
    R = 6371
    
    # Convert radius from km to degrees
    # The conversion is different for latitude and longitude
    # For longitude, need to account for the cosine of the latitude
    radius_lat = (radius_km / R) * (180 / pi)
    radius_lng = (radius_km / R) * (180 / pi) / cos(base_lat * pi / 180)
    
    # Generate random offsets
    lat_offset = random.uniform(-radius_lat, radius_lat)
    lng_offset = random.uniform(-radius_lng, radius_lng)
    
    return base_lat + lat_offset, base_lng + lng_offset

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

def create_order(access_token, lat, lng, platform):
    """Create a new order at the specified location"""
    print(f"\n{Colors.BOLD}Creating order at ({lat:.4f}, {lng:.4f}){Colors.ENDC}")
    
    # Random amount between 100 and 500
    amount_needed = random.randint(100, 500)
    initial_pledge = round(amount_needed * random.uniform(0.2, 0.4))  # 20-40% of amount needed
    
    order_payload = {
        "platform": platform,
        "amountNeeded": amount_needed,
        "latitude": lat,
        "longitude": lng,
        "initialPledge": initial_pledge,
        "expirySeconds": 600  # 10 minutes
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/orders/createOrder",
            json=order_payload,
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        data = print_response(response, "Create Order Response")
        if response.status_code != 201 or not data:
            print(f"{Colors.FAIL}Failed to create order{Colors.ENDC}")
            return False
            
        print(f"{Colors.GREEN}Created order: ₹{amount_needed} needed, ₹{initial_pledge} pledged{Colors.ENDC}")
        return True
        
    except requests.RequestException as e:
        print(f"{Colors.FAIL}Network error: {e}{Colors.ENDC}")
        return False

def get_credit_balance(access_token):
    """Get user's credit balance"""
    try:
        response = requests.get(
            f"{BASE_URL}/credits/balance",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        
        data = print_response(response, "Credit Balance Response")
        if data and 'credits' in data:
            return data['credits']
        return 0
        
    except requests.RequestException:
        return 0

def main():
    # Get current location
    base_lat, base_lng = get_current_location()
    print(f"{Colors.GREEN}Current location: ({base_lat:.4f}, {base_lng:.4f}){Colors.ENDC}")
    
    # Generate a random phone number
    phone = f"+91{random.randint(7000000000, 9999999999)}"
    
    # Authenticate
    access_token, user_id = authenticate_user(phone)
    
    # Get credit balance
    credits = get_credit_balance(access_token)
    print(f"{Colors.GREEN}Available credits: {credits}{Colors.ENDC}")
    
    # Platforms to cycle through
    platforms = ['zomato', 'swiggy', 'blinkit', 'zepto']
    
    # Create orders until we run out of credits
    orders_created = 0
    while orders_created < credits:
        # Generate random location within 5km
        lat, lng = generate_random_location(base_lat, base_lng)
        
        # Select random platform
        platform = random.choice(platforms)
        
        # Create order
        if create_order(access_token, lat, lng, platform):
            orders_created += 1
            print(f"{Colors.GREEN}Created {orders_created} of {credits} orders{Colors.ENDC}")
            
            # Small delay between orders
            time.sleep(1)
    
    print(f"\n{Colors.GREEN}Successfully created {orders_created} orders around ({base_lat:.4f}, {base_lng:.4f}){Colors.ENDC}")

if __name__ == "__main__":
    main()
