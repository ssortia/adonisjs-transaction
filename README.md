# adonisjs-transaction-decorator

🚀 **Advanced transaction management for AdonisJS applications**

Powerful transaction decorator and mixin that provides automatic transaction handling with AsyncLocalStorage, retry mechanisms, debug logging, and comprehensive utilities.

## Features

✨ **@transaction() decorator** - Automatic transaction wrapping for methods  
🔄 **Nested transaction support** - Reuses existing transactions  
🔁 **Retry mechanism** - Configurable retry logic for failed transactions  
📊 **Debug logging** - Transaction lifecycle logging with timing  
⚡ **Transactional mixin** - Automatic transaction injection for Lucid models  
🛠 **Advanced utilities** - Sequence, parallel, conditional execution  
🔍 **Transaction stats** - Runtime statistics and monitoring  
🎯 **TypeScript first** - Full type safety and IntelliSense support  

## Installation

```bash
npm install adonisjs-transaction-decorator
```

## Quick Start

### 1. Transaction Decorator

```typescript
import { transaction } from 'adonisjs-transaction-decorator'

class UserService {
  @transaction()
  async createUser(userData: any) {
    // This method automatically runs in a transaction
    const user = await User.create(userData)
    await Profile.create({ userId: user.id, ...profileData })
    return user
  }

  @transaction({ 
    debug: true, 
    retry: { attempts: 3, delay: 100 } 
  })
  async createUserWithRetry(userData: any) {
    // Automatic retry on failure with debug logging
    return await User.create(userData)
  }
}
```

### 2. Transactional Mixin

```typescript
import { Transactional } from 'adonisjs-transaction-decorator'
import { BaseModel } from '@adonisjs/lucid/orm'

class User extends Transactional(BaseModel) {
  // All operations automatically use current transaction context
}

class UserController {
  @transaction()
  async store({ request }: HttpContext) {
    // All User operations will use the same transaction
    const user = await User.create(request.body())
    await User.query().where('active', false).update({ active: true })
    return user
  }
}
```

### 3. Programmatic Usage

```typescript
import { runInTransaction } from 'adonisjs-transaction-decorator'

// Execute multiple operations in a transaction
const result = await runInTransaction(async () => {
  const user = await User.create({ name: 'John' })
  const profile = await Profile.create({ userId: user.id })
  return { user, profile }
}, { 
  debug: true,
  isolationLevel: 'repeatable read'
})
```

## API Reference

### Transaction Options

```typescript
interface TransactionOptions {
  connection?: string              // Custom database connection
  isolationLevel?: IsolationLevel  // Transaction isolation level
  debug?: boolean                  // Enable debug logging
  timeout?: number                 // Transaction timeout (ms)
  retry?: {                        // Retry configuration
    attempts: number
    delay: number
  }
}
```

### Core Functions

#### `@transaction(options?: TransactionOptions)`

Decorator that wraps methods in a transaction.

```typescript
class OrderService {
  @transaction({ isolationLevel: 'serializable' })
  async processOrder(orderData: any) {
    // High isolation level for critical operations
  }

  @transaction({ 
    retry: { attempts: 3, delay: 200 },
    debug: true 
  })
  async processPayment(paymentData: any) {
    // Retry failed payments with logging
  }
}
```

#### `runInTransaction<T>(fn, options?): Promise<T>`

Execute a function within a transaction programmatically.

```typescript
const order = await runInTransaction(async () => {
  const order = await Order.create(orderData)
  await OrderItem.createMany(items.map(item => ({ ...item, orderId: order.id })))
  await Inventory.decrement(items)
  return order
}, { debug: true })
```

#### `getCurrentTransaction(): TransactionClientContract | undefined`

Get the current transaction client.

```typescript
const trx = getCurrentTransaction()
if (trx) {
  // Manual database operations with current transaction
  await trx.raw('UPDATE counters SET value = value + 1')
}
```

#### `isInTransaction(): boolean`

Check if currently executing within a transaction.

```typescript
if (isInTransaction()) {
  console.log('Running in transaction context')
}
```

#### `getTransactionStats()`

Get current transaction statistics.

```typescript
const stats = getTransactionStats()
console.log(`Transaction ${stats.id} running for ${stats.duration}ms`)
```

### Transactional Mixin

The `Transactional` mixin automatically injects the current transaction into all Lucid model operations:

```typescript
class User extends Transactional(BaseModel) {
  // All static and instance methods automatically use current transaction
}

// Usage
@transaction()
async createUserWithPosts() {
  const user = await User.create({ name: 'John' })        // Uses transaction
  const post = await Post.create({ userId: user.id })     // Uses transaction
  await user.save()                                       // Uses transaction
  return user
}
```

### Transaction Utilities

#### `TransactionUtils.sequence<T>(operations, options?): Promise<T[]>`

Execute operations sequentially within a transaction.

```typescript
const results = await TransactionUtils.sequence([
  () => User.create({ name: 'Alice' }),
  () => User.create({ name: 'Bob' }),
  () => User.create({ name: 'Charlie' })
], { debug: true })
```

#### `TransactionUtils.parallel<T>(operations, options?): Promise<T[]>`

Execute operations in parallel within a transaction.

```typescript
const [user, profile, settings] = await TransactionUtils.parallel([
  () => User.create(userData),
  () => Profile.create(profileData),
  () => Settings.create(settingsData)
])
```

#### `TransactionUtils.conditional<T>(condition, operation, options?)`

Conditionally execute operation in transaction.

```typescript
const user = await TransactionUtils.conditional(
  () => shouldCreateUser,
  () => User.create(userData),
  { debug: true }
)
```

#### `TransactionUtils.withSavepoint<T>(name, operation)`

Execute operation with savepoint support (database dependent).

```typescript
await runInTransaction(async () => {
  await User.create(userData)
  
  await TransactionUtils.withSavepoint('checkpoint', async () => {
    // This can be rolled back to savepoint on error
    await Profile.create(profileData)
  })
})
```

## Advanced Examples

### Error Handling with Retry

```typescript
class PaymentService {
  @transaction({ 
    retry: { attempts: 3, delay: 1000 },
    debug: true 
  })
  async processPayment(amount: number, cardToken: string) {
    // Automatically retries on failure
    const charge = await this.chargeCard(cardToken, amount)
    await Transaction.create({ amount, status: 'completed' })
    await this.sendReceipt(charge.receiptEmail)
    return charge
  }
}
```

### Complex Business Logic

```typescript
class OrderService {
  @transaction({ isolationLevel: 'serializable' })
  async fulfillOrder(orderId: number) {
    const order = await Order.findOrFail(orderId)
    
    // All operations use the same transaction
    for (const item of order.items) {
      await Inventory.decrement(item.productId, item.quantity)
      await ShippingLabel.create({ orderId, itemId: item.id })
    }
    
    await order.merge({ status: 'fulfilled' }).save()
    await this.notifyCustomer(order.customerId)
    
    return order
  }
}
```

### Multiple Database Connections

```typescript
class DataMigrationService {
  @transaction({ connection: 'analytics', debug: true })
  async migrateUserData(userId: number) {
    // Uses 'analytics' database connection
    const user = await User.create(userData)
    await UserAnalytics.create({ userId: user.id })
    return user
  }
}
```

### Monitoring and Debugging

```typescript
class ReportService {
  @transaction({ debug: true })
  async generateReport() {
    const stats = getTransactionStats()
    console.log(`Report generation started: ${stats.id}`)
    
    // Complex report generation...
    await this.aggregateData()
    await this.generateCharts()
    await this.saveReport()
    
    const finalStats = getTransactionStats()
    console.log(`Report completed in ${finalStats.duration}ms`)
  }
}
```

## Best Practices

### 1. Use Appropriate Isolation Levels

```typescript
// For critical operations requiring consistency
@transaction({ isolationLevel: 'serializable' })
async transferMoney(fromAccount: number, toAccount: number, amount: number) {
  // Prevents phantom reads and ensures data consistency
}

// For most operations (default)
@transaction({ isolationLevel: 'read committed' })
async updateProfile(userId: number, data: any) {
  // Good balance of consistency and performance
}
```

### 2. Enable Debug Logging in Development

```typescript
// In development
@transaction({ debug: true })

// In production
@transaction({ debug: false })
```

### 3. Use Retry for Network-Dependent Operations

```typescript
@transaction({ 
  retry: { attempts: 3, delay: 500 } 
})
async syncWithExternalAPI() {
  // Handles temporary network issues
}
```

### 4. Combine with Lucid Model Events

```typescript
class User extends Transactional(BaseModel) {
  @beforeCreate()
  static async hashPassword(user: User) {
    // This will use the current transaction context
    user.password = await Hash.make(user.password)
  }
}
```

## Compatibility

- **AdonisJS**: ^6.0.0
- **Node.js**: >=18.0.0
- **TypeScript**: ^5.0.0
- **Databases**: PostgreSQL, MySQL, SQLite, MSSQL (via Lucid ORM)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://docs.adonisjs.com)
- 💬 [Discord Community](https://discord.gg/vDcEjq6)
- 🐛 [Issues](https://github.com/adonisjs/transaction/issues)
- 💡 [Discussions](https://github.com/adonisjs/transaction/discussions)