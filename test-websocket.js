const WebSocket = require('ws');

// Test script to verify WebSocket chat functionality
const testWebSocket = () => {
  // Test JWT token (this is a mock - in real use you'd get this from auth)
  const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0LXVzZXItMTIzIiwiaWF0IjoxNTE2MjM5MDIyfQ.mock-signature';
  
  console.log('🔌 Connecting to WebSocket server...');
  
  // Connect to WebSocket with JWT token
  const ws = new WebSocket('ws://localhost:3002/chat', {
    headers: {
      'Authorization': `Bearer ${mockJwt}`
    }
  });

  ws.on('open', () => {
    console.log('✅ Connected to WebSocket server');
    
    // Test joining an order
    console.log('📝 Joining order test-order-123...');
    ws.send(JSON.stringify({
      event: 'join_order',
      data: {
        orderId: 'test-order-123'
      }
    }));

    // Wait a bit then send a message
    setTimeout(() => {
      console.log('💬 Sending test message...');
      ws.send(JSON.stringify({
        event: 'send_message',
        data: {
          orderId: 'test-order-123',
          message: 'Hello from test script! This is a test message to verify the atomic Redis operations.'
        }
      }));
    }, 1000);

    // Close connection after 3 seconds
    setTimeout(() => {
      console.log('👋 Closing connection...');
      ws.close();
    }, 3000);
  });

  ws.on('message', (data) => {
    console.log('📨 Received:', JSON.parse(data.toString()));
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  ws.on('close', () => {
    console.log('🔌 Connection closed');
  });
};

console.log('🧪 Starting WebSocket test...');
testWebSocket();
