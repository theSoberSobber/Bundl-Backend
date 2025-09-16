const Redis = require('ioredis');

// Setup test data in Redis and then test WebSocket
async function setupTestData() {
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    keyPrefix: 'bundl:',
  });

  const orderId = 'test-order-123';
  const testUserId = 'test-user-123';
  
  console.log('🔧 Setting up test data in Redis...');
  
  // Add test user as participant in the order (with 1 hour TTL)
  const participantsKey = `order:${orderId}:participants`;
  await redis.sadd(participantsKey, testUserId);
  await redis.expire(participantsKey, 3600); // 1 hour
  
  console.log(`✅ Added ${testUserId} as participant in ${orderId}`);
  
  // Verify the data was added
  const members = await redis.smembers(participantsKey);
  const ttl = await redis.ttl(participantsKey);
  console.log(`🔍 Current participants: [${members.join(', ')}], TTL: ${ttl}s`);
  
  await redis.disconnect();
  console.log('🎯 Test data setup complete! Now testing WebSocket...\n');
}

// Test WebSocket connection
function testWebSocket() {
  const WebSocket = require('ws');
  
  // Create a simple JWT token for test-user-123
  const jwt = require('jsonwebtoken');
  const mockJwt = jwt.sign(
    { userId: 'test-user-123' }, 
    'supersecretkey', // matches JWT_SECRET in .env
    { expiresIn: '1h' }
  );
  
  console.log('🔌 Connecting to WebSocket server...');
  
  const ws = new WebSocket('ws://localhost:3002/chat', {
    headers: {
      'Authorization': `Bearer ${mockJwt}`
    }
  });

  ws.on('open', () => {
    console.log('✅ Connected to WebSocket server');
    
    // Test joining an order where user is a participant
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
          message: 'Hello! This should trigger debug participant info because DEBUG_ENABLED=true'
        }
      }));
    }, 1000);

    // Close connection after 5 seconds
    setTimeout(() => {
      console.log('👋 Closing connection...');
      ws.close();
    }, 5000);
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', JSON.stringify(message, null, 2));
    
    // Look specifically for debug info
    if (message.debug) {
      console.log('🐛 DEBUG INFO FOUND!');
      console.log(`   Participants: [${message.debug.participants.join(', ')}]`);
      console.log(`   Count: ${message.debug.participantCount}`);
      console.log(`   TTL: ${message.debug.ttlSeconds}s`);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });

  ws.on('close', () => {
    console.log('🔌 Connection closed');
  });
}

// Run the test
async function runTest() {
  try {
    await setupTestData();
    testWebSocket();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

console.log('🧪 Starting comprehensive WebSocket test with debug info...');
runTest();
