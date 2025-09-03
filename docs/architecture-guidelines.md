# Bundl Backend - Architecture Guidelines

## Module Organization Principles

### When to Create a Dedicated Module Folder

A feature should have its own module folder (`src/feature/`) when it meets **ALL** of these criteria:

1. **Has HTTP endpoints** (requires a controller)
2. **Has domain-specific business logic** (not just utility functions)
3. **Has its own DTOs/interfaces** (API contracts)
4. **Could potentially be extracted as a microservice**
5. **Represents a bounded context** (clear domain boundary)

### Current Module Structure

#### ✅ **Domain Modules** (Have their own folders)
- **`src/auth/`** - Authentication & authorization
  - Has controller with endpoints (`/auth/*`)
  - Has domain logic (OTP, JWT, token management)
  - Has DTOs (SendOtpDto, VerifyOtpDto, etc.)
  - Could be auth microservice

- **`src/orders/`** - Core business logic
  - Has controller with endpoints (`/orders/*`)
  - Has core business logic (order lifecycle)
  - Has DTOs (CreateOrderDto, PledgeToOrderDto, etc.)
  - Could be orders microservice

- **`src/credits/`** - Credit management & payments
  - Has controller with endpoints (`/credits/*`)
  - Has domain logic (credit transactions, payments)
  - Has DTOs (CreateCreditOrderDto, etc.)
  - Could be payments microservice

#### ✅ **Infrastructure Modules** (Utility modules)
- **`src/redis/`** - Redis infrastructure
  - No controller (no HTTP endpoints)
  - Infrastructure service for caching/geo-queries
  - Provides RedisService to other modules

#### ✅ **Shared Services** (`src/services/`)
Cross-cutting concerns and utilities used by multiple modules:

- **`events.service.ts`** - Event handling utility
  - No HTTP endpoints
  - Used by multiple modules (orders, credits)
  - Cross-cutting concern

- **`fcm/fcm.service.ts`** - Push notification utility
  - No HTTP endpoints  
  - Infrastructure service
  - Used by events service

### Folder Structure Rules

#### Domain Module Structure:
```
src/feature/
├── feature.controller.ts     # HTTP endpoints
├── feature.service.ts        # Business logic
├── feature.module.ts         # NestJS module
├── dto/                      # Data transfer objects
│   └── feature.dto.ts
├── guards/                   # Feature-specific guards (optional)
└── services/                 # Feature-specific services (optional)
    └── helper.service.ts
```

#### Shared Services Structure:
```
src/services/
├── index.ts                  # Barrel exports
├── utility.service.ts        # Cross-cutting services
└── infrastructure/           # Infrastructure services
    └── external.service.ts
```

### Import Guidelines

1. **Domain services** import from their own module: `./feature.service`
2. **Shared services** import from services folder: `../services/utility.service`
3. **Cross-module dependencies** should be minimal and well-defined
4. **Infrastructure services** (Redis, DB) can be used by any module

### Examples

#### ✅ **Good**: Credits Module
- Has controller (`/credits/*` endpoints)
- Has business logic (credit transactions)
- Has DTOs (payment requests)
- Contains payment-related services (`revenuecat.service.ts`)

#### ❌ **Bad**: Old PaymentsModule (removed)
- Empty controller and service
- No business logic
- No DTOs
- Should have been part of credits module

#### ✅ **Good**: Events Service in shared services
- No HTTP endpoints
- Used by multiple modules
- Cross-cutting concern
- Pure utility function

### Migration Pattern

When moving services between locations:
1. Move the service file to correct location
2. Update all imports across the codebase
3. Update module providers and exports
4. Update barrel exports (`index.ts` files)
5. Ensure no broken dependencies

This structure ensures:
- **Clear separation of concerns**
- **Easy microservice extraction**
- **Reduced coupling between modules**
- **Intuitive codebase navigation**
- **Scalable architecture**
