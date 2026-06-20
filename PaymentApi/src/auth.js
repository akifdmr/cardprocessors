const crypto = require("crypto");
const { query, db } = require("./db");
const env = require("./config/env");

const SESSION_TTL_DAYS = 7;
const SESSION_COOKIE_NAME = "clover_panel_session";
const ROLE_PERMISSIONS = {
  admin: {
    canManageUsers: true,
    canCreateCards: true,
    canListCards: true,
    canCreateEnrollment: true,
    canViewEnrollment: true,
    canUpdateEnrollment: true,
    canRunLiveCheck: true,
    canRunBinCheck: true,
    canRunBalanceCheck: true,
    canViewBalance: true,
    canRunAuthCheck: true,
    canRunProcessorActions: true,
    canViewProcessorDebug: true
  },
  operator: {
    canManageUsers: false,
    canCreateCards: true,
    canListCards: true,
    canCreateEnrollment: true,
    canViewEnrollment: false,
    canUpdateEnrollment: false,
    canRunLiveCheck: true,
    canRunBinCheck: true,
    canRunBalanceCheck: true,
    canViewBalance: false,
    canRunAuthCheck: false,
    canRunProcessorActions: false,
    canViewProcessorDebug: false
  },
  customer: {
    canManageUsers: false,
    canCreateCards: true,
    canListCards: true,
    canCreateEnrollment: false,
    canViewEnrollment: false,
    canUpdateEnrollment: false,
    canRunLiveCheck: false,
    canRunBinCheck: false,
    canRunBalanceCheck: false,
    canViewBalance: false,
    canRunAuthCheck: false,
    canRunProcessorActions: false,
    canViewProcessorDebug: false
  }
};

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, expected] = String(passwordHash).split(":");
  if (!salt || !expected) {
    return false;
  }
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  const actualBuffer = Buffer.from(actual, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getEffectivePermissions(user) {
  const base = ROLE_PERMISSIONS[user.role] || {};
  if (user.role === "admin") {
    return { ...base };
  }

  const canRunBalanceCheck =
    user.role === "customer"
      ? base.canRunBalanceCheck && (user.can_balance_check ?? false)
      : base.canRunBalanceCheck;

  const canViewBalance =
    user.role === "customer"
      ? base.canViewBalance && (user.can_view_balance ?? false)
      : base.canViewBalance;

  return {
    ...base,
    canRunBalanceCheck,
    canViewBalance
  };
}

async function ensureBootstrapAdmin() {
  if (!env.bootstrapAdmin.password) {
    return;
  }

  const existing = await query(
    "select id from users where username = $1",
    [env.bootstrapAdmin.username]
  );

  if (existing.rowCount > 0) {
    const database = await db.getDb();
    await database.collection("users").updateOne(
      { username: env.bootstrapAdmin.username },
      {
        $set: {
          role: "admin",
          can_balance_check: true,
          can_view_balance: true,
          is_active: true,
          updated_at: new Date().toISOString()
        }
      }
    );
    return;
  }

  await query(
    `insert into users (
      username,
      password_hash,
      display_name,
      role,
      can_balance_check,
      can_view_balance,
      is_active
    ) values ($1, $2, $3, 'admin', true, true, true)`,
    [
      env.bootstrapAdmin.username,
      hashPassword(env.bootstrapAdmin.password),
      env.bootstrapAdmin.displayName
    ]
  );
}

async function authenticate(username, password) {
  const result = await query(
    `select
      id,
      username,
      password_hash,
      display_name,
      role,
      can_balance_check,
      can_view_balance,
      is_active
    from users
    where username = $1`,
    [username]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const user = result.rows[0];
  if (!user.is_active || !verifyPassword(password, user.password_hash)) {
    return null;
  }

  return user;
}

async function createSession(userId) {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);

  const result = await query(
    `insert into user_sessions (
      user_id,
      token_hash,
      expires_at
    ) values ($1, $2, datetime('now', '+' || $3 || ' days'))
    returning id, expires_at`,
    [userId, tokenHash, String(SESSION_TTL_DAYS)]
  );

  return {
    token,
    sessionId: result.rows[0].id,
    expiresAt: result.rows[0].expires_at
  };
}

async function findSession(token) {
  const tokenHash = hashSessionToken(token);
  const result = await query(
    `select
      s.id as session_id,
      s.expires_at,
      u.id,
      u.username,
      u.display_name,
      u.role,
      u.can_balance_check,
      u.can_view_balance,
      u.is_active
    from user_sessions s
    join users u on u.id = s.user_id
    where s.token_hash = $1
      and s.revoked_at is null
      and s.expires_at > current_timestamp`,
    [tokenHash]
  );

  return result.rows[0] || null;
}

function extractBearerToken(headerValue) {
  if (!headerValue || !headerValue.startsWith("Bearer ")) {
    return null;
  }
  return headerValue.slice(7).trim();
}

function extractBasicCredentials(headerValue) {
  if (!headerValue || !String(headerValue).startsWith("Basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(String(headerValue).slice(6).trim(), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) {
      return null;
    }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

function extractCookieToken(headerValue) {
  if (!headerValue) {
    return null;
  }

  const cookies = String(headerValue).split(";").map((part) => part.trim());
  const sessionCookie = cookies.find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (!sessionCookie) {
    return null;
  }

  try {
    return decodeURIComponent(sessionCookie.slice(SESSION_COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;
  const basicCredentials = extractBasicCredentials(authorization);
  if (basicCredentials) {
    const user = await authenticate(basicCredentials.username, basicCredentials.password);
    if (!user) {
      res.setHeader("WWW-Authenticate", "Basic realm=\"CardMarket PaymentApi\"");
      return res.status(401).json({ error: "Invalid credentials" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      permissions: getEffectivePermissions(user)
    };
    req.session = {
      id: null,
      expiresAt: null,
      authMode: "basic"
    };
    return next();
  }

  const token = extractBearerToken(authorization) || extractCookieToken(req.headers.cookie);
  if (!token) {
    res.setHeader("WWW-Authenticate", "Basic realm=\"CardMarket PaymentApi\"");
    return res.status(401).json({ error: "Authentication required" });
  }

  const session = await findSession(token);
  if (!session || !session.is_active) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = {
    id: session.id,
    username: session.username,
    displayName: session.display_name,
    role: session.role,
    permissions: getEffectivePermissions(session)
  };
  req.session = {
    id: session.session_id,
    expiresAt: session.expires_at
  };

  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user?.permissions?.[permission]) {
      return res.status(403).json({ error: `Missing permission: ${permission}` });
    }
    next();
  };
}

module.exports = {
  ROLE_PERMISSIONS,
  SESSION_COOKIE_NAME,
  authenticate,
  createSession,
  ensureBootstrapAdmin,
  getEffectivePermissions,
  hashPassword,
  requireAuth,
  requirePermission
};
