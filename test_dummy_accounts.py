#!/usr/bin/env python3
"""
Test script to verify dummy account functionality for Google Play Store closed testing.
This tests that phone numbers with 10 consecutive 9's bypass OTP verification.
"""

import requests
import json

# Update this to match your local development server
BASE_URL = "http://localhost:3000"

def test_dummy_account():
    """Test that dummy accounts (9999999999) bypass OTP verification."""
    
    dummy_phone_numbers = [
        "9999999999",          # Basic 10 nines
        "+919999999999",       # With +91 country code
        "919999999999",        # With 91 country code  
        "0919999999999",       # With 091 prefix
        "+91-9999-999-999",    # Formatted with +91
        "+91 9999 999 999",    # Spaced format with +91
        "91 9999999999"        # Spaced format with 91
    ]
    
    for phone_number in dummy_phone_numbers:
        print(f"\n=== Testing dummy account: {phone_number} ===")
        
        # Step 1: Send OTP
        try:
            send_otp_response = requests.post(
                f"{BASE_URL}/auth/sendOtp",
                json={"phoneNumber": phone_number},
                headers={"Content-Type": "application/json"}
            )
            
            if send_otp_response.status_code == 200:
                data = send_otp_response.json()
                tid = data.get("tid")
                print(f"✅ Send OTP successful - TID: {tid}")
                
                # Step 2: Verify OTP with any dummy OTP (should work for dummy accounts)
                verify_otp_response = requests.post(
                    f"{BASE_URL}/auth/verifyOtp",
                    json={"tid": tid, "otp": "123456"},  # Any OTP should work for dummy accounts
                    headers={"Content-Type": "application/json"}
                )
                
                if verify_otp_response.status_code == 200:
                    user_data = verify_otp_response.json()
                    print(f"✅ OTP verification successful for dummy account")
                    print(f"   User ID: {user_data.get('user', {}).get('id')}")
                    print(f"   Phone: {user_data.get('user', {}).get('phoneNumber')}")
                else:
                    print(f"❌ OTP verification failed: {verify_otp_response.status_code}")
                    print(f"   Response: {verify_otp_response.text}")
            else:
                print(f"❌ Send OTP failed: {send_otp_response.status_code}")
                print(f"   Response: {send_otp_response.text}")
                
        except requests.exceptions.ConnectionError:
            print(f"❌ Could not connect to {BASE_URL}. Make sure the server is running.")
            return
        except Exception as e:
            print(f"❌ Error: {e}")

def test_regular_account():
    """Test that regular accounts still require proper OTP verification."""
    
    regular_phone = "9876543210"  # Not all 9's
    
    print(f"\n=== Testing regular account: {regular_phone} ===")
    
    try:
        # Step 1: Send OTP
        send_otp_response = requests.post(
            f"{BASE_URL}/auth/sendOtp",
            json={"phoneNumber": regular_phone},
            headers={"Content-Type": "application/json"}
        )
        
        if send_otp_response.status_code == 200:
            data = send_otp_response.json()
            tid = data.get("tid")
            print(f"✅ Send OTP successful - TID: {tid}")
            
            # Step 2: Try to verify with wrong OTP (should fail for regular accounts)
            verify_otp_response = requests.post(
                f"{BASE_URL}/auth/verifyOtp",
                json={"tid": tid, "otp": "123456"},
                headers={"Content-Type": "application/json"}
            )
            
            if verify_otp_response.status_code != 200:
                print(f"✅ OTP verification correctly failed for regular account (as expected)")
                print(f"   Status: {verify_otp_response.status_code}")
            else:
                print(f"❌ OTP verification should have failed for regular account")
                print(f"   This might indicate debug mode is enabled")
        else:
            print(f"❌ Send OTP failed: {send_otp_response.status_code}")
            print(f"   Response: {send_otp_response.text}")
            
    except requests.exceptions.ConnectionError:
        print(f"❌ Could not connect to {BASE_URL}. Make sure the server is running.")
        return
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🧪 Testing Dummy Account Functionality for Google Play Store Closed Testing")
    print("=" * 80)
    
    test_dummy_account()
    test_regular_account()
    
    print("\n" + "=" * 80)
    print("🏁 Test completed!")
    print("\nExpected behavior:")
    print("- Dummy accounts (9999999999) should bypass OTP verification")
    print("- Regular accounts should still require proper OTP verification")
    print("- Console should show '[DUMMY ACCOUNT]' logs for dummy phone numbers")
