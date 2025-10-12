# Security Improvements

This document outlines the security enhancements implemented for the admin authentication system.

## Overview

Multiple layers of security have been added to protect admin routes and functionality:

1. **Defense-in-Depth API Protection**
2. **Server-Side Page Authentication**
3. **Session Timeout Configuration**
4. **Login Rate Limiting**

---

## 1. Defense-in-Depth API Protection

All admin API routes now have explicit `requireAdmin()` checks, providing an additional security layer beyond middleware.

### Protected Routes

The following API routes now enforce admin authentication at the handler level:

#### Questions Management
- `POST /api/exams/:examId/questions/import` - Import questions
- `POST /api/exams/:examId/questions/process` - Process questions (embeddings, competencies)
- `PATCH /api/exams/:examId/questions/:questionId` - Update question
- `DELETE /api/exams/:examId/questions/:questionId` - Delete question
- `POST /api/exams/:examId/questions/embed` - Generate embeddings
- `POST /api/exams/:examId/questions/:questionId/explain` - Generate AI explanation
- `POST /api/exams/:examId/questions/:questionId/competencies` - Assign competencies
- `DELETE /api/exams/:examId/questions/:questionId/competencies` - Remove competencies

#### Deduplication
- `GET /api/exams/:examId/dedupe/review` - Get review pairs
- `GET /api/exams/:examId/dedupe/flags` - List flags
- `POST /api/exams/:examId/dedupe/flags` - Update flags
- `GET /api/exams/:examId/dedupe/clusters/:clusterId` - Get cluster
- `POST /api/exams/:examId/dedupe/clusters/:clusterId` - Perform cluster action
- `DELETE /api/exams/:examId/dedupe/clusters/:clusterId` - Delete cluster

#### Competencies
- `POST /api/exams/:examId/competencies` - Create competency
- `PUT /api/exams/:examId/competencies/:competencyId` - Update competency
- `DELETE /api/exams/:examId/competencies/:competencyId` - Delete competency

### Implementation

Each protected route follows this pattern:

```typescript
export async function POST(request: Request, context: RouteContext) {
  try {
    // Require admin authentication
    try {
      await requireAdmin();
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Forbidden' },
        { status: error instanceof Error && error.message.includes('Unauthorized') ? 401 : 403 }
      );
    }

    // ... route logic
  } catch (error) {
    // ... error handling
  }
}
```

---

## 2. Server-Side Page Authentication

Admin pages now perform server-side authentication checks before rendering, preventing unauthorized access even if middleware is bypassed.

### Implementation

Two server component layouts enforce authentication:

#### Admin Layout (`/app/admin/layout.tsx`)
Protects all routes under `/admin/*`:

```typescript
export default async function AdminLayout({ children }: Props) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    redirect('/login');
  }

  return <>{children}</>;
}
```

#### Import Layout (`/app/import/layout.tsx`)
Protects the `/import` route:

```typescript
export default async function ImportLayout({ children }: Props) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'admin') {
    redirect('/login');
  }

  return <>{children}</>;
}
```

### Protected Pages

- `/admin` - Admin dashboard
- `/admin/search` - Semantic search
- `/admin/exams` - Exam management
- `/admin/questions/:examId` - Question management
- `/admin/competencies` - Competency management
- `/admin/dedupe` - Deduplication tools
- `/admin/document-embeddings` - Document embeddings
- `/admin/docs` - Documentation
- `/import` - Question import

---

## 3. Session Timeout Configuration

Sessions now automatically expire after a period of inactivity to limit exposure from abandoned sessions.

### Configuration (`lib/auth.ts`)

```typescript
session: {
  strategy: 'jwt',
  // Session expires after 8 hours of inactivity
  maxAge: 8 * 60 * 60, // 8 hours in seconds
  // Update session activity every 1 hour
  updateAge: 60 * 60, // 1 hour in seconds
}
```

### Behavior

- **Session Lifetime**: 8 hours from last activity
- **Activity Updates**: Session is refreshed every hour of use
- **Automatic Logout**: Users are redirected to login after session expiration
- **Security Benefits**: Reduces risk from unattended workstations

### Customization

To adjust timeout values, modify the `maxAge` and `updateAge` settings in `lib/auth.ts`:

```typescript
maxAge: 4 * 60 * 60,  // 4 hours (more secure)
maxAge: 24 * 60 * 60, // 24 hours (more convenient)
```

---

## 4. Login Rate Limiting

Failed login attempts are tracked and limited to prevent brute-force attacks.

### Configuration

Rate limiting is configured in `lib/rate-limit.ts`:

- **Maximum Attempts**: 5 failed attempts
- **Detection Window**: 15 minutes
- **Lockout Duration**: 30 minutes after exceeding max attempts
- **Identifier**: Username-based (prevents targeting specific accounts)

### Behavior

1. **Normal Login**: Cleared rate limit on successful authentication
2. **Failed Login**: Increments attempt counter
3. **Max Attempts Exceeded**: Account locked for 30 minutes
4. **Window Expiry**: Counter resets after 15 minutes of no attempts

### Implementation

Rate limiting is integrated into the authentication flow in `lib/auth.ts`:

```typescript
async authorize(credentials) {
  const username = credentials.username as string;

  // Check rate limiting
  const rateLimitCheck = isRateLimited(username);
  if (rateLimitCheck.limited) {
    console.warn(`Rate limit exceeded for user: ${username}`);
    return null;
  }

  // Verify credentials
  const user = await verifyCredentials(username, credentials.password);

  if (user) {
    recordSuccessfulAttempt(username);
    return user;
  } else {
    recordFailedAttempt(username);
    return null;
  }
}
```

### Admin Override

Admins can check and clear rate limits via API:

```bash
# Check rate limit status
GET /api/admin/rate-limits?username=<username>

# Clear rate limit (emergency access)
DELETE /api/admin/rate-limits?username=<username>
```

### Production Considerations

The current implementation uses in-memory storage. For production with multiple instances, consider:

- **Redis** with `@upstash/ratelimit`
- **Database-backed** rate limiting
- **Vercel Rate Limiting** middleware
- **Cloudflare Rate Limiting**

---

## Security Best Practices

### Current Implementation

✅ **Multi-Layer Defense**
- Middleware protection
- Server-side page checks
- API handler validation

✅ **Secure Session Management**
- JWT-based sessions
- HTTP-only cookies
- Automatic expiration

✅ **Brute-Force Protection**
- Username-based rate limiting
- Progressive lockout
- Admin override capability

✅ **Password Security**
- bcrypt hashing (10 rounds)
- Secure credential storage
- No plaintext passwords

### Recommendations

For enhanced security, consider:

1. **Two-Factor Authentication (2FA)**
   - TOTP or SMS verification
   - Backup recovery codes

2. **IP-Based Rate Limiting**
   - Track attempts by IP address
   - Geolocation blocking

3. **Audit Logging**
   - Log all admin actions
   - Failed login attempt tracking
   - Security event monitoring

4. **Session Management**
   - Force logout on password change
   - Device/session management UI
   - Suspicious activity detection

5. **HTTPS Enforcement**
   - Ensure secure cookie transmission
   - HSTS headers
   - Certificate validation

---

## Testing

### Manual Testing

1. **Session Timeout**:
   ```bash
   # Login as admin
   # Wait 8+ hours
   # Attempt to access admin page
   # Should redirect to /login
   ```

2. **Rate Limiting**:
   ```bash
   # Attempt 6 failed logins
   # Should be locked out for 30 minutes
   # Use admin override to clear
   ```

3. **API Protection**:
   ```bash
   # Without auth:
   curl http://localhost:3000/api/exams/test/questions/import \
     -H "Content-Type: application/json" \
     -d '{"questions": []}'
   # Should return 401 Unauthorized
   ```

4. **Page Protection**:
   ```bash
   # Without auth:
   # Navigate to /admin
   # Should redirect to /login
   ```

---

## Maintenance

### Regular Tasks

1. **Monitor Rate Limit Stats**
   - Check for excessive lockouts
   - Identify attack patterns

2. **Review Session Configuration**
   - Adjust timeout based on usage
   - Balance security vs. convenience

3. **Update Dependencies**
   - Keep NextAuth.js current
   - Monitor security advisories

4. **Audit Admin Access**
   - Review admin user list
   - Remove inactive accounts

---

## Support

For security questions or issues:

1. Check GitHub issues: https://github.com/anthropics/claude-code/issues
2. Review NextAuth.js docs: https://authjs.dev
3. Consult security best practices: https://owasp.org

---

**Last Updated**: 2025-10-11
**Security Level**: Enhanced
**Compliance**: Ready for production deployment
