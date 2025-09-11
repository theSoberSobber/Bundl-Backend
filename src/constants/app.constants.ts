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
    ORDER_PREFIX: 'order:',
    OTP_PREFIX: 'otp:',
    TOKEN_PREFIX: 'token:',
    BLACKLIST_PREFIX: 'blacklist:token:',
    USER_TOKENS_PREFIX: 'user:',
    ORDERS_GEO_KEY: 'orders:geo',
    CREDIT_ORDER_PREFIX: 'credit_order:',
    LOCK_PREFIX: 'lock:',
    // Chat Keys
    CHAT_STREAM_PREFIX: 'chat:',
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
