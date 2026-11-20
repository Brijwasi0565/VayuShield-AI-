# VayuShield AI — Security Specification & Threat Model

## 1. Data Invariants
1. User profile documents (`/users/{userId}`) contain PII (`email`, `displayName`) and are readable/writable strictly by the authenticated owner (`request.auth.uid == userId`) with verified email.
2. Household profiles (`/users/{userId}/households/{householdId}`), symptom logs (`/users/{userId}/symptoms/{symptomId}`), and challenges (`/users/{userId}/challenges/{challengeId}`) belong strictly to `{userId}` (`data.userId == userId == request.auth.uid`), with `userId` and `createdAt` immutable after creation.
3. Community reports (`/reports/{reportId}`) contain zero PII and are publicly readable, but creation requires an authenticated verified user with `authorId == request.auth.uid`, `upvotes == 0`, `downvotes == 0`, `verified == false`, and server-enforced `request.time` timestamps.
4. Updates to `/reports/{reportId}` are split into strict actions: owner edit (`description`, `type`, `updatedAt`) vs. community vote (`upvotes` or `downvotes` incremented by exactly `1`, `updatedAt == request.time`), preventing arbitrary tampering or shadow `verified: true` injection.
5. All document IDs are validated with `^[a-zA-Z0-9_\-]+$` and bounded to `<= 128` characters. All strings and arrays are strictly size-bounded.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated user read**: `GET /users/userA` with `auth = null` -> DENIED.
2. **Cross-user PII read**: `GET /users/userA` as `userB` -> DENIED.
3. **Unverified email write**: `CREATE /users/userA` with `email_verified: false` -> DENIED.
4. **Shadow field on profile create**: `CREATE /users/userA` with `{ ..., isAdmin: true }` -> DENIED (`hasOnly`).
5. **Household cross-owner spoof**: `CREATE /users/userA/households/h1` as `userA` with `userId: "userB"` -> DENIED.
6. **Oversized member array**: `CREATE /users/userA/households/h1` with `members.length = 20` (> 15) -> DENIED.
7. **Invalid symptom severity**: `CREATE /users/userA/symptoms/s1` with `severity: 99` -> DENIED.
8. **Client-forged createdAt timestamp**: `CREATE /users/userA/symptoms/s1` with `createdAt: 2020-01-01` (`!= request.time`) -> DENIED.
9. **Immutable createdAt tampering**: `UPDATE /users/userA/households/h1` altering `createdAt` -> DENIED.
10. **ID poisoning**: `CREATE /reports/` + 500-char ID -> DENIED (`isValidId`).
11. **Report self-verification shadow write**: `CREATE /reports/r1` with `verified: true` or `upvotes: 500` -> DENIED.
12. **Report vote tampering**: `UPDATE /reports/r1` changing `upvotes` by `+50` or changing `authorId` -> DENIED.
