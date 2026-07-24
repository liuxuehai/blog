---
title: Engineering Closed Loop for AI-Assisted Development
description: Integrating AI into requirements breakdown, architecture design, coding, testing, review, and documentation — while maintaining clear quality gates.
category: AI
tags:
  - AI
  - Software Engineering
  - Code Review
  - Testing
order: 11
updatedDate: 2026-07-15
difficulty: intermediate
status: stable
lastReviewed: 2026-07-15
draft: false
sidebar:
  order: 11
---

AI can accelerate development speed, but "generating code faster" is not the complete definition of engineering efficiency. What truly needs optimization is the entire cycle from a problem entering the team, to code going live and leaving behind maintainable knowledge.

I prefer to view AI as an **engineering collaborator without final decision-making authority**: it can read context, break down tasks, propose solutions, write code, and supplement tests, but every stage must produce inspectable artifacts and pass corresponding quality gates.

```text
Problem Definition
   ↓
Requirements Breakdown
   ↓
Architecture & Impact Analysis
   ↓
Small-Step Implementation
   ↓
Testing & Automated Verification
   ↓
Human Review
   ↓
Documentation & Knowledge Distillation
```

The focus of this closed loop is not having AI complete more steps, but exposing errors earlier and making every step traceable.

## Establish Three Basic Constraints First

### 1. AI Output Is Not Fact

Models may misread code, overlook implicit constraints, or provide implementations that are syntactically correct but semantically wrong for the business. Requirements, interfaces, data structures, and test results must be grounded in the repository, runtime environment, and business rules.

Therefore, tasks should clearly distinguish:

- **Confirmed facts**: Code, schemas, interface docs, reproducible runtime results
- **Working assumptions**: Judgments tentatively adopted to continue analysis
- **Pending confirmations**: Items lacking information that could change the approach

If these three are mixed together, AI can easily expand speculation into "definitive conclusions."

### 2. AI Cannot Bypass Engineering Boundaries

The existing codebase already contains module boundaries, naming conventions, error handling, testing approaches, and delivery workflows. AI implementations should first adapt to these constraints before introducing new abstractions.

Typical boundaries include:

- No modifying modules outside the task scope
- No overwriting unexplainable existing changes
- No fabricating interfaces, configurations, data, or test results
- No claiming task completion without verification
- Escalate review level for permissions, financial operations, and data migrations

### 3. Automated Verification Cannot Replace Human Judgment

Compilation passing only means types and syntax meet requirements; test passing only covers behaviors already written into tests. Business correctness, architectural soundness, exception paths, and long-term maintenance costs still require human judgment.

A reliable division of labor is:

```text
AI: Expand analysis and implementation throughput
Tools: Provide deterministic verification results
Humans: Bear business, architecture, and release decisions
```

## Phase 1: Convert Requirements into a Task Contract

Handing a single business description directly to AI usually produces an overly broad plan. The first step should form a task contract, giving "done" a judgeable meaning.

A minimal task contract should include at least:

```text
Goal
The specific problem to solve.

Current Behavior
How the current system works, how to reproduce the issue.

Expected Behavior
What observable behaviors change after completion.

In Scope
Modules and workflows allowed to be modified this time.

Out of Scope
Related issues explicitly not addressed.

Acceptance Criteria
Results confirmable through testing or manual checks.

Constraints
Compatibility, performance, security, data, and release timing constraints.
```

AI is suited for three things at this stage:

1. Identifying ambiguous words and hidden premises in the description.
2. Breaking the goal into independently verifiable behaviors.
3. Listing questions that need confirmation from code or business stakeholders.

For example, "optimize order processing performance" is not an executable task. It needs further clarification on bottleneck location, target metrics, data scale, allowable consistency boundary changes, and whether upstream/downstream systems are involved.

## Phase 2: Read Code First, Then Design Architecture

AI can easily produce a "theoretically correct" design based on general experience, but what the project actually needs is a plan that fits the shape of the existing system.

Before proposing changes, complete the following investigation:

- Find the entry points, core call chains, and data ownership
- Read adjacent module implementations and tests
- Confirm the repository's existing shared components and infrastructure
- Check configurations, database schemas, and external dependencies
- Check whether other incomplete modifications exist in the workspace

After the investigation, the plan should answer at least:

| Question | What Needs to Be Explained |
| --- | --- |
| What to modify | Files, modules, interfaces, and data structures |
| Why this approach | Relationship with existing patterns and requirement constraints |
| What's impacted | Callers, storage, messages, caches, and deployment |
| How to verify | Unit tests, integration tests, builds, or manual processes |
| How to rollback | Feature flags, compatibility paths, data recovery, or version rollback |

When the task is complex, investigation and implementation can be separated: multiple Workers analyze call chains, test coverage, and risks in parallel, then a Coordinator synthesizes conclusions and decides on a single approach. The value of parallelism lies in expanding read coverage, not simultaneously generating multiple conflicting codebases.

## Phase 3: Cut Implementation into Verifiable Small Steps

The more AI modifies at once, the higher the review cost and the probability of unintended changes. The implementation phase should prioritize small batches that can be independently explained and verified.

A common sequence is:

1. Supplement or modify data models.
2. Implement core domain logic.
3. Connect callers and external boundaries.
4. Fill in exception handling and observability.
5. Update tests and documentation.

Each step should maintain two properties:

- **Locally complete**: The current change has a clear purpose on its own, without requiring extensive subsequent code to understand
- **Verifiable**: Corresponding tests, type checks, build commands, or runtime observation points exist

When AI generates code, its freedom should also be constrained. More effective than "help me implement this feature" are constraints like:

```text
Follow existing Repository and error types.
Only modify the listed modules.
Do not add new runtime dependencies.
Maintain compatibility with existing public interfaces.
Write a failing test first, then implement the minimal change.
```

The more specific the constraints, the less the model needs to fill context through guessing.

## Phase 4: Let Tests Cover Risk, Not Lines of Code

AI is well-suited for generating test skeletons and edge cases, but it also tends to verify its own implementation details. Test design should start from risk, not reason backward from current code structure.

### Test Priority

Consider in the following order:

1. **Business invariants**: Amount conservation, state transitions, permission boundaries, idempotency constraints
2. **Failure paths**: Timeouts, duplicate messages, partial success, external dependency unavailability
3. **Compatibility behaviors**: Existing callers, historical data, and legacy configurations
4. **Normal paths**: The most common success flows
5. **Implementation details**: Fix only when they truly belong to the contract

For messaging and distributed workflows, tests should not just verify "message was sent." They should also cover:

- Whether duplicate consumption is safe
- Whether ordering changes affect results
- Whether failed retries produce side effects
- Whether message field evolution is compatible
- Whether a consistency gap exists between data persistence and event publishing

### Automated Verification Checklist

Choose deterministic commands based on the project tech stack:

```text
Formatting and static analysis
Type checking or compilation
Target module unit tests
Cross-module integration tests
Production build
Database migration check
Critical page or API smoke test
```

AI must report which commands were actually executed, what the results were, and which checks couldn't run due to environmental reasons. It cannot substitute "theoretically should pass" for verification.

## Phase 5: Treat Code Review as an Independent Task

Having AI in the same conversation simply confirm "no issues" after completing code has limited value. A more reliable approach is switching to a review perspective, re-checking from the diff and requirement contract.

Reviews should prioritize finding:

- Behavioral regressions and missed exception paths
- Cross-module contract inconsistencies
- Concurrency, transaction, idempotency, and data consistency issues
- Permission escalation, sensitive information leaks, and unsafe defaults
- New abstractions or dependencies that cannot be justified
- Tests that only cover normal paths
- Implementations inconsistent with acceptance criteria

AI can be asked to output findings by severity, providing file location, trigger conditions, and actual impact for each issue. When no issues are found, it should also explain remaining test gaps and risks that cannot be eliminated.

Human review should focus on confirming:

1. Whether requirements and business rules are correctly understood.
2. Whether the approach aligns with the system's long-term evolution direction.
3. Whether tests cover truly important failure modes.
4. Whether the change is allowed into the release process.

## Phase 6: Distill Results into Reusable Context

If each task lets AI re-explore the same rules, efficiency gains quickly hit a ceiling. After completing development, stable information should be distilled into appropriate locations.

Different content should go into different carriers:

| Content | Suitable Location |
| --- | --- |
| Build, test, and commit methods | Repository development guide |
| Module boundaries and dependency principles | Architecture docs or ADRs |
| API and data contracts | Schema, interface documentation |
| Common faults and handling steps | Runbooks |
| Reusable task steps | Agent Skills or scripts |
| Periodic decisions and retrospectives | Blog or Changelog |

Only distill information that has been verified and expected to remain valid long-term. Temporary debugging conclusions, unconfirmed guesses, and session-specific details should not become permanent rules.

## An Executable Task Cycle

In practice, the complete workflow can be compressed into the following cycle:

```text
1. Restate
   Restate the goal, scope, and acceptance criteria in your own words.

2. Inspect
   Gather facts from code, tests, and configurations.

3. Plan
   Provide change points, risks, and verification methods.

4. Implement
   Make small changes, keeping each step explainable.

5. Verify
   Run tests, checks, and production build.

6. Review
   Re-read the diff, looking for regressions and omissions.

7. Report
   Explain what was completed, verification results, and remaining risks.

8. Distill
   Write stable experience into documentation, tests, or automation rules.
```

If new facts emerge at any stage, return to the previous step to revise the plan rather than piling up code to maintain the original schedule.

## Common Failure Modes

### Generate Large Amounts of Code First, Then Look for Problems

This converts requirement uncertainty into large-scale code changes. A better sequence is to first narrow down the problem and interface, then generate the minimal implementation.

### Use Longer Prompts Instead of Real Context

Prompts cannot replace code, logs, schemas, and tests. AI should read trustworthy sources rather than copying a potentially outdated system model into the description.

### Only Have AI Write Tests Without Checking Test Semantics

Models may generate assertions that always pass, tests that duplicate implementation logic, or tests that use mocks to bypass real integration boundaries. Test code also needs review.

### Directly Upgrade a Successful Experience to a Global Rule

Effective practices in a specific project don't necessarily apply to all repositories. Rules should state their scope of applicability and allow correction by new facts.

### Use AI Speed to Obscure Change Scale

Generating 20 files may take only minutes, but understanding and maintaining those files still carries real cost. Engineering throughput is ultimately limited by review and verification capacity.

## Pre-Commit Checklist

- [ ] Is the goal, scope, and non-goal clearly defined
- [ ] Do key conclusions come from code or verifiable sources
- [ ] Does the plan follow existing module boundaries
- [ ] Can each change explain its necessity
- [ ] Do business invariants and failure paths have tests
- [ ] Have all commands claimed to pass actually been executed
- [ ] Has the complete diff been re-checked
- [ ] Have unverified items and remaining risks been documented
- [ ] Has stable experience been distilled into the correct location

## Conclusion

The core of AI-assisted development is not removing humans from the process, but redistributing human attention: let the model handle high-throughput reading, generation, and preliminary analysis; let automated tools provide deterministic feedback; and let engineers focus on business semantics, system boundaries, and release decisions.

When requirements, implementation, verification, and review form a closed loop, AI transforms from a "faster code generator" into a productivity tool that can enter long-term engineering systems.

## Related

- [AI Knowledge](/en/notes/ai/)
- [Bot: Local-First Execution Agent Platform](/projects#bot)
- [Account Manager: AI Account and Proxy Management System](/projects#account-manager)
- [Backend Knowledge](/en/notes/backend/)
