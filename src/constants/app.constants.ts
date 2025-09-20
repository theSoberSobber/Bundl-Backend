// Application-wide constants
export const APP_CONSTANTS = {
  // Credits
  DEFAULT_USER_CREDITS: 5,
  CREDIT_COST_PER_ACTION: 1,

  // Orders
  DEFAULT_ORDER_EXPIRY_SECONDS: 600, // 10 minutes
  DEFAULT_SEARCH_RADIUS_KM: 5,

  // OTP
  OTP_EXPIRY_SECONDS: 300, // 5 minutes

  // JWT
  REFRESH_TOKEN_EXPIRY: '30d',

  // Redis Keys
  REDIS_KEYS: {
    // Global Redis prefix for all Bundl keys
    REDIS_PREFIX: 'bundl:',
    
    // Order-related keys
    // Format: 'order:' -> Creates keys like 'bundl:order:uuid-here'
    // Example: 'bundl:order:123e4567-e89b-12d3-a456-426614174000'
    ORDER_PREFIX: 'order:',
    
    // OTP keys for phone verification
    // Format: 'otp:' -> Creates keys like 'bundl:otp:+919876543210'
    OTP_PREFIX: 'otp:',
    // JWT token keys
    // Format: 'token:' -> Creates keys like 'bundl:token:jwt-token-hash'
    TOKEN_PREFIX: 'token:',
    
    // Blacklisted token keys
    // Format: 'blacklist:token:' -> Creates keys like 'bundl:blacklist:token:jwt-hash'
    BLACKLIST_PREFIX: 'blacklist:token:',
    
    // User session keys
    // Format: 'user:' -> Creates keys like 'bundl:user:user-uuid'
    USER_TOKENS_PREFIX: 'user:',
    
    // Geo-spatial index for orders
    // Key name: 'bundl:orders:geo'
    // Contains geo-encoded order locations
    // Values stored: 'order:uuid' (WITHOUT bundl prefix!)
    // Example geo set member: 'order:123e4567-e89b-12d3-a456-426614174000'
    ORDERS_GEO_KEY: 'orders:geo',
    
    // Credit order keys for payment processing
    // Format: 'credit_order:' -> Creates keys like 'bundl:credit_order:payment-id'
    CREDIT_ORDER_PREFIX: 'credit_order:',
    
    // Lock keys for distributed locking
    // Format: 'lock:' -> Creates keys like 'bundl:lock:resource-name'
    LOCK_PREFIX: 'lock:',
    
    // Chat Keys
    // Format: 'chat:' -> Creates keys like 'bundl:chat:order-uuid'
    // Example: 'bundl:chat:123e4567-e89b-12d3-a456-426614174000'
    CHAT_STREAM_PREFIX: 'chat:',
    
    // Order participants set keys
    // Format: 'order:' -> Creates keys like 'bundl:order:uuid:participants'
    // Example: 'bundl:order:123e4567-e89b-12d3-a456-426614174000:participants'
    ORDER_PARTICIPANTS_PREFIX: 'order:',
  },

  // Event Types
  EVENTS: {
    ORDER_EXPIRED: 'order.expired',
    ORDER_COMPLETED: 'order.completed',
    PLEDGE_SUCCESS: 'pledge.success',
    PLEDGE_FAILED: 'pledge.failed',
  },

  // Chat
  CHAT: {
    COMPLETION_GRACE_PERIOD: 5 * 60, // 5 minutes
    DEFAULT_HISTORY_LIMIT: 20,
    MAX_MESSAGE_LENGTH: 500,
    MESSAGE_TYPES: {
      USER: 'USER',
      SYSTEM_PLEDGE: 'SYSTEM_PLEDGE',
      SYSTEM_JOIN: 'SYSTEM_JOIN', 
      SYSTEM_COMPLETE: 'SYSTEM_COMPLETE',
      SYSTEM_EXPIRED: 'SYSTEM_EXPIRED',
    },
  },
} as const;
