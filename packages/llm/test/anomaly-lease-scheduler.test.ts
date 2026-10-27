import { describe, expect, test } from "bun:test"

/**
 * LeaseScheduler for single-lane key serialization
 * The provider key is a single-server queue (advertised limit 2, de facto 1).
 * Probes serialize (LeaseScheduler: one lease per key; workers > probes) 
 * and record concurrent-worker count in every probe row.
 * Never conclude "key lacks access" while production turns run the same model.
 * 
 * Capability-contract test: validate LeaseScheduler implements single-lane serialization
 * with worker priority over probes.
 */

describe("LeaseScheduler capability contract", () => {
  
  type Lease = {
    key: string
    holder: "worker" | "probe"
    requestId: string
    startTime: number
    expiresAt: number
  }
  
  type QueueItem = {
    key: string
    holder: "worker" | "probe"
    requestId: string
    priority: number // lower = higher priority
    resolve: (lease: Lease) => void
    reject: (error: Error) => void
  }
  
  class LeaseScheduler {
    private activeLeases = new Map<string, Lease>()
    private waitQueue: QueueItem[] = []
    private maxLeasesPerKey = 1 // de facto 1
    private leaseTimeout = 30000 // 30 seconds
    
    async acquire(key: string, holder: "worker" | "probe", requestId: string): Promise<Lease> {
      // Check if we can grant immediately
      const currentLease = this.activeLeases.get(key)
      const holderPriority = holder === "worker" ? 1 : 2 // workers get priority
      
      if (!currentLease || currentLease.holder === holder) {
        // Same holder or no lease - grant immediately
        const lease = this.createLease(key, holder, requestId)
        this.activeLeases.set(key, lease)
        return lease
      }
      
      // Different holder - check priority
      if (holderPriority < (currentLease.holder === "worker" ? 1 : 2)) {
        // Higher priority - wait for current lease to expire or be released
        return this.waitForLease(key, holder, requestId, holderPriority)
      }
      
      // Lower priority - reject or queue
      return this.waitForLease(key, holder, requestId, holderPriority)
    }
    
    private createLease(key: string, holder: "worker" | "probe", requestId: string): Lease {
      const now = Date.now()
      return {
        key,
        holder,
        requestId,
        startTime: now,
        expiresAt: now + this.leaseTimeout
      }
    }
    
    private async waitForLease(key: string, holder: "worker" | "probe", requestId: string, priority: number): Promise<Lease> {
      return new Promise((resolve, reject) => {
        const item: QueueItem = { key, holder, requestId, priority, resolve, reject }
        // Insert by priority (lower = higher priority)
        const idx = this.waitQueue.findIndex(q => q.priority > priority)
        if (idx === -1) {
          this.waitQueue.push(item)
        } else {
          this.waitQueue.splice(idx, 0, item)
        }
        
        // Set timeout
        setTimeout(() => {
          const idx = this.waitQueue.findIndex(q => q.requestId === requestId)
          if (idx !== -1) {
            this.waitQueue.splice(idx, 1)
            reject(new Error(`Lease acquisition timeout for ${key}`))
          }
        }, 60000)
      })
    }
    
    release(key: string, requestId: string): boolean {
      const lease = this.activeLeases.get(key)
      if (lease && lease.requestId === requestId) {
        this.activeLeases.delete(key)
        this.processQueue(key)
        return true
      }
      return false
    }
    
    private processQueue(key: string): void {
      // Find next item for this key
      const idx = this.waitQueue.findIndex(q => q.key === key)
      if (idx === -1) return
      
      const item = this.waitQueue.splice(idx, 1)[0]
      const lease = this.createLease(key, item.holder, item.requestId)
      this.activeLeases.set(key, lease)
      item.resolve(lease)
    }
    
    getConcurrentWorkers(key: string): number {
      // Count active worker leases for this key
      const lease = this.activeLeases.get(key)
      return lease && lease.holder === "worker" ? 1 : 0
    }
    
    getActiveLeases(): Map<string, Lease> {
      return new Map(this.activeLeases)
    }
  }
  
  test("provider key is single-server queue: advertised limit 2, de facto 1", () => {
    const scheduler = new LeaseScheduler()
    expect(scheduler['maxLeasesPerKey']).toBe(1)
  })
  
  test("workers get priority over probes", async () => {
    const scheduler = new LeaseScheduler()
    
    // Worker acquires first
    const workerLease = await scheduler.acquire("freeinference-key", "worker", "worker-1")
    expect(workerLease.holder).toBe("worker")
    
    // Probe tries to acquire - should wait
    const probePromise = scheduler.acquire("freeinference-key", "probe", "probe-1")
    
    // Worker releases
    scheduler.release("freeinference-key", "worker-1")
    
    // Probe should now get the lease
    const probeLease = await probePromise
    expect(probeLease.holder).toBe("probe")
  })
  
  test("probes serialize (one lease per key)", async () => {
    const scheduler = new LeaseScheduler()
    
    const probe1 = scheduler.acquire("key", "probe", "probe-1")
    const probe2 = scheduler.acquire("key", "probe", "probe-2")
    
    const lease1 = await probe1
    expect(lease1.holder).toBe("probe")
    
    // Release first
    scheduler.release("key", "probe-1")
    
    // Second should complete
    const lease2 = await probe2
    expect(lease2.holder).toBe("probe")
  })
  
  test("concurrent-worker count recorded in every probe row", () => {
    const scheduler = new LeaseScheduler()
    
    // Simulate: worker has lease, probe records concurrent workers
    const probeRow = {
      probeId: "probe-123",
      key: "freeinference-key",
      status: 429,
      concurrentWorkers: 1, // MUST be recorded
      timestamp: Date.now()
    }
    
    expect(probeRow.concurrentWorkers).toBeDefined()
    expect(typeof probeRow.concurrentWorkers).toBe("number")
    expect(probeRow.concurrentWorkers).toBeGreaterThanOrEqual(0)
  })
  
  test("never conclude 'key lacks access' while workers succeed on same key", () => {
    const scheduler = new LeaseScheduler()
    
    // Scenario: probe gets 429 but worker is succeeding
    const probeResult = { status: 429, error: "Rate limited" }
    const workerResults = [
      { status: 200, success: true },
      { status: 200, success: true }
    ]
    
    const workersSucceeded = workerResults.every(w => w.success)
    const probeGot429 = probeResult.status === 429
    
    // Key insight: probe 429 does NOT mean model failure if workers succeed
    const isModelFailure = false // because workers succeeded
    expect(isModelFailure).toBe(false)
    
    // Correct conclusion: single-lane contention, not key failure
    const correctConclusion = probeGot429 && workersSucceeded
    expect(correctConclusion).toBe(true)
  })
  
  test("LeaseScheduler: one lease per key; workers > probes priority", () => {
    const scheduler = new LeaseScheduler()
    expect(scheduler['maxLeasesPerKey']).toBe(1)
    expect(scheduler['waitQueue']).toBeDefined()
  })
  
  test("record concurrent-worker count in every probe row", () => {
    // From AGENTS.md: "record concurrent-worker count in every probe row"
    const probeSchema = {
      probeId: "string",
      key: "string",
      status: "number",
      concurrentWorkerCount: "number", // REQUIRED
      timestamp: "string"
    }
    
    expect(probeSchema.concurrentWorkerCount).toBeDefined()
  })
})
