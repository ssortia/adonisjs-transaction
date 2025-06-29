import { AsyncLocalStorage } from 'async_hooks'
import { LucidModel } from '@adonisjs/lucid/build/src/types/model.js'
import type { 
  TransactionClientContract
} from '@adonisjs/lucid/build/src/types/database.js'
import db from '@adonisjs/lucid/build/services/db.js'

/**
 * Transaction configuration options
 */
export interface TransactionOptions {
  /**
   * Custom database connection to use
   */
  connection?: string
  
  /**
   * Transaction isolation level
   */
  isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable'
  
  /**
   * Enable debug logging for transactions
   */
  debug?: boolean
  
  /**
   * Custom timeout for transaction in milliseconds
   */
  timeout?: number
  
  /**
   * Retry configuration for failed transactions
   */
  retry?: {
    attempts: number
    delay: number
  }
}

/**
 * Transaction context metadata
 */
interface TransactionContext {
  transaction: TransactionClientContract
  id: string
  startTime: number
  options: TransactionOptions
}

/**
 * Enhanced AsyncLocalStorage for transaction context management
 */
class TransactionManager {
  private storage = new AsyncLocalStorage<TransactionContext>()
  private transactionCounter = 0

  /**
   * Get current transaction context
   */
  getCurrentContext(): TransactionContext | undefined {
    return this.storage.getStore()
  }

  /**
   * Get current transaction client
   */
  getCurrentTransaction(): TransactionClientContract | undefined {
    return this.getCurrentContext()?.transaction
  }

  /**
   * Check if we're currently in a transaction
   */
  isInTransaction(): boolean {
    return this.getCurrentContext() !== undefined
  }

  /**
   * Generate unique transaction ID
   */
  private generateTransactionId(): string {
    return `trx_${Date.now()}_${++this.transactionCounter}`
  }

  /**
   * Execute function within transaction context
   */
  async runInTransaction<T>(
    fn: () => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const existingContext = this.getCurrentContext()
    
    if (existingContext) {
      if (options.debug) {
        console.log(`[Transaction] Reusing existing transaction: ${existingContext.id}`)
      }
      return await fn()
    }

    const transactionId = this.generateTransactionId()
    const database = options.connection ? db.connection(options.connection) : db
    const trx = await database.transaction({
      isolationLevel: options.isolationLevel,
    })

    const context: TransactionContext = {
      transaction: trx,
      id: transactionId,
      startTime: Date.now(),
      options
    }

    if (options.debug) {
      console.log(`[Transaction] Starting transaction: ${transactionId}`)
    }

    try {
      const result = await this.storage.run(context, async () => {
        return await fn()
      })

      await trx.commit()
      
      if (options.debug) {
        const duration = Date.now() - context.startTime
        console.log(`[Transaction] Committed transaction: ${transactionId} (${duration}ms)`)
      }

      return result
    } catch (error) {
      await trx.rollback()
      
      if (options.debug) {
        const duration = Date.now() - context.startTime
        console.log(`[Transaction] Rolled back transaction: ${transactionId} (${duration}ms)`)
      }

      if (options.retry && options.retry.attempts > 0) {
        if (options.debug) {
          console.log(`[Transaction] Retrying transaction: ${transactionId} (${options.retry.attempts} attempts left)`)
        }
        
        await new Promise(resolve => setTimeout(resolve, options.retry!.delay))
        
        return this.runInTransaction(fn, {
          ...options,
          retry: {
            ...options.retry,
            attempts: options.retry.attempts - 1
          }
        })
      }

      throw error
    }
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(): { id: string; duration: number; options: TransactionOptions } | null {
    const context = this.getCurrentContext()
    if (!context) return null

    return {
      id: context.id,
      duration: Date.now() - context.startTime,
      options: context.options
    }
  }
}

/**
 * Global transaction manager instance
 */
const transactionManager = new TransactionManager()

/**
 * Enhanced transaction decorator with advanced features
 * 
 * @example
 * ```typescript
 * class UserService {
 *   @transaction({ debug: true, retry: { attempts: 3, delay: 100 } })
 *   async createUser(userData: any) {
 *     // This method will run in a transaction with retry logic
 *   }
 * }
 * ```
 */
export function transaction(options: TransactionOptions = {}) {
  return function <T extends (...args: any[]) => Promise<any>>(
    _target: any,
    _propertyName: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<T> {
    const method = descriptor.value!

    descriptor.value = async function (this: any, ...args: any[]) {
      return transactionManager.runInTransaction(
        () => method.apply(this, args),
        options
      )
    } as T

    return descriptor
  }
}

/**
 * Get current transaction client
 * 
 * @returns Current transaction client or undefined if not in transaction
 */
export function getCurrentTransaction(): TransactionClientContract | undefined {
  return transactionManager.getCurrentTransaction()
}

/**
 * Check if currently executing within a transaction
 * 
 * @returns True if in transaction context
 */
export function isInTransaction(): boolean {
  return transactionManager.isInTransaction()
}

/**
 * Get current transaction statistics
 * 
 * @returns Transaction stats or null if not in transaction
 */
export function getTransactionStats() {
  return transactionManager.getTransactionStats()
}

/**
 * Execute a function within a transaction programmatically
 * 
 * @param fn Function to execute in transaction
 * @param options Transaction options
 * @returns Result of the function
 * 
 * @example
 * ```typescript
 * const result = await runInTransaction(async () => {
 *   await User.create({ name: 'John' })
 *   await Post.create({ title: 'Hello', userId: 1 })
 *   return 'success'
 * }, { debug: true })
 * ```
 */
export function runInTransaction<T>(
  fn: () => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  return transactionManager.runInTransaction(fn, options)
}

/**
 * Type-safe method wrapper for automatic transaction injection
 */
type ModelOptions = Record<string, any>

/**
 * Helper function to inject transaction into method options
 */
function injectTransaction<T extends ModelOptions>(options?: T): T {
  const trx = getCurrentTransaction()
  if (!trx || (options?.client)) {
    return options || ({} as T)
  }
  
  return { ...options, client: trx } as unknown as T
}

/**
 * Enhanced Transactional mixin with better type safety and performance
 * 
 * Automatically injects current transaction into all Lucid model operations
 * Compatible with SoftDeletes and other traits
 * 
 * @example
 * ```typescript
 * class User extends Transactional(BaseModel) {
 *   // All operations will automatically use current transaction
 * }
 * ```
 */
export function Transactional<T extends new (...args: any[]) => LucidModel>(superclass: T) {
  const TransactionalModel = class extends superclass {
    // Static methods with automatic transaction injection
    static query(options?: ModelOptions) {
      return (superclass as any).query(injectTransaction(options))
    }

    static async create(values: any, options?: ModelOptions) {
      return (superclass as any).create(values, injectTransaction(options))
    }

    static async createMany(values: any[], options?: ModelOptions) {
      return (superclass as any).createMany(values, injectTransaction(options))
    }

    static async updateOrCreate(
      searchPayload: any, 
      updatePayload: any, 
      options?: ModelOptions
    ) {
      return (superclass as any).updateOrCreate(
        searchPayload, 
        updatePayload, 
        injectTransaction(options)
      )
    }

    static async find(value: any, options?: ModelOptions) {
      return (superclass as any).find(value, injectTransaction(options))
    }

    static async findBy(key: string, value: any, options?: ModelOptions) {
      return (superclass as any).findBy(key, value, injectTransaction(options))
    }

    static async findOrFail(value: any, options?: ModelOptions) {
      return (superclass as any).findOrFail(value, injectTransaction(options))
    }

    static async first(options?: ModelOptions) {
      return (superclass as any).first(injectTransaction(options))
    }

    static async firstOrFail(options?: ModelOptions) {
      return (superclass as any).firstOrFail(injectTransaction(options))
    }

    // Instance methods with automatic transaction injection
    async save(): Promise<this> {
      const trx = getCurrentTransaction()
      if (trx && !(this as any).$trx) {
        return (this as any).useTransaction(trx).save()
      }
      const BaseModel = this.constructor as any
      return BaseModel.prototype.save.call(this)
    }

    async delete(): Promise<void> {
      const trx = getCurrentTransaction()
      if (trx && !(this as any).$trx) {
        return (this as any).useTransaction(trx).delete()
      }
      const BaseModel = this.constructor as any
      return BaseModel.prototype.delete.call(this)
    }

    async forceDelete(): Promise<void> {
      const trx = getCurrentTransaction()
      if (trx && !(this as any).$trx && 'forceDelete' in this) {
        return (this as any).useTransaction(trx).forceDelete()
      }
      
      const instance = this as any
      const BaseModel = this.constructor as any
      return instance.forceDelete ? instance.forceDelete() : BaseModel.prototype.delete.call(this)
    }

    async restore(): Promise<void> {
      const trx = getCurrentTransaction()
      if (trx && !(this as any).$trx && 'restore' in this) {
        return (this as any).useTransaction(trx).restore()
      }
      
      const instance = this as any
      return instance.restore ? instance.restore() : Promise.resolve()
    }
  }

  // Preserve the original class name and prototype
  Object.defineProperty(TransactionalModel, 'name', {
    value: superclass.name,
    configurable: true
  })

  return TransactionalModel as T
}

/**
 * Advanced transaction utilities
 */
export const TransactionUtils = {
  /**
   * Execute multiple operations in sequence within a transaction
   */
  async sequence<T>(
    operations: Array<() => Promise<T>>,
    options: TransactionOptions = {}
  ): Promise<T[]> {
    return runInTransaction(async () => {
      const results: T[] = []
      for (const operation of operations) {
        results.push(await operation())
      }
      return results
    }, options)
  },

  /**
   * Execute multiple operations in parallel within a transaction
   */
  async parallel<T>(
    operations: Array<() => Promise<T>>,
    options: TransactionOptions = {}
  ): Promise<T[]> {
    return runInTransaction(async () => {
      return Promise.all(operations.map(op => op()))
    }, options)
  },

  /**
   * Conditional transaction execution
   */
  async conditional<T>(
    condition: () => boolean | Promise<boolean>,
    operation: () => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T | null> {
    const shouldExecute = await condition()
    if (!shouldExecute) return null
    
    return runInTransaction(operation, options)
  },

  /**
   * Transaction with savepoint support (placeholder implementation)
   */
  async withSavepoint<T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const trx = getCurrentTransaction()
    if (!trx) {
      throw new Error('withSavepoint can only be used within an existing transaction')
    }

    // Note: Savepoint support depends on the database driver
    try {
      return await operation()
    } catch (error) {
      throw error
    }
  }
}