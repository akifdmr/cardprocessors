const express = require("express");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const env = require("./config/env");
const { query } = require("./db");
const { encrypt, decrypt } = require("./crypto");
const { getPublicProviderConfig } = require("./providers");
const { validateCardInput } = require("./services/cardValidationService");
const { listAuditLogs, writeAuditLog } = require("./services/auditService");
const cloverService = require("./services/cloverService");
const paypalService = require("./services/paypalService");
const providerRouter = require("./services/providerRouter");
const twilioVoiceService = require("./services/twilioVoiceService");
const numberService = require("./services/numberService");
const { getProviderMessage, isAxiosError, toSafeErrorLog } = require("./utils/errorUtils");
const maskRoutes = require("./routers/maskRoutes");
const numberRoutes = require("./routers/numberRoutes");
const callRoutes = require("./routers/callRoutes");
const {
  SESSION_COOKIE_NAME,
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
app.use(express.urlencoded({ extended: false }));
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
      },
      CloverPreAuthRequest: {
        type: "object",
        required: ["source", "amount"],
        properties: {
          source: {
            type: "string",
            description: "Tokenized Clover payment source"
          },
          amount: {
            type: "integer",
            description: "Amount in cents"
          },
          currency: {
            type: "string",
            default: "usd"
          }
        }
      },
      CloverRefundRequest: {
        type: "object",
        required: ["orderId", "amount"],
        properties: {
          orderId: { type: "string" },
          amount: {
            type: "integer",
            description: "Refund amount in cents"
          },
          currency: {
            type: "string",
            default: "usd"
          }
        }
      },
      CloverVoidRequest: {
        type: "object",
        required: ["paymentId"],
        properties: {
          paymentId: { type: "string" },
          voidReason: {
            type: "string",
            default: "USER_CANCEL"
          }
        }
      },
      CallInitiateRequest: {
        type: "object",
        required: ["realFrom", "realTo"],
        properties: {
          realFrom: { type: "string" },
          realTo: { type: "string" }
        }
      },
      PayPalManagerInquiryRequest: {
        type: "object",
        properties: {
          origId: { type: "string" },
          custRef: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" }
        }
      },
      PayPalCardCheckRequest: {
        type: "object",
        required: ["cardId", "pan", "expMonth", "expYear"],
        properties: {
          cardId: { type: "string" },
          pan: { type: "string" },
          expMonth: { type: "string" },
          expYear: { type: "string" },
          cvv2: { type: "string" },
          amount: { type: "number" },
          cardholderName: { type: "string" },
          billingAddressLine1: { type: "string" },
          billingZip: { type: "string" },
          invoiceNumber: { type: "string" },
          comment: { type: "string" }
        }
      },
      PayPalCaptureRequest: {
        type: "object",
        required: ["amount"],
        properties: {
          cardId: { type: "string" },
          authorizationPnref: { type: "string" },
          amount: { type: "number" },
          captureComplete: { type: "boolean" }
        }
      }
    }
  },
  paths: {
    "/api/auth/login": {
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
    "/api/cards": {
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
    "/api/cards/validate-input": {
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
    "/api/cards/{cardId}/provider-verification": {
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
    "/api/audit-logs": {
      get: {
        summary: "List audit logs",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Audit log list" } }
      }
    },
    "/api/provider-router/status": {
      get: {
        summary: "Get voice provider router status",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Provider router status" } }
      }
    },
    "/api/providers/twilio/test": {
      get: {
        summary: "Test Twilio account credentials and call configuration",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Twilio connection status" } }
      }
    },
    "/api/providers/clover/test": {
      get: {
        summary: "Test Clover connection",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Clover connection status" } }
      }
    },
    "/api/providers/clover/merchant": {
      get: {
        summary: "Get Clover merchant info",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Clover merchant" } }
      }
    },
    "/api/providers/clover/orders": {
      get: {
        summary: "List Clover orders",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Clover orders" } }
      }
    },
    "/api/providers/clover/payments": {
      get: {
        summary: "List Clover payments",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Clover payments" } }
      }
    },
    "/api/providers/clover/preauth": {
      post: {
        summary: "Create a Clover pre-authorization using a tokenized source",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CloverPreAuthRequest" }
            }
          }
        },
        responses: { 200: { description: "Clover pre-authorization result" } }
      }
    },
    "/api/providers/clover/refund": {
      post: {
        summary: "Create a Clover refund for a settled order",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CloverRefundRequest" }
            }
          }
        },
        responses: { 200: { description: "Clover refund result" } }
      }
    },
    "/api/providers/clover/void": {
      post: {
        summary: "Void a Clover payment using device APIs",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CloverVoidRequest" }
            }
          }
        },
        responses: { 200: { description: "Clover void result" } }
      }
    },
    "/api/providers/clover/tenders": {
      get: {
        summary: "List Clover tenders",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Clover tenders" } }
      }
    },
    "/api/providers/paypal/rest/test": {
      get: {
        summary: "Test PayPal REST OAuth credentials",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "PayPal REST connection status" } }
      }
    },
    "/api/providers/paypal/manager/status": {
      get: {
        summary: "Get PayPal Manager configuration status",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "PayPal Manager configuration status" } }
      }
    },
    "/api/providers/paypal/manager/test": {
      post: {
        summary: "Probe PayPal Manager credentials with a non-monetary inquiry request",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "PayPal Manager credential probe result" } }
      }
    },
    "/api/providers/paypal/manager/inquiry": {
      post: {
        summary: "Run a PayPal Manager transaction inquiry by PNREF or CUSTREF",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PayPalManagerInquiryRequest" }
            }
          }
        },
        responses: { 200: { description: "PayPal Manager inquiry result" } }
      }
    },
    "/api/providers/paypal/manager/cards/live-check": {
      post: {
        summary: "Run a PayPal Manager live card check without storing PAN or CVV",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PayPalCardCheckRequest" }
            }
          }
        },
        responses: { 200: { description: "PayPal Manager live check result" } }
      }
    },
    "/api/providers/paypal/manager/cards/bin-check": {
      post: {
        summary: "Run a PayPal card BIN check without storing PAN or CVV",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PayPalCardCheckRequest" }
            }
          }
        },
        responses: { 200: { description: "PayPal BIN check result" } }
      }
    },
    "/api/providers/paypal/manager/cards/auth": {
      post: {
        summary: "Authorize a card with PayPal Manager and store the PNREF for later capture",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PayPalCardCheckRequest" }
            }
          }
        },
        responses: { 200: { description: "PayPal Manager authorization result" } }
      }
    },
    "/api/providers/paypal/manager/cards/capture": {
      post: {
        summary: "Capture a previous PayPal Manager authorization by PNREF or latest card auth",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PayPalCaptureRequest" }
            }
          }
        },
        responses: { 200: { description: "PayPal Manager capture result" } }
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
              schema: { $ref: "#/components/schemas/CallInitiateRequest" }
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

function getSessionCookieParts({ token = "", maxAgeSeconds = 0 } = {}) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Strict",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (env.nodeEnv === "production") {
    parts.push("Secure");
  }

  return parts;
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", getSessionCookieParts({
    token,
    maxAgeSeconds: 7 * 24 * 60 * 60
  }).join("; "));
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", getSessionCookieParts({
    token: "",
    maxAgeSeconds: 0
  }).join("; "));
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

function serializeCardForList(card) {
  return {
    id: card.id,
    provider: card.provider,
    first6: card.first6,
    pan: decrypt(card.pan_encrypted),
    masked_pan: card.masked_pan,
    last4: card.last4,
    brand: card.brand,
    exp_month: card.exp_month,
    exp_year: card.exp_year,
    cardholder_name: card.cardholder_name,
    billing_address_line1: card.billing_address_line1,
    billing_city: card.billing_city,
    billing_state: card.billing_state,
    billing_zip: card.billing_zip,
    billing_country: card.billing_country,
    auth_check_limit: card.auth_check_limit,
    is_enrolled: Boolean(card.is_enrolled),
    verification_status: card.verification_status,
    masking_number: card.masking_number,
    masking_number_verified: Boolean(card.masking_number_verified),
    created_at: card.created_at,
    updated_at: card.updated_at
  };
}

function escapeXml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function ensureCardExists(cardId) {
  const result = await query("select id from cards where id = $1", [cardId]);
  if (result.rowCount === 0) {
    const error = new Error("Card not found");
    error.statusCode = 404;
    throw error;
  }
}

function getSavedCardId(cardId) {
  if (!cardId || cardId === "__manual") {
    return null;
  }
  return cardId;
}

async function getLatestPayPalAuthPnref(cardId) {
  const result = await query(
    `select provider_reference_id
    from verification_attempts
    where card_id = $1
      and provider = 'paypal'
      and attempt_type = 'auth_check'
      and status = 'approved'
      and provider_reference_id is not null
    order by created_at desc
    limit 1`,
    [cardId]
  );

  return result.rows[0]?.provider_reference_id || null;
}

function requirePayPalManagerConfigured(res) {
  const status = paypalService.getManagerStatus();
  if (!status.configured) {
    res.status(400).json({
      error: "PayPal Manager configuration is incomplete",
      missing: status.missing
    });
    return false;
  }

  return true;
}

function requirePayPalNvpConfigured(res) {
  const status = paypalService.getNvpStatus();
  if (!status.configured) {
    res.status(400).json({
      error: "PayPal NVP/SOAP configuration is incomplete",
      missing: status.missing
    });
    return false;
  }

  return true;
}

app.get("/health", asyncHandler(async (_req, res) => {
  await query("select 1");
  res.json({ ok: true });
}));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }

  const user = await authenticate(username, password);
  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const session = await createSession(user.id);
  setSessionCookie(res, session.token);
  res.json({
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

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    id: req.user.id,
    username: req.user.username,
    displayName: req.user.displayName,
    role: req.user.role,
    permissions: req.user.permissions,
    session: req.session
  });
});

app.get("/api/provider-router/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json({
    primaryProvider: process.env.PRIMARY_PROVIDER || "TWILIO",
    providers: Object.entries(providerRouter.providers).map(([key, provider]) => ({
      key,
      name: provider.name,
      supportsUnverified: provider.supportsUnverified
    })),
    browserVoice: twilioVoiceService.getVoiceStatus()
  });
}));

app.get("/api/voice/token", requireAuth, requirePermission("canRunLiveCheck"), asyncHandler(async (req, res) => {
  res.json(twilioVoiceService.createVoiceAccessToken(req.user.username));
}));

app.all("/api/voice/twiml", asyncHandler(async (req, res) => {
  const cardId = req.body.cardId || req.query.cardId;
  const realTo = req.body.realTo || req.query.realTo || req.body.To || req.query.To;

  if (!cardId || !realTo) {
    res.type("text/xml").status(400).send("<Response><Reject/></Response>");
    return;
  }

  const cardNumber = await numberService.getPrimaryNumberByCard(cardId);
  if (!cardNumber) {
    res.type("text/xml").status(404).send("<Response><Reject/></Response>");
    return;
  }

  const callerId = cardNumber.phoneNumber;

  if (!callerId) {
    res.type("text/xml").status(400).send("<Response><Reject/></Response>");
    return;
  }

  res.type("text/xml").send(
    `<Response><Dial callerId="${escapeXml(callerId)}"><Number>${escapeXml(realTo)}</Number></Dial></Response>`
  );
}));

app.get("/api/providers/twilio/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const result = await providerRouter.testTwilioConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "twilio",
    action: "twilio_connection_test",
    status: result.ok ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      configured: result.configured,
      missing: result.missing || [],
      status: result.status || null,
      type: result.type || null,
      fromNumber: result.fromNumber || null
    }
  });
  res.status(result.ok ? 200 : 400).json(result);
}));

app.get("/api/providers/clover/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const result = await cloverService.testConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_connection_test",
    status: "success",
    actorUserId: req.user.id,
    details: result
  });
  res.json(result);
}));

app.get("/api/providers/clover/merchant", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const merchant = await cloverService.getMerchant();
  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_merchant_fetch",
    status: "success",
    actorUserId: req.user.id,
    details: {
      merchantId: merchant.id,
      merchantName: merchant.name
    }
  });
  res.json(merchant);
}));

app.get("/api/providers/clover/orders", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 20);
  const orders = await cloverService.listOrders(limit);
  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_orders_fetch",
    status: "success",
    actorUserId: req.user.id,
    details: { limit }
  });
  res.json(orders);
}));

app.get("/api/providers/clover/payments", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit || 20);
  const payments = await cloverService.listPayments(limit);
  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_payments_fetch",
    status: "success",
    actorUserId: req.user.id,
    details: { limit }
  });
  res.json(payments);
}));

app.post("/api/providers/clover/preauth", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const {
    source,
    amount,
    currency = "usd"
  } = req.body;

  const result = await cloverService.createPreAuthorization({
    source,
    amount: Number(amount),
    currency
  });

  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_preauth_create",
    status: "success",
    actorUserId: req.user.id,
    details: {
      amount: Number(amount),
      currency: String(currency).toLowerCase(),
      cloverChargeId: result.id || null,
      paid: result.paid ?? null,
      captured: result.captured ?? null
    }
  });

  res.json(result);
}));

app.post("/api/providers/clover/refund", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const {
    orderId,
    amount,
    currency = "usd"
  } = req.body;

  const result = await cloverService.refundOrder({
    orderId,
    amount: Number(amount),
    currency
  });

  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_refund_create",
    status: "success",
    actorUserId: req.user.id,
    details: {
      orderId,
      amount: Number(amount),
      currency: String(currency).toLowerCase()
    }
  });

  res.json(result);
}));

app.post("/api/providers/clover/void", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const {
    paymentId,
    voidReason = "USER_CANCEL"
  } = req.body;

  const result = await cloverService.voidPayment({
    paymentId,
    voidReason
  });

  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_void_create",
    status: "success",
    actorUserId: req.user.id,
    details: {
      paymentId,
      voidReason
    }
  });

  res.json(result);
}));

app.get("/api/providers/clover/tenders", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const tenders = await cloverService.listTenders();
  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_tenders_fetch",
    status: "success",
    actorUserId: req.user.id,
    details: {
      count: Array.isArray(tenders.elements) ? tenders.elements.length : null
    }
  });
  res.json(tenders);
}));

app.get("/api/providers/paypal/rest/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const result = await paypalService.testRestConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "paypal",
    action: "paypal_rest_connection_test",
    status: "success",
    actorUserId: req.user.id,
    details: result
  });
  res.json(result);
}));

app.get("/api/providers/paypal/manager/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json({
    manager: paypalService.getManagerStatus(),
    nvp: paypalService.getNvpStatus()
  });
}));

app.post("/api/providers/paypal/manager/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requirePayPalManagerConfigured(res)) {
    return;
  }

  const result = await paypalService.testManagerConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "paypal-manager",
    action: "paypal_manager_connection_test",
    status: result.ok ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      resultCode: result.resultCode,
      responseMessage: result.responseMessage
    }
  });
  res.json(result);
}));

app.post("/api/providers/paypal/nvp/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requirePayPalNvpConfigured(res)) {
    return;
  }

  const result = await paypalService.testNvpConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "paypal-nvp",
    action: "paypal_nvp_connection_test",
    status: result.ok ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      correlationId: result.correlationId
    }
  });
  res.json(result);
}));

app.post("/api/providers/paypal/manager/inquiry", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requirePayPalManagerConfigured(res)) {
    return;
  }

  const result = await paypalService.inquireManagerTransaction({
    origId: req.body.origId || null,
    custRef: req.body.custRef || null,
    startTime: req.body.startTime || null,
    endTime: req.body.endTime || null
  });
  await writeAuditLog({
    entityType: "provider",
    entityId: "paypal-manager",
    action: "paypal_manager_inquiry",
    status: result.RESULT === "0" ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      resultCode: result.RESULT || null,
      responseMessage: result.RESPMSG || null,
      pnref: result.PNREF || null
    }
  });
  res.json(result);
}));

app.post("/api/providers/paypal/manager/cards/live-check", requireAuth, requirePermission("canRunLiveCheck"), asyncHandler(async (req, res) => {
  if (!requirePayPalManagerConfigured(res)) {
    return;
  }

  const cardId = getSavedCardId(req.body.cardId);
  if (cardId) {
    await ensureCardExists(cardId);
  }
  const result = await paypalService.liveCheckCard(req.body);

  if (cardId) {
    await query(
      `insert into verification_attempts (
        card_id,
        provider,
        attempt_type,
        status,
        amount,
        currency,
        provider_reference_id,
        raw_response,
        created_by_user_id
      ) values ($1, 'paypal', 'live_check', $2, $3, 'USD', $4, $5, $6)`,
      [
        cardId,
        result.status,
        result.amount,
        result.pnref,
        serializeRawResponse({
          resultCode: result.resultCode,
          responseMessage: result.responseMessage,
          authCode: result.authCode,
          avsAddress: result.avsAddress,
          avsZip: result.avsZip,
          cvv2Match: result.cvv2Match,
          card: result.card
        }),
        req.user.id
      ]
    );
  }

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || "paypal-manual",
    action: "paypal_manager_live_check",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      pnref: result.pnref,
      amount: result.amount,
      card: result.card
    }
  });

  res.json({
    status: result.status,
    resultCode: result.resultCode,
    responseMessage: result.responseMessage,
    pnref: result.pnref,
    authCode: result.authCode,
    avsAddress: result.avsAddress,
    avsZip: result.avsZip,
    cvv2Match: result.cvv2Match,
    amount: result.amount,
    card: result.card
  });
}));

app.post("/api/providers/paypal/manager/cards/bin-check", requireAuth, requirePermission("canRunBinCheck"), asyncHandler(async (req, res) => {
  const cardId = getSavedCardId(req.body.cardId);
  if (cardId) {
    await ensureCardExists(cardId);
  }
  const result = await paypalService.binCheckCard(req.body);

  if (cardId) {
    await query(
      `insert into verification_attempts (
        card_id,
        provider,
        attempt_type,
        status,
        currency,
        raw_response,
        created_by_user_id
      ) values ($1, 'paypal', 'bin_check', $2, 'USD', $3, $4)`,
      [
        cardId,
        result.status,
        serializeRawResponse(result),
        req.user.id
      ]
    );
  }

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || "paypal-manual",
    action: "paypal_bin_check",
    status: result.status,
    actorUserId: req.user.id,
    details: result
  });

  res.json(result);
}));

app.post("/api/providers/paypal/manager/cards/auth", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requirePayPalNvpConfigured(res)) {
    return;
  }

  const cardId = getSavedCardId(req.body.cardId);
  if (cardId) {
    await ensureCardExists(cardId);
  }
  const result = await paypalService.authorizeCardNvp({
    ...req.body,
    ipAddress: req.ip
  });

  if (cardId) {
    await query(
      `insert into verification_attempts (
        card_id,
        provider,
        attempt_type,
        status,
        amount,
        currency,
        provider_reference_id,
        raw_response,
        created_by_user_id
      ) values ($1, 'paypal', 'auth_check', $2, $3, 'USD', $4, $5, $6)`,
      [
        cardId,
        result.status,
        result.amount,
        result.pnref,
        serializeRawResponse({
          processor: result.processor,
          resultCode: result.resultCode,
          responseMessage: result.responseMessage,
          authCode: result.authCode,
          avsAddress: result.avsAddress,
          avsZip: result.avsZip,
          cvv2Match: result.cvv2Match,
          card: result.card
        }),
        req.user.id
      ]
    );

    await query(
      `update cards
      set
        provider = 'paypal',
        provider_reference_id = coalesce($1, provider_reference_id),
        avs_result = coalesce($2, avs_result),
        auth_result_code = coalesce($3, auth_result_code),
        verification_status = $4,
        updated_at = current_timestamp
      where id = $5`,
      [
        result.pnref,
        result.avsZip || result.avsAddress || null,
        result.authCode || result.resultCode || null,
        result.status === "approved" ? "verified" : result.status === "review" ? "review" : "declined",
        cardId
      ]
    );
  }

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || "paypal-manual",
    action: "paypal_nvp_authorize",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      processor: result.processor,
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      authorizationId: result.pnref,
      amount: result.amount,
      card: result.card
    }
  });

  res.json({
    status: result.status,
    resultCode: result.resultCode,
    responseMessage: result.responseMessage,
    authorizationPnref: result.pnref,
    authorizationId: result.pnref,
    processor: result.processor,
    authCode: result.authCode,
    avsAddress: result.avsAddress,
    avsZip: result.avsZip,
    cvv2Match: result.cvv2Match,
    amount: result.amount,
    card: result.card,
    captureReady: result.status === "approved" && Boolean(result.pnref)
  });
}));

app.post("/api/providers/paypal/manager/cards/capture", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requirePayPalNvpConfigured(res)) {
    return;
  }

  const { cardId, amount, captureComplete = true } = req.body;
  let authorizationPnref = req.body.authorizationPnref || null;

  if (!authorizationPnref && cardId) {
    await ensureCardExists(cardId);
    authorizationPnref = await getLatestPayPalAuthPnref(cardId);
  }

  if (!authorizationPnref) {
    return res.status(400).json({
      error: "authorizationPnref is required when no approved PayPal auth exists for cardId"
    });
  }

  const result = await paypalService.captureAuthorizationNvp({
    authorizationPnref,
    amount,
    captureComplete
  });

  await writeAuditLog({
    entityType: "card",
    entityId: cardId || authorizationPnref,
    action: "paypal_nvp_capture",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      processor: result.processor,
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      originalPnref: result.originalPnref,
      capturePnref: result.pnref,
      amount: result.amount,
      captureComplete: result.captureComplete
    }
  });

  res.json({
    status: result.status,
    resultCode: result.resultCode,
    responseMessage: result.responseMessage,
    originalPnref: result.originalPnref,
    capturePnref: result.pnref,
    processor: result.processor,
    authCode: result.authCode,
    amount: result.amount,
    captureComplete: result.captureComplete
  });
}));

app.get("/api/audit-logs", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const logs = await listAuditLogs({
    entityType: req.query.entityType || null,
    entityId: req.query.entityId || null,
    limit: Number(req.query.limit || 100)
  });

  res.json(logs);
}));

app.get("/api/users", requireAuth, requirePermission("canManageUsers"), asyncHandler(async (_req, res) => {
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

app.post("/api/users", requireAuth, requirePermission("canManageUsers"), asyncHandler(async (req, res) => {
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

app.get("/api/config/providers", requireAuth, requirePermission("canListCards"), (_req, res) => {
  res.json(getPublicProviderConfig());
});

app.get("/api/cards", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  const result = await query(
    `select
      id,
      provider,
      provider_customer_id,
      provider_payment_token,
      pan_encrypted,
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
  res.json(result.rows.map(serializeCardForList));
}));

app.post("/api/cards", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
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

  if (!["clover", "paypal"].includes(provider)) {
    return res.status(400).json({ error: "provider must be clover or paypal" });
  }

  const result = await query(
    `insert into cards (
	      provider,
	      provider_customer_id,
	      provider_payment_token,
	      pan_encrypted,
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
      $21, $22, $23, $24
    )
    returning id`,
    [
      provider,
      providerCustomerId || null,
      providerPaymentToken,
      encrypt(req.body.pan),
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

app.post("/api/cards/validate-input", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
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

app.post("/api/cards/:cardId/provider-verification", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
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

  await ensureCardExists(req.params.cardId);

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

app.post("/api/cards/:cardId/checks", requireAuth, asyncHandler(async (req, res) => {
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

  await ensureCardExists(req.params.cardId);

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

app.get("/api/cards/:cardId/checks", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  await ensureCardExists(req.params.cardId);

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

app.get("/api/cards/:cardId/enrollment", requireAuth, requirePermission("canViewEnrollment"), asyncHandler(async (req, res) => {
  await ensureCardExists(req.params.cardId);

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

app.post("/api/cards/:cardId/enrollment", requireAuth, asyncHandler(async (req, res) => {
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

  await ensureCardExists(req.params.cardId);

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
  console.error(toSafeErrorLog(error));
  if (error.statusCode && error.statusCode < 500) {
    return res.status(error.statusCode).json({ error: error.message });
  }

  if (isAxiosError(error)) {
    return res.status(502).json({
      error: "External provider request failed",
      providerStatus: error.response?.status || null,
      providerMessage: getProviderMessage(error)
    });
  }

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
