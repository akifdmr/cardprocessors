const express = require("express");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const env = require("./config/env");
const { query } = require("./db");
const { encrypt, decrypt } = require("./crypto");
const { getPublicProviderConfig } = require("./providers");
const { validateCardInput } = require("./services/cardValidationService");
const { listAuditLogs, writeAuditLog } = require("./services/auditService");
const maskRoutes = require("./routers/maskRoutes");
const numberRoutes = require("./routers/numberRoutes");
const callRoutes = require("./routers/callRoutes");
const {
  authenticate,
  createSession,
  ensureBootstrapAdmin,
  getEffectivePermissions,
  hashPassword,
  requireAuth,
  requirePermission
} = require("./auth");

const app = express();
app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "CloverApp API",
    version: "1.0.0"
  },
  servers: [
    {
      url: `http://localhost:${env.port}`
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    },
    schemas: {
      LoginRequest: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string" },
          password: { type: "string" }
        }
      },
      CardCreateRequest: {
        type: "object",
        required: ["provider", "providerPaymentToken", "last4", "expMonth", "expYear"],
        properties: {
          provider: { type: "string", enum: ["clover", "paypal"] },
          providerPaymentToken: { type: "string" },
          last4: { type: "string" },
          expMonth: { type: "string" },
          expYear: { type: "string" }
        }
      },
      MaskCreateRequest: {
        type: "object",
        required: ["realFrom", "realTo"],
        properties: {
          realFrom: { type: "string" },
          realTo: { type: "string" }
        }
      },
      ResolveMaskRequest: {
        type: "object",
        required: ["maskedNumber"],
        properties: {
          maskedNumber: { type: "string" }
        }
      },
      NumberAddRequest: {
        type: "object",
        required: ["phoneNumber", "cardId"],
        properties: {
          phoneNumber: { type: "string" },
          cardId: { type: "string" },
          addedBy: { type: "string" },
          isVerified: { type: "boolean" }
        }
      },
      NumberVerifyRequest: {
        type: "object",
        required: ["numberId", "code"],
        properties: {
          numberId: { type: "string" },
          code: { type: "string" }
        }
      },
      CardValidationRequest: {
        type: "object",
        required: ["pan", "expMonth", "expYear"],
        properties: {
          pan: { type: "string" },
          expMonth: { type: "string" },
          expYear: { type: "string" },
          cardholderName: { type: "string" },
          billingZip: { type: "string" }
        }
      },
      ProviderVerificationRequest: {
        type: "object",
        required: ["provider", "verificationStatus"],
        properties: {
          provider: { type: "string", enum: ["clover", "paypal"] },
          verificationStatus: { type: "string", enum: ["pending", "verified", "declined", "review"] },
          providerReferenceId: { type: "string" },
          avsResult: { type: "string" },
          authResultCode: { type: "string" },
          notes: { type: "string" }
        }
      }
    }
  },
  paths: {
    "/auth/login": {
      post: {
        summary: "Login",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" }
            }
          }
        },
        responses: {
          200: { description: "Authenticated" }
        }
      }
    },
    "/cards": {
      get: {
        summary: "List cards",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Card list" } }
      },
      post: {
        summary: "Create card",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CardCreateRequest" }
            }
          }
        },
        responses: { 201: { description: "Created" } }
      }
    },
    "/cards/validate-input": {
      post: {
        summary: "Run local card-input validation without storing PAN",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CardValidationRequest" }
            }
          }
        },
        responses: { 200: { description: "Validation result" } }
      }
    },
    "/cards/{cardId}/provider-verification": {
      post: {
        summary: "Record provider-side verification outcome for a stored tokenized card",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "cardId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ProviderVerificationRequest" }
            }
          }
        },
        responses: { 200: { description: "Verification recorded" } }
      }
    },
    "/audit-logs": {
      get: {
        summary: "List audit logs",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Audit log list" } }
      }
    },
    "/api/masks/create": {
      post: {
        summary: "Create masked numbers",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MaskCreateRequest" }
            }
          }
        },
        responses: { 200: { description: "Mask created" } }
      }
    },
    "/api/masks/resolve": {
      post: {
        summary: "Resolve masked number",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ResolveMaskRequest" }
            }
          }
        },
        responses: { 200: { description: "Resolved" } }
      }
    },
    "/api/numbers/add": {
      post: {
        summary: "Add phone number to card",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NumberAddRequest" }
            }
          }
        },
        responses: { 201: { description: "Created" } }
      }
    },
    "/api/numbers/verify": {
      post: {
        summary: "Verify phone number",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NumberVerifyRequest" }
            }
          }
        },
        responses: { 200: { description: "Verified" } }
      }
    },
    "/api/numbers/card/{cardId}": {
      get: {
        summary: "List numbers for card",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "cardId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: { 200: { description: "Card numbers" } }
      }
    },
    "/api/numbers/all": {
      get: {
        summary: "List all numbers",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "All numbers" } }
      }
    },
    "/api/calls/initiate": {
      post: {
        summary: "Initiate provider call using masked routing",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/MaskCreateRequest" }
            }
          }
        },
        responses: { 200: { description: "Call started" } }
      }
    }
  }
};

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function serializeRawResponse(rawResponse) {
  if (rawResponse == null) {
    return null;
  }

  if (typeof rawResponse === "string") {
    return rawResponse;
  }

  return JSON.stringify(rawResponse);
}

function deserializeRawResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== "string") {
    return rawResponse;
  }

  try {
    return JSON.parse(rawResponse);
  } catch {
    return rawResponse;
  }
}

app.get("/health", asyncHandler(async (_req, res) => {
  await query("select 1");
  res.json({ ok: true });
}));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.post("/auth/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  const user = await authenticate(username, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const session = await createSession(user.id);
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      permissions: getEffectivePermissions(user)
    }
  });
}));

app.get("/auth/me", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    displayName: req.user.displayName,
    role: req.user.role,
    permissions: req.user.permissions,
    session: req.session
  });
});

app.get("/audit-logs", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const logs = await listAuditLogs({
    entityType: req.query.entityType || null,
    entityId: req.query.entityId || null,
    limit: Number(req.query.limit || 100)
  });

  res.json(logs);
}));

app.get("/users", requireAuth, requirePermission("canManageUsers"), asyncHandler(async (_req, res) => {
  const result = await query(
    `select
      id,
      username,
      display_name,
      role,
      can_balance_check,
      can_view_balance,
      is_active,
      created_at,
      updated_at
    from users
    order by created_at desc`
  );

  res.json(result.rows);
}));

app.post("/users", requireAuth, requirePermission("canManageUsers"), asyncHandler(async (req, res) => {
  const {
    username,
    password,
    displayName,
    role,
    canBalanceCheck = false,
    canViewBalance = false,
    isActive = true
  } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: "username, password and role are required" });
  }

  if (!["admin", "operator", "customer"].includes(role)) {
    return res.status(400).json({ error: "Unsupported role" });
  }

  const result = await query(
    `insert into users (
      username,
      password_hash,
      display_name,
      role,
      can_balance_check,
      can_view_balance,
      is_active
    ) values ($1, $2, $3, $4, $5, $6, $7)
    returning id`,
    [
      username,
      hashPassword(password),
      displayName || null,
      role,
      Boolean(canBalanceCheck),
      Boolean(canViewBalance),
      Boolean(isActive)
    ]
  );

  res.status(201).json({ id: result.rows[0].id });
}));

app.get("/config/providers", requireAuth, (_req, res) => {
  res.json(getPublicProviderConfig());
});

app.get("/cards", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  const result = await query(
    `select
      id,
      provider,
      provider_customer_id,
      provider_payment_token,
      masked_pan,
      first6,
      last4,
      brand,
      exp_month,
      exp_year,
      cardholder_name,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip,
      billing_country,
      auth_check_limit,
      is_enrolled,
      verification_status,
      avs_result,
      auth_result_code,
      provider_reference_id,
      notes,
      created_at,
      updated_at
    from cards
    order by created_at desc`
  );
  res.json(result.rows);
}));

app.post("/cards", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const {
    provider,
    providerCustomerId,
    providerPaymentToken,
    maskedPan,
    first6,
    last4,
    brand,
    expMonth,
    expYear,
    cardholderName,
    billingAddressLine1,
    billingAddressLine2,
    billingCity,
    billingState,
    billingZip,
    billingCountry,
    authCheckLimit,
    verificationStatus,
    avsResult,
    authResultCode,
    providerReferenceId,
    notes,
    isEnrolled = false
  } = req.body;

  if (!provider || !providerPaymentToken || !last4 || !expMonth || !expYear) {
    return res.status(400).json({
      error: "provider, providerPaymentToken, last4, expMonth and expYear are required"
    });
  }

  const result = await query(
    `insert into cards (
      provider,
      provider_customer_id,
      provider_payment_token,
      masked_pan,
      first6,
      last4,
      brand,
      exp_month,
      exp_year,
      cardholder_name,
      billing_address_line1,
      billing_address_line2,
      billing_city,
      billing_state,
      billing_zip,
      billing_country,
      auth_check_limit,
      is_enrolled,
      verification_status,
      avs_result,
      auth_result_code,
      provider_reference_id,
      notes
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23
    )
    returning id`,
    [
      provider,
      providerCustomerId || null,
      providerPaymentToken,
      maskedPan || `**** **** **** ${last4}`,
      first6 || null,
      last4,
      brand || null,
      expMonth,
      expYear,
      cardholderName || null,
      billingAddressLine1 || null,
      billingAddressLine2 || null,
      billingCity || null,
      billingState || null,
      billingZip || null,
      billingCountry || null,
      authCheckLimit || null,
      isEnrolled,
      verificationStatus || "pending",
      avsResult || null,
      authResultCode || null,
      providerReferenceId || null,
      notes || null
    ]
  );

  await writeAuditLog({
    entityType: "card",
    entityId: result.rows[0].id,
    action: "card_saved",
    status: "success",
    actorUserId: req.user.id,
    details: {
      provider,
      last4,
      expMonth,
      expYear
    }
  });

  res.status(201).json({ id: result.rows[0].id });
}));

app.post("/cards/validate-input", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const {
    pan,
    expMonth,
    expYear,
    cardholderName,
    billingZip
  } = req.body;

  const validation = validateCardInput({
    pan,
    expMonth,
    expYear,
    cardholderName,
    billingZip
  });

  await writeAuditLog({
    entityType: "card_intake",
    action: "local_validation",
    status: validation.isValid ? "passed" : "failed",
    actorUserId: req.user.id,
    details: {
      brand: validation.brand,
      first6: validation.first6,
      last4: validation.last4,
      issues: validation.issues
    }
  });

  res.json({
    isValid: validation.isValid,
    maskedPan: validation.maskedPan,
    first6: validation.first6,
    last4: validation.last4,
    brand: validation.brand,
    issues: validation.issues
  });
}));

app.post("/cards/:cardId/provider-verification", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const {
    provider,
    verificationStatus,
    providerReferenceId,
    avsResult,
    authResultCode,
    notes
  } = req.body;

  if (!provider || !["clover", "paypal"].includes(provider)) {
    return res.status(400).json({ error: "provider must be clover or paypal" });
  }

  if (!verificationStatus || !["pending", "verified", "declined", "review"].includes(verificationStatus)) {
    return res.status(400).json({ error: "Unsupported verificationStatus" });
  }

  await query(
    `update cards
    set
      verification_status = $1,
      avs_result = $2,
      auth_result_code = $3,
      provider_reference_id = $4,
      notes = coalesce($5, notes),
      updated_at = current_timestamp
    where id = $6`,
    [
      verificationStatus,
      avsResult || null,
      authResultCode || null,
      providerReferenceId || null,
      notes || null,
      req.params.cardId
    ]
  );

  await writeAuditLog({
    entityType: "card",
    entityId: req.params.cardId,
    action: "provider_verification_recorded",
    status: verificationStatus,
    actorUserId: req.user.id,
    details: {
      provider,
      providerReferenceId: providerReferenceId || null,
      avsResult: avsResult || null,
      authResultCode: authResultCode || null
    }
  });

  res.json({
    success: true,
    cardId: req.params.cardId,
    verificationStatus
  });
}));

app.post("/cards/:cardId/checks", requireAuth, asyncHandler(async (req, res) => {
  const {
    provider,
    attemptType,
    status = "queued",
    amount,
    currency = "USD",
    providerReferenceId,
    rawResponse,
    balanceAmount
  } = req.body;

  const permissionMap = {
    live_check: "canRunLiveCheck",
    bin_check: "canRunBinCheck",
    balance_check: "canRunBalanceCheck",
    auth_check: "canRunAuthCheck"
  };

  const permission = permissionMap[attemptType];
  if (!permission) {
    return res.status(400).json({ error: "Unsupported attemptType" });
  }

  if (!req.user.permissions[permission]) {
    return res.status(403).json({ error: `Missing permission: ${permission}` });
  }

  if (!provider || !["clover", "paypal"].includes(provider)) {
    return res.status(400).json({ error: "provider must be clover or paypal" });
  }

  const storedRawResponse = serializeRawResponse(rawResponse);
  const result = await query(
    `insert into verification_attempts (
      card_id,
      provider,
      attempt_type,
      status,
      amount,
      currency,
      provider_reference_id,
      raw_response,
      balance_amount,
      created_by_user_id
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    returning id, created_at`,
    [
      req.params.cardId,
      provider,
      attemptType,
      status,
      amount || null,
      currency,
      providerReferenceId || null,
      storedRawResponse,
      balanceAmount || null,
      req.user.id
    ]
  );

  const response = {
    id: result.rows[0].id,
    createdAt: result.rows[0].created_at,
    status
  };

  if (attemptType === "balance_check" && req.user.permissions.canViewBalance) {
    response.balanceAmount = balanceAmount || null;
  }

  res.status(201).json(response);
}));

app.get("/cards/:cardId/checks", requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    `select
      id,
      provider,
      attempt_type,
      status,
      amount,
      currency,
      provider_reference_id,
      raw_response,
      balance_amount,
      created_by_user_id,
      created_at
    from verification_attempts
    where card_id = $1
    order by created_at desc`,
    [req.params.cardId]
  );

  const rows = result.rows.map((row) => {
    const normalizedRow = {
      ...row,
      raw_response: deserializeRawResponse(row.raw_response)
    };

    if (row.attempt_type === "balance_check" && !req.user.permissions.canViewBalance) {
      return {
        ...normalizedRow,
        balance_amount: null
      };
    }
    return normalizedRow;
  });

  res.json(rows);
}));

app.get("/cards/:cardId/enrollment", requireAuth, requirePermission("canViewEnrollment"), asyncHandler(async (req, res) => {
  const result = await query(
    `select
      id,
      card_id,
      enroll_bank_url,
      username_encrypted,
      password_encrypted,
      holder_ssn_last4,
      holder_ssn_encrypted,
      holder_dob_encrypted,
      free_text_encrypted,
      created_at,
      updated_at
    from enrollment_profiles
    where card_id = $1`,
    [req.params.cardId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: "Enrollment profile not found" });
  }

  const row = result.rows[0];
  res.json({
    id: row.id,
    cardId: row.card_id,
    enrollBankUrl: row.enroll_bank_url,
    username: decrypt(row.username_encrypted),
    password: decrypt(row.password_encrypted),
    holderSsnLast4: row.holder_ssn_last4,
    holderSsn: decrypt(row.holder_ssn_encrypted),
    holderDob: decrypt(row.holder_dob_encrypted),
    freeText: decrypt(row.free_text_encrypted),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  });
}));

app.post("/cards/:cardId/enrollment", requireAuth, asyncHandler(async (req, res) => {
  const {
    enrollBankUrl,
    username,
    password,
    holderSsn,
    holderDob,
    freeText
  } = req.body;

  if (!enrollBankUrl) {
    return res.status(400).json({ error: "enrollBankUrl is required" });
  }

  const existing = await query(
    "select id from enrollment_profiles where card_id = $1",
    [req.params.cardId]
  );

  if (existing.rowCount > 0 && !req.user.permissions.canUpdateEnrollment) {
    return res.status(403).json({
      error: "Existing enrollment records can only be updated by admin"
    });
  }

  if (existing.rowCount === 0 && !req.user.permissions.canCreateEnrollment) {
    return res.status(403).json({ error: "Missing permission: canCreateEnrollment" });
  }

  const result = await query(
    `insert into enrollment_profiles (
      card_id,
      enroll_bank_url,
      username_encrypted,
      password_encrypted,
      holder_ssn_last4,
      holder_ssn_encrypted,
      holder_dob_encrypted,
      free_text_encrypted
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (card_id) do update set
      enroll_bank_url = excluded.enroll_bank_url,
      username_encrypted = excluded.username_encrypted,
      password_encrypted = excluded.password_encrypted,
      holder_ssn_last4 = excluded.holder_ssn_last4,
      holder_ssn_encrypted = excluded.holder_ssn_encrypted,
      holder_dob_encrypted = excluded.holder_dob_encrypted,
      free_text_encrypted = excluded.free_text_encrypted,
      updated_at = current_timestamp
    returning id`,
    [
      req.params.cardId,
      enrollBankUrl,
      encrypt(username),
      encrypt(password),
      holderSsn ? String(holderSsn).slice(-4) : null,
      encrypt(holderSsn),
      encrypt(holderDob),
      encrypt(freeText)
    ]
  );

  await query(
    "update cards set is_enrolled = true, updated_at = current_timestamp where id = $1",
    [req.params.cardId]
  );

  res.status(201).json({ id: result.rows[0].id });
}));

app.use("/api/masks", requireAuth, maskRoutes);
app.use("/api/numbers", requireAuth, numberRoutes);
app.use("/api/calls", requireAuth, callRoutes);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Internal server error" });
});

app.get("*", (_req, res) => {
  res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
});

ensureBootstrapAdmin()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`Server listening on port ${env.port}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
