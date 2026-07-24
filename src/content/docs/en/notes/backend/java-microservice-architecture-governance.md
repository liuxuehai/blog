---
title: Java Microservice Architecture Governance
description: Building a sustainable microservice system from service boundaries, data ownership, consistency, idempotency, observability, and release workflows.
category: Backend
tags:
  - Java
  - Microservices
  - Architecture
  - Distributed Systems
order: 51
updatedDate: 2026-07-15
difficulty: advanced
status: stable
lastReviewed: 2026-07-15
draft: false
sidebar:
  order: 51
---

Microservice governance is not about splitting a monolith into more processes, nor is it automatically achieved by introducing a service registry, gateway, and Kubernetes. What truly needs governing are **changes, dependencies, data, and faults** in the system.

If after splitting, a single requirement still requires modifying five services, a single fault still drags down the entire call chain, and teams still collaborate through a shared database, then the system has merely transformed from a monolith into a distributed monolith.

An effective microservice architecture should continuously improve the following metrics:

- Whether business changes can be confined within clear boundaries
- Whether services own independent data and release decisions
- Whether local faults escalate into full-chain failures
- Whether cross-service consistency has clear business semantics
- Whether production issues can be quickly discovered, located, and recovered

The goal of governance is not pursuing service count, but controlling system complexity.

## Establish an Architecture Baseline

Before starting to split or govern, first obtain the real structure of the current system rather than only reading architecture diagrams.

Baselines to collect include:

| Dimension | Facts to Confirm |
| --- | --- |
| Business | Core flows, business invariants, state lifecycles |
| Code | Module dependencies, shared libraries, circular calls, change hotspots |
| Data | Table ownership, cross-database queries, shared fields, data scale |
| Calls | Synchronous chains, message flows, external system dependencies |
| Runtime | Traffic, latency, error rates, resource and capacity peaks |
| Delivery | Build times, release frequency, rollback methods, fault records |

Start the investigation from recent months' requirements and faults:

- Which modules are frequently modified together
- Which interfaces, when changed, affect multiple teams
- Which tables are directly read/written by different services
- Which call chains are most prone to timeouts
- Which issues can only be located through manual database queries

These facts reveal governance priorities better than pre-designing a "standard microservice template."

## Service Boundaries Come from Business Capabilities

Service splitting should revolve around business capabilities, business rules, and data lifecycles — not technical layers like Controller, Service, DAO.

To judge whether a boundary is reasonable, check four questions:

1. Does it own a cohesive set of business rules?
2. Can it independently maintain core state?
3. Are its reasons for change relatively singular?
4. Is there a clear team or role responsible for it?

Using a generic transaction flow as an example:

```text
Order
  Responsible for order lifecycle and product transaction state

Receivable
  Responsible for receivable creation, adjustment, write-off, and balance

Payment
  Responsible for payment requests, channel routing, and payment results

Settlement
  Responsible for settlement rules, settlement documents, and settlement state
```

These modules have business collaboration, but they own different invariants and reasons for state change. Forcing them into a single "transaction service" would recreate a large monolith inside the service; splitting too finely means every business action requires crossing multiple network boundaries.

### Avoid Splitting Services by Database Table

"One table, one service" usually creates numerous anemic services. Tables are only the current storage model and don't represent business capabilities.

A more reliable sequence is:

```text
Business Capability
  ↓
Domain Rules & State
  ↓
Service Boundary
  ↓
Data Model
```

If the sequence is reversed, historical database structures will permanently constrain architectural evolution.

## Clarify Data Ownership

Service autonomy is built on data ownership. Each piece of core business data should have a single writer, and other services obtain information through published contracts.

Basic rules include:

- One service is responsible for the write rules of core data
- Other services cannot bypass interfaces to directly modify its tables
- Cross-service queries are completed through API, event copies, or dedicated read models
- Shared fields must declare their source, update time, and consistency requirements
- Data fixes also need to go through the owner's process

### Don't Use a Shared Database as an Integration Platform

Multiple services sharing a database has lower short-term development cost but brings long-term coupling:

- Table structure changes cannot be released independently
- Business rules may be duplicated across multiple services
- No way to track who modified a given field
- Cross-table transactions mask real service boundaries
- Database failures affect all services simultaneously

During early splitting, sharing a database instance temporarily is acceptable, but Schema, account, and write permission boundaries should be clearly defined, and direct cross-service access should be gradually eliminated.

### Cross-Service Queries

Cross-service lists and reports should not simply replicate multi-table joins from the monolith. Choose based on timeliness:

| Scenario | Recommended Approach |
| --- | --- |
| Small amount of real-time details | Synchronous API query |
| High-frequency combined queries | Establish a dedicated read model |
| Statistics and analytics | Data warehouse or analytics platform |
| Lists accepting some delay | Maintain query copies via events |

Read models allow redundancy but must clarify data source, update mechanism, and rebuild method.

## Set Boundaries for Synchronous Calls

Synchronous HTTP or RPC calls suit scenarios requiring immediate results, but each additional call layer adds latency and failure probability.

What needs governing is not "whether you can call," but how the system works when the call fails.

Each synchronous dependency should clarify at least:

- Connection and request timeout duration
- Which errors allow retry
- Maximum retry count and backoff strategy
- Circuit breaking and recovery conditions
- Concurrency isolation and resource limits
- Whether degraded results are acceptable
- How the caller records failure state

### Limit Call Chain Length

The following chain is hard to stabilize:

```text
Gateway
  → Order
    → Customer
      → Account
        → Risk
          → External API
```

Any node slowing down occupies upstream threads and connections. The optimization isn't necessarily converting all calls to messages, but re-evaluating:

- Does the current service really need this real-time data
- Can data be maintained as a local read-only copy
- Can the flow be changed to a traceable async state machine
- Are there reverse dependencies caused by misplaced responsibilities

Synchronous chains should serve business semantics, not become cross-service data fetching tools.

## Choose the Right Consistency Model

Distributed systems cannot rely on a single local database transaction covering all services. Architecture design must first confirm the consistency level the business truly needs.

### Strong Consistency Scope

Operations like fund deductions, inventory locking, and quota occupation usually need strong consistency within a single service. Critical invariants should be kept within the same data owner and local transaction where possible.

### Eventual Consistency Scope

Notifications, search indexes, reports, and cross-domain state synchronization can usually accept eventual consistency. The key is defining:

- How much delay is acceptable
- What users see in intermediate states
- How to retry and compensate after failure
- How to detect long-running incomplete flows

"Eventual consistency" cannot equate to "it should be consistent eventually." It requires complete state and recovery mechanisms.

## Use Local Transactions and Event Collaboration

A common problem is business data being committed successfully but message sending failing, causing downstream to never receive the change.

The Outbox pattern can be used:

```text
Same Local Transaction
  ├── Update business data
  └── Write Outbox event

Async Publisher
  └── Send Outbox event to messaging system
```

After successful publishing, update the send status; on failure, continue retrying. This ensures business data and pending events are committed simultaneously.

The consumer side can use Inbox or a business unique key to record processing results:

```text
Receive Message
  ↓
Check eventId / businessKey
  ↓
Execute business transaction
  ↓
Record consumption result
```

This mechanism cannot guarantee exactly-once delivery, but it makes business processing idempotent.

## Idempotency Is Business Design, Not a Middleware Switch

Deduplication capabilities provided by messaging systems, gateways, or SDKs can only cover partial scenarios. True idempotency requires the business layer to define whether "a repeated request represents the same action."

Common idempotency keys include:

- Client-generated requestId
- Upstream business document number and operation type
- Payment channel transaction ID
- Message eventId
- Aggregate root ID and target state

Implementation can combine:

- Database unique constraints
- Idempotency record tables
- Conditional updates
- State machine validation
- Optimistic lock version numbers

For example, when a payment success message arrives repeatedly, the account balance should not be increased again. The processing logic needs to confirm the current payment state, transaction ID, and crediting result — not just rely on a potentially expired lock in Redis.

## Distinguish Events from Commands

Message naming affects coupling between services.

**Events** describe facts that have already occurred:

```text
OrderConfirmed
PaymentSucceeded
ReceivableWrittenOff
```

The publisher should not know which consumers exist.

**Commands** require a specific recipient to perform an action:

```text
CreateReceivable
FreezeCredit
SendPaymentRequest
```

Commands need clear recipients, execution results, and failure semantics.

If commands are disguised as events, the publisher implicitly depends on consumer behavior; if all facts are designed as commands, services form centralized flow control.

### Message Contracts

Events should include at least:

```text
eventId
eventType
eventVersion
occurredAt
producer
traceId
businessKey
payload
```

Field changes need a compatibility strategy. Prefer adding new optional fields; avoid directly changing existing field semantics. When incompatible, upgrade the event version and allow consumers to migrate gradually.

## Use State Machines to Manage Long Flows

Cross-service business flows usually involve waiting, failure, retry, and compensation. Expressing flows only through `if/else` and message retries in code makes it hard to judge the current business state.

Explicit state machines should define:

- Valid states
- Allowed state transitions
- Commands or events that trigger transitions
- Preconditions for each transition
- Timeout and compensation actions

For example:

```text
PENDING
  → PROCESSING
  → SUCCEEDED
  → FAILED
  → COMPENSATING
  → COMPENSATED
```

State transitions must be persisted, recording business document number, trigger source, time, and failure reason. This enables query, replay, compensation, and auditing.

## Observability Must Cover Business Results

Monitoring only CPU, memory, and JVM heap usage cannot determine whether the system correctly completes business operations.

Three layers of metrics are recommended:

### Infrastructure

- CPU, memory, disk, and network
- Pod restarts, thread pools, connection pools
- JVM GC, heap, and class loading

### Service Quality

- Request volume, error rate, and latency percentiles
- Timeouts, circuit breaks, retries, and rate limiting counts
- Message backlog, consumption lag, and failure counts
- Database connections, slow queries, and lock waits

### Business Results

- Success rates for flows like creation, payment, and write-off
- Document counts stuck in intermediate states for extended periods
- Amount or quantity reconciliation differences
- Compensation task and manual processing counts

Each log and message should carry a unified `traceId`, business document number, and key state. Once technical call chains are correlated with business state, problem diagnosis no longer requires manual cross-database queries.

## Release and Configuration Also Need Governance

Services being independently deployable doesn't mean they should be released arbitrarily. A stable delivery flow should include at least:

```text
Code Review
  ↓
Unit & Integration Tests
  ↓
Artifact Build
  ↓
Configuration & Migration Check
  ↓
Canary Release
  ↓
Metric Observation
  ↓
Full Rollout or Rollback
```

### Database Changes

Database changes should follow a forward-compatible sequence:

1. First add new fields or new tables.
2. Release code that's compatible with both old and new structures.
3. Complete historical data migration.
4. Switch read and write logic.
5. After confirming no old versions are using it, clean up.

Renaming fields, modifying types, and deleting old columns in a single release makes application deployment and database changes unable to be independently rolled back.

### Configuration Governance

Configuration should have:

- Type and value validation
- Environment difference documentation
- Independent management of sensitive information
- Change records and approval
- Quick rollback for misconfigurations

Dynamic configuration doesn't mean all parameters should be modifiable online. Thread pools, financial rules, and security policies require different permissions and release requirements.

## Incrementally Refactoring Monolith Systems

Large systems are not suited for one-time rewrites. A more reliable approach is to gradually migrate capabilities with clear boundaries and defined value.

An executable sequence is:

1. Identify business capabilities with high change frequency or high fault rates.
2. First organize module and data boundaries within the monolith.
3. Establish clear interfaces and anti-corruption layers.
4. Prioritize implementing new requirements in the target service.
5. Synchronize or migrate historical data.
6. Compare business results between old and new paths.
7. Switch traffic in batches while preserving rollback paths.
8. After stabilization, remove old logic.

Making the system modular first, then splitting into processes, reduces the uncertainty of distributed transformation. If boundaries within the monolith are still chaotic, splitting directly into services only converts method calls into network calls.

## Architecture Governance Requires Continuous Execution

If architecture rules exist only in documentation, they'll quickly diverge from code. They should be converted into executable or auditable mechanisms wherever possible:

- Use dependency checks to block cross-layer or cross-domain calls
- Manage API and event contracts through Schema
- Execute tests, static analysis, and migration checks in CI
- Define SLOs and alerts for core services
- Check boundaries and data ownership in Code Review
- Periodically review service dependencies, faults, and capacity changes

Code Review should not just check code style, but also focus on:

- Whether new dependencies align with service direction
- Whether data owners are bypassed with direct storage access
- Whether retries could produce duplicate side effects
- Whether exceptions carry sufficient business context
- Whether new events have version and idempotency design
- Whether releases have compatibility and rollback paths

## Common Anti-Patterns

### Distributed Monolith

Services must be released together in a fixed order; any single service being unavailable causes the entire flow to fail.

### Shared Domain Model

Multiple services depend on a shared package containing numerous business objects. A single field change triggers a system-wide upgrade.

Shared libraries are better suited for logging, tracing, and base protocols — they should not carry cross-domain business models.

### Unrestricted Synchronous Calls

Services continuously add RPCs to obtain a few fields, eventually forming deep call chains. Re-evaluate data copies, read models, and responsibility placement.

### Message-Driven Without State

The system sends numerous messages but cannot query where a given flow currently stands. Messages must be combined with persistent state, idempotency, and compensation mechanisms.

### Using Infrastructure as a Substitute for Design

Introducing Kubernetes, Service Mesh, or message queues cannot automatically solve boundary, data, and consistency problems. Infrastructure can only execute architecture decisions that have already been made clear.

## Governance Checklists

### Service Boundaries

- [ ] Does the service correspond to a clear business capability
- [ ] Are core state and business invariants cohesive
- [ ] Are there changes requiring multiple services to release simultaneously
- [ ] Is there a clear service owner

### Data & Consistency

- [ ] Does each piece of core data have a single writer
- [ ] Is there direct cross-service database access
- [ ] Are strong consistency and eventual consistency scopes defined
- [ ] Is there a reliable mechanism between message publishing and business transactions
- [ ] Do consumers have business-level idempotency

### Stability

- [ ] Do synchronous calls have timeout and resource limits
- [ ] Do retries have count, backoff, and idempotency protection
- [ ] Can message backlog and stuck flows be detected
- [ ] Do core business operations have result metrics and alerts

### Delivery

- [ ] Are API, event, and database changes forward-compatible
- [ ] Do releases support canary and quick rollback
- [ ] Does CI execute core checks
- [ ] Does Code Review cover architecture and data boundaries

## Conclusion

The value of microservice architecture governance lies not in splitting the system more finely, but in ensuring that business changes, data consistency, and operational faults all have clear boundaries.

Service boundaries determine the scope of change, data ownership determines autonomy capability, consistency and idempotency determine business reliability, and observability and release governance determine whether the system can run long-term. Only when these mechanisms work together do microservices become a tool for reducing complexity — rather than a source of it.

## Related

- [Backend Knowledge](/en/notes/backend/)
- [Engineering Closed Loop for AI-Assisted Development](/en/notes/ai/ai-assisted-engineering-workflow/)
- [Database Knowledge](/en/notes/database/)
- [DevOps Knowledge](/en/notes/devops/)
