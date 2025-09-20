#!/usr/bin/env python3
"""
Redis Keyspace Events Monitor
Monitors Redis keyspace events to see if expiry events are being triggered
"""

import subprocess
import time
import sys
from datetime import datetime

class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def monitor_keyspace_events():
    """Monitor Redis keyspace events in real-time"""
    print(f"{Colors.HEADER}===== REDIS KEYSPACE EVENTS MONITOR ====={Colors.ENDC}")
    print(f"{Colors.CYAN}Monitoring: __keyevent@0__:expired{Colors.ENDC}")
    print(f"{Colors.CYAN}Looking for: bundl:order:* keys{Colors.ENDC}")
    print(f"{Colors.WARNING}Press Ctrl+C to stop monitoring{Colors.ENDC}\n")
    
    try:
        # Start Redis subscriber to monitor keyspace events
        process = subprocess.Popen([
            'docker', 'exec', '-i', 'b0cd35dec18c', 'redis-cli', 
            'PSUBSCRIBE', '__keyevent@0__:expired'
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)
        
        print(f"{Colors.GREEN}✅ Started monitoring keyspace events...{Colors.ENDC}")
        print(f"{Colors.BLUE}Waiting for expiry events...{Colors.ENDC}\n")
        
        for line in process.stdout:
            line = line.strip()
            if not line:
                continue
                
            timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            
            if line.startswith('pmessage'):
                # Parse the pmessage format: pmessage pattern channel message
                parts = line.split(' ', 3)
                if len(parts) >= 4:
                    pattern = parts[1]
                    channel = parts[2] 
                    message = parts[3]
                    
                    print(f"{Colors.CYAN}[{timestamp}] Keyspace Event:{Colors.ENDC}")
                    print(f"  Pattern: {pattern}")
                    print(f"  Channel: {channel}")
                    print(f"  Key: {message}")
                    
                    if message.startswith('bundl:order:'):
                        print(f"{Colors.GREEN}  🎯 BUNDL ORDER EXPIRED: {message}{Colors.ENDC}")
                        order_id = message.split(':')[2] if len(message.split(':')) >= 3 else 'unknown'
                        print(f"  📋 Order ID: {order_id}")
                        
                        # Check if order is still in geo set
                        result = subprocess.run([
                            'docker', 'exec', 'b0cd35dec18c', 'redis-cli', 
                            'ZRANGE', 'bundl:orders:geo', '0', '-1'
                        ], capture_output=True, text=True)
                        geo_entries = result.stdout.strip().split('\n') if result.stdout.strip() else []
                        still_in_geo = f'bundl:order:{order_id}' in geo_entries
                        
                        if still_in_geo:
                            print(f"  {Colors.FAIL}❌ Still in geo set after expiry!{Colors.ENDC}")
                        else:
                            print(f"  {Colors.GREEN}✅ Properly removed from geo set{Colors.ENDC}")
                    else:
                        print(f"  🔍 Other key expired: {message}")
                    print()
            else:
                # Other Redis subscription messages
                if 'psubscribe' in line:
                    print(f"{Colors.BLUE}[{timestamp}] Subscription: {line}{Colors.ENDC}")
                else:
                    print(f"{Colors.WARNING}[{timestamp}] Other: {line}{Colors.ENDC}")
                    
    except KeyboardInterrupt:
        print(f"\n{Colors.WARNING}Stopping monitor...{Colors.ENDC}")
        if process:
            process.terminate()
    except Exception as e:
        print(f"{Colors.FAIL}Error monitoring keyspace events: {e}{Colors.ENDC}")
        if process:
            process.terminate()

if __name__ == "__main__":
    monitor_keyspace_events()