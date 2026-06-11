const express = require("express");
const crypto = require("crypto");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const { v4: uuidv4 } = require("uuid");
const env = require("./config/env");
const { query, db, getMongoStatus } = require("./db");
const { encrypt, decrypt } = require("./crypto");
const { getPublicProviderConfig } = require("./providers");
const { validateCardInput } = require("./services/cardValidationService");
const { listAuditLogs, writeAuditLog } = require("./services/auditService");
const cloverService = require("./services/cloverService");
const fluidpayService = require("./services/fluidpayService");
const braintreeService = require("./services/braintreeService");
const nmiService = require("./services/nmiService");
const zohoPaymentsService = require("./services/zohoPaymentsService");
const globalPaymentsService = require("./services/globalPaymentsService");
const propelrPayService = require("./services/propelrPayService");
const paypalService = require("./services/paypalService");
const providerRouter = require("./services/providerRouter");
const twilioVoiceService = require("./services/twilioVoiceService");
const numberService = require("./services/numberService");
const unchargebackService = require("./services/unchargebackService");
const burpSuiteService = require("./services/burpSuiteService");
const { getProviderMessage, isAxiosError, toSafeErrorLog } = require("./utils/errorUtils");
const maskRoutes = require("./routers/maskRoutes");
const numberRoutes = require("./routers/numberRoutes");
const callRoutes = require("./routers/callRoutes");
const { createCloverLearningRouter } = require("./api/clover/learning/routes");
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
burpSuiteService.installBurpSuiteIntegration();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.resolve(process.cwd(), "public"), { index: false }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  const shouldAudit = req.path.startsWith("/api/") &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !req.path.startsWith("/api/auth/");

  if (shouldAudit) {
    res.on("finish", () => {
      if (!req.user?.id) return;
      writeAuditLog({
        entityType: "api_request",
        entityId: req.path,
        action: `${req.method} ${req.path}`,
        status: res.statusCode >= 200 && res.statusCode < 400 ? "success" : "failed",
        actorUserId: req.user.id,
        details: redactSensitiveReportData({
          method: req.method,
          path: req.path,
          query: req.query || {},
          body: req.body || {},
          statusCode: res.statusCode,
          durationMs: Date.now() - startedAt
        })
      }).catch((error) => console.error(toSafeErrorLog(error)));
    });
  }

  next();
});

const paymentProcessorHealth = {
  running: false,
  startedAt: null,
  checkedAt: null,
  processors: {}
};

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
          provider: { type: "string", enum: ["clover", "paypal", "fluidpay", "globalpayments", "propelr", "propelrpay", "braintree", "nmi", "zoho"] },
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
          provider: { type: "string", enum: ["clover", "paypal", "fluidpay", "globalpayments", "propelr", "propelrpay", "braintree", "nmi", "zoho"] },
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
      CloverVerifyWithBinRequest: {
        type: "object",
        required: ["source"],
        properties: {
          cardId: { type: "string" },
          source: {
            type: "string",
            description: "Tokenized Clover payment source"
          },
          amount: {
            type: "integer",
            default: 1,
            description: "Verification authorization amount in cents"
          },
          currency: {
            type: "string",
            default: "usd"
          },
          bin: { type: "string" },
          pan: { type: "string" },
          ip: { type: "string" }
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
      },
      PayPalVoidRequest: {
        type: "object",
        properties: {
          cardId: { type: "string" },
          authorizationPnref: { type: "string" },
          note: { type: "string" }
        }
      },
      FluidPayCardTransactionRequest: {
        type: "object",
        required: ["amount"],
        properties: {
          cardId: { type: "string" },
          pan: { type: "string" },
          cardNumber: { type: "string" },
          expMonth: { type: "string" },
          expYear: { type: "string" },
          cvc: { type: "string" },
          token: { type: "string" },
          customerId: { type: "string" },
          paymentMethod: { type: "object" },
          amount: { type: "integer", description: "Amount in cents" },
          currency: { type: "string", default: "USD" },
          processorId: { type: "string" },
          orderId: { type: "string" },
          description: { type: "string" },
          cardholderName: { type: "string" },
          billingAddressLine1: { type: "string" },
          billingCity: { type: "string" },
          billingState: { type: "string" },
          billingZip: { type: "string" },
          billingCountry: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          idempotencyKey: { type: "string" },
          createVaultRecord: { type: "boolean" }
        }
      },
      FluidPayTransactionReferenceRequest: {
        type: "object",
        required: ["transactionId"],
        properties: {
          transactionId: { type: "string" },
          amount: { type: "integer", description: "Amount in cents" },
          surcharge: { type: "integer", description: "Surcharge amount in cents" }
        }
      },
      UnchargebackCreateRequest: {
        type: "object",
        required: ["ownerName", "ownerNumber", "contentPrice"],
        properties: {
          caseId: { type: "string" },
          transactionId: { type: "string" },
          cardId: { type: "string" },
          ownerName: { type: "string" },
          ownerNumber: { type: "string" },
          contentPrice: { type: "number" },
          status: { type: "string" },
          dueDate: { type: "string" },
          notes: { type: "string" }
        }
      },
      UnchargebackEmbedRequest: {
        type: "object",
        required: ["embedHtml"],
        properties: {
          embedHtml: { type: "string", description: "Single iframe embed HTML" }
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
    "/api/providers/clover/cards/verify-with-bin": {
      post: {
        summary: "Run Clover card verification and RapidAPI BIN lookup together",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CloverVerifyWithBinRequest" }
            }
          }
        },
        responses: { 200: { description: "Clover verification and BIN lookup result" } }
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
    "/api/providers/clover/tenders": {
      get: {
        summary: "List Clover tenders",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Clover tenders" } }
      }
    },
    "/api/providers/fluidpay/status": {
      get: {
        summary: "Get FluidPay configuration status",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "FluidPay configuration status" } }
      }
    },
    "/api/providers/fluidpay/test": {
      post: {
        summary: "Test FluidPay API key with a transaction search probe",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "FluidPay connection status" } }
      }
    },
    "/api/providers/fluidpay/cards/sale": {
      post: {
        summary: "Run a FluidPay sale transaction",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FluidPayCardTransactionRequest" }
            }
          }
        },
        responses: { 200: { description: "FluidPay sale result" } }
      }
    },
    "/api/providers/fluidpay/cards/auth": {
      post: {
        summary: "Authorize a card with FluidPay for later capture",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FluidPayCardTransactionRequest" }
            }
          }
        },
        responses: { 200: { description: "FluidPay authorization result" } }
      }
    },
    "/api/providers/fluidpay/cards/capture": {
      post: {
        summary: "Capture a previous FluidPay authorization",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FluidPayTransactionReferenceRequest" }
            }
          }
        },
        responses: { 200: { description: "FluidPay capture result" } }
      }
    },
    "/api/providers/fluidpay/cards/void": {
      post: {
        summary: "Void a pending FluidPay transaction",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FluidPayTransactionReferenceRequest" }
            }
          }
        },
        responses: { 200: { description: "FluidPay void result" } }
      }
    },
    "/api/providers/fluidpay/cards/refund": {
      post: {
        summary: "Refund a settled FluidPay transaction",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/FluidPayTransactionReferenceRequest" }
            }
          }
        },
        responses: { 200: { description: "FluidPay refund result" } }
      }
    },
    "/api/providers/fluidpay/transactions/{transactionId}": {
      get: {
        summary: "Get a FluidPay transaction by ID",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "transactionId",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: { 200: { description: "FluidPay transaction detail" } }
      }
    },
    "/api/providers/fluidpay/transactions/search": {
      post: {
        summary: "Search FluidPay transactions",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "FluidPay transaction search result" } }
      }
    },
    "/api/unchargeback/cases": {
      get: {
        summary: "List unchargeback cases",
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: "Unchargeback case list" } }
      },
      post: {
        summary: "Create an unchargeback case",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UnchargebackCreateRequest" }
            }
          }
        },
        responses: { 201: { description: "Unchargeback case created" } }
      }
    },
    "/api/unchargeback/cases/{caseId}/{kind}": {
      post: {
        summary: "Attach a widget or content iframe to an unchargeback case",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "caseId",
            in: "path",
            required: true,
            schema: { type: "string" }
          },
          {
            name: "kind",
            in: "path",
            required: true,
            schema: { type: "string", enum: ["widget", "content"] }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UnchargebackEmbedRequest" }
            }
          }
        },
        responses: { 200: { description: "Embed saved" } }
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
        summary: "Run a RapidAPI BIN/IP checker lookup without storing PAN or CVV",
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
        summary: "Authorize a card with PayPal DirectPayment and store the authorization ID for later capture",
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
    "/api/providers/paypal/direct-payment/cards/sale": {
      post: {
        summary: "Run a PayPal DirectPayment Sale transaction",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PayPalCardCheckRequest" }
            }
          }
        },
        responses: { 200: { description: "PayPal DirectPayment sale result" } }
      }
    },
    "/api/providers/paypal/manager/cards/capture": {
      post: {
        summary: "Capture a previous PayPal DirectPayment authorization by authorization ID or latest card auth",
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
    "/api/providers/paypal/direct-payment/cards/void": {
      post: {
        summary: "Void a PayPal DirectPayment authorization by authorization ID or latest card auth",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PayPalVoidRequest" }
            }
          }
        },
        responses: { 200: { description: "PayPal DirectPayment void result" } }
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
  let pan = null;
  try {
    pan = card.pan_encrypted ? decrypt(card.pan_encrypted) : null;
  } catch {
    pan = null;
  }
  return {
    id: card.id,
    provider: card.provider,
    provider_payment_token: card.provider_payment_token,
    first6: card.first6,
    pan,
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
    provider_reference_id: card.provider_reference_id,
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

function nowIso() {
  return new Date().toISOString();
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanOptional(value) {
  const text = cleanString(value);
  return text || null;
}

function normalizeMoney(value, fieldName = "amount", { allowZero = false } = {}) {
  const amount = Number(String(value ?? "").replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    const error = new Error(`${fieldName} must be a ${allowZero ? "non-negative" : "positive"} amount`);
    error.statusCode = 400;
    throw error;
  }
  return Number(amount.toFixed(2));
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = cleanString(value || fallback).toLowerCase().replace(/[\s-]+/g, "_");
  return allowed.includes(normalized) ? normalized : fallback;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}

function last4(value) {
  const raw = digits(value);
  return raw ? raw.slice(-4) : null;
}

function maskLast4(value) {
  const suffix = last4(value);
  return suffix ? `****${suffix}` : null;
}

function fingerprintAccount(routingNumber, accountNumber) {
  const routing = digits(routingNumber);
  const account = digits(accountNumber);
  if (!routing || !account) return null;
  return crypto.createHash("sha256").update(`${routing}:${account}`).digest("hex");
}

async function getDebtDb() {
  return db.getDb();
}

function serializeFundingAccount(account = {}) {
  return {
    id: account.id,
    bankName: account.bank_name,
    accountName: account.account_name,
    accountType: account.account_type,
    ownershipType: account.ownership_type,
    businessName: account.business_name,
    accountLast4: account.account_last4,
    accountMasked: account.account_masked,
    routingLast4: account.routing_last4,
    routingMasked: account.routing_masked,
    addressLine1: account.address_line1,
    addressLine2: account.address_line2,
    city: account.city,
    state: account.state,
    zip: account.zip,
    country: account.country,
    status: account.status,
    notes: account.notes,
    paymentCount: account.payment_count || 0,
    totalPaid: account.total_paid || 0,
    createdAt: account.created_at,
    updatedAt: account.updated_at
  };
}

function serializeDebtCard(card = {}) {
  let loginUsername = null;
  try {
    loginUsername = card.login_username_encrypted ? decrypt(card.login_username_encrypted) : null;
  } catch {
    loginUsername = null;
  }
  return {
    id: card.id,
    ownerName: card.owner_name,
    cardholderName: card.cardholder_name,
    bankName: card.bank_name,
    cardNetwork: card.card_network,
    cardLast4: card.card_last4,
    billingAddressLine1: card.billing_address_line1,
    billingAddressLine2: card.billing_address_line2,
    billingCity: card.billing_city,
    billingState: card.billing_state,
    billingZip: card.billing_zip,
    billingCountry: card.billing_country,
    loginUrl: card.login_url,
    loginUsername,
    loginPasswordConfigured: Boolean(card.login_password_encrypted),
    mobileBankingConfigured: Boolean(card.login_username_encrypted || card.login_password_encrypted),
    creditLimit: card.credit_limit || 0,
    currentBalance: card.current_balance || 0,
    minimumPayment: card.minimum_payment || 0,
    dueDate: card.due_date,
    status: card.status,
    notes: card.notes,
    paymentCount: card.payment_count || 0,
    totalPaid: card.total_paid || 0,
    expectedRepaymentTotal: card.expected_repayment_total || 0,
    repaymentPaidTotal: card.repayment_paid_total || 0,
    repaymentDueTotal: Math.max(0, Number(card.expected_repayment_total || 0) - Number(card.repayment_paid_total || 0)),
    createdAt: card.created_at,
    updatedAt: card.updated_at
  };
}

function serializeDebtPayment(payment = {}, account = null, card = null) {
  return {
    id: payment.id,
    debtCardId: payment.debt_card_id,
    card: card ? {
      id: card.id,
      ownerName: card.owner_name,
      bankName: card.bank_name,
      cardLast4: card.card_last4
    } : payment.card_snapshot || null,
    paymentType: payment.payment_type,
    sourceType: payment.source_type,
    fundingAccountId: payment.funding_account_id,
    fundingAccount: account ? {
      id: account.id,
      bankName: account.bank_name,
      accountName: account.account_name,
      accountType: account.account_type,
      ownershipType: account.ownership_type,
      accountMasked: account.account_masked,
      routingMasked: account.routing_masked
    } : payment.manual_source || null,
    amount: payment.amount,
    currency: payment.currency,
    paymentDate: payment.payment_date,
    paymentStatus: payment.payment_status,
    confirmationNumber: payment.confirmation_number,
    repaymentExpectedAmount: payment.repayment_expected_amount || 0,
    repaymentPaidAmount: payment.repayment_paid_amount || 0,
    repaymentStatus: payment.repayment_status,
    repaymentDate: payment.repayment_date,
    repaymentDueAmount: Math.max(0, Number(payment.repayment_expected_amount || 0) - Number(payment.repayment_paid_amount || 0)),
    notes: payment.notes,
    createdAt: payment.created_at,
    updatedAt: payment.updated_at
  };
}

async function getFundingAccount(accountId) {
  if (!accountId) return null;
  const database = await getDebtDb();
  return database.collection("funding_accounts").findOne({ id: accountId });
}

async function getDebtCard(cardId) {
  if (!cardId) return null;
  const database = await getDebtDb();
  return database.collection("debt_cards").findOne({ id: cardId });
}

async function buildPaymentRows(filter = {}) {
  const database = await getDebtDb();
  const payments = await database.collection("debt_payments")
    .find(filter, { projection: { _id: 0 } })
    .sort({ payment_date: -1, created_at: -1 })
    .toArray();
  const accountIds = [...new Set(payments.map((payment) => payment.funding_account_id).filter(Boolean))];
  const cardIds = [...new Set(payments.map((payment) => payment.debt_card_id).filter(Boolean))];
  const [accounts, cards] = await Promise.all([
    accountIds.length ? database.collection("funding_accounts").find({ id: { $in: accountIds } }).toArray() : [],
    cardIds.length ? database.collection("debt_cards").find({ id: { $in: cardIds } }).toArray() : []
  ]);
  const accountById = Object.fromEntries(accounts.map((account) => [account.id, account]));
  const cardById = Object.fromEntries(cards.map((card) => [card.id, card]));
  return payments.map((payment) => serializeDebtPayment(payment, accountById[payment.funding_account_id], cardById[payment.debt_card_id]));
}

async function recalculateDebtRollups() {
  const database = await getDebtDb();
  const [payments, accounts, cards] = await Promise.all([
    database.collection("debt_payments").find({}, { projection: { _id: 0 } }).toArray(),
    database.collection("funding_accounts").find({}, { projection: { _id: 0, id: 1 } }).toArray(),
    database.collection("debt_cards").find({}, { projection: { _id: 0, id: 1 } }).toArray()
  ]);
  const byAccount = new Map();
  const byCard = new Map();
  for (const payment of payments) {
    if (payment.funding_account_id) {
      const current = byAccount.get(payment.funding_account_id) || { payment_count: 0, total_paid: 0 };
      current.payment_count += 1;
      current.total_paid += Number(payment.amount || 0);
      byAccount.set(payment.funding_account_id, current);
    }
    if (payment.debt_card_id) {
      const current = byCard.get(payment.debt_card_id) || {
        payment_count: 0,
        total_paid: 0,
        expected_repayment_total: 0,
        repayment_paid_total: 0
      };
      current.payment_count += 1;
      current.total_paid += Number(payment.amount || 0);
      current.expected_repayment_total += Number(payment.repayment_expected_amount || 0);
      current.repayment_paid_total += Number(payment.repayment_paid_amount || 0);
      byCard.set(payment.debt_card_id, current);
    }
  }
  await Promise.all([
    ...accounts.map((account) => database.collection("funding_accounts").updateOne(
      { id: account.id },
      { $set: { ...(byAccount.get(account.id) || { payment_count: 0, total_paid: 0 }), updated_at: nowIso() } }
    )),
    ...cards.map((card) => database.collection("debt_cards").updateOne(
      { id: card.id },
      { $set: { ...(byCard.get(card.id) || { payment_count: 0, total_paid: 0, expected_repayment_total: 0, repayment_paid_total: 0 }), updated_at: nowIso() } }
    ))
  ]);
}

function normalizeCardDetails(payload = {}) {
  const cardDetails = payload.cardDetails || payload.card || payload.paymentCard || {};
  const expiration = cardDetails.expiration || cardDetails.expiry || {};
  const compactExpiry = String(payload.expiry || cardDetails.expiry || "").replace(/\D/g, "");
  const expMonth = payload.expMonth ||
    cardDetails.expMonth ||
    cardDetails.exp_month ||
    cardDetails.expirationMonth ||
    expiration.month ||
    (compactExpiry.length === 4 ? compactExpiry.slice(0, 2) : null);
  const expYear = payload.expYear ||
    cardDetails.expYear ||
    cardDetails.exp_year ||
    cardDetails.expirationYear ||
    expiration.year ||
    (compactExpiry.length === 4 ? compactExpiry.slice(2) : null);
  const normalizedPan = String(payload.pan || cardDetails.pan || cardDetails.number || "").replace(/\D/g, "");
  const first6 = String(payload.bin || payload.first6 || cardDetails.first6 || cardDetails.bin || normalizedPan.slice(0, 6) || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  const last4 = String(payload.last4 || cardDetails.last4 || cardDetails.masked_number_last4 || normalizedPan.slice(-4) || "")
    .replace(/\D/g, "")
    .slice(-4);
  const brand = payload.brand || cardDetails.brand || cardDetails.cardBrand || cardDetails.type || null;
  const holder = payload.cardholderName || payload.name || cardDetails.name || cardDetails.cardholderName || null;

  return {
    normalizedPan,
    first6: first6 || null,
    last4: last4 || null,
    brand,
    expMonth: expMonth ? String(expMonth).padStart(2, "0") : null,
    expYear: expYear ? String(expYear).length === 2 ? `20${expYear}` : String(expYear) : null,
    cardholderName: holder,
    billingZip: payload.billingZip || payload.zip || payload.postalCode || cardDetails.billingZip || cardDetails.postalCode || null
  };
}

function buildCardLogSnapshot(payload = {}) {
  const details = normalizeCardDetails(payload);
  const source = payload.source || payload.providerPaymentToken || null;

  return {
    mode: getSavedCardId(payload.cardId) ? "saved" : "manual",
    cardId: getSavedCardId(payload.cardId),
    maskedPan: details.normalizedPan ? `**** **** **** ${details.normalizedPan.slice(-4)}` : (details.last4 ? `**** **** **** ${details.last4}` : null),
    first6: details.first6,
    last4: details.last4,
    brand: details.brand,
    expMonth: details.expMonth,
    expYear: details.expYear,
    cardholderName: details.cardholderName,
    billingZip: details.billingZip,
    sourceToken: source ? `${String(source).slice(0, 6)}...${String(source).slice(-4)}` : null
  };
}

function buildCardDebugSnapshot(payload = {}) {
  const details = normalizeCardDetails(payload);
  const snapshot = buildCardLogSnapshot(payload);
  return {
    ...snapshot,
    pan: details.normalizedPan || null,
    cardNumber: details.normalizedPan || null
  };
}

function buildStoredCardDebugSnapshot(card = null) {
  if (!card) {
    return null;
  }
  let pan = null;
  try {
    pan = card.pan || decrypt(card.pan_encrypted);
  } catch {
    pan = null;
  }
  return {
    mode: "saved",
    cardId: card.id || null,
    maskedPan: card.masked_pan || (card.last4 ? `**** **** **** ${card.last4}` : null),
    pan: pan || null,
    cardNumber: pan || null,
    first6: card.first6 || (pan ? pan.slice(0, 6) : null),
    last4: card.last4 || (pan ? pan.slice(-4) : null),
    brand: card.brand || null,
    expMonth: card.exp_month || null,
    expYear: card.exp_year || null,
    cardholderName: card.cardholder_name || null,
    billingZip: card.billing_zip || null
  };
}

async function getCardRecord(cardId) {
  if (!cardId) {
    return null;
  }
  const database = await db.getDb();
  const card = await database.collection("cards").findOne({ id: cardId }, { projection: { _id: 0 } });
  if (!card) {
    const error = new Error("Card not found");
    error.statusCode = 404;
    throw error;
  }
  return {
    ...card,
    pan: decrypt(card.pan_encrypted)
  };
}

async function getCardRecordByProviderReferenceId(provider, providerReferenceId) {
  const reference = String(providerReferenceId || "").trim();
  if (!provider || !reference) {
    return null;
  }
  const database = await db.getDb();
  const card = await database.collection("cards").findOne({
    provider,
    provider_reference_id: reference
  }, {
    projection: { _id: 0 }
  });
  if (!card) {
    return null;
  }
  return {
    ...card,
    pan: decrypt(card.pan_encrypted)
  };
}

function payloadWithSavedCard(payload = {}, card = null) {
  if (!card) {
    return payload;
  }
  const nameParts = String(card.cardholder_name || "").trim().split(/\s+/).filter(Boolean);
  return {
    ...payload,
    pan: payload.pan || card.pan || undefined,
    source: payload.source || card.provider_payment_token || undefined,
    token: payload.token || card.provider_payment_token || undefined,
    providerPaymentToken: payload.providerPaymentToken || card.provider_payment_token || undefined,
    expMonth: payload.expMonth || card.exp_month || undefined,
    expYear: payload.expYear || card.exp_year || undefined,
    cardholderName: payload.cardholderName || card.cardholder_name || undefined,
    firstName: payload.firstName || nameParts[0] || undefined,
    lastName: payload.lastName || nameParts.slice(1).join(" ") || undefined,
    first6: payload.first6 || card.first6 || undefined,
    last4: payload.last4 || card.last4 || undefined,
    brand: payload.brand || card.brand || undefined,
    billingAddressLine1: payload.billingAddressLine1 || card.billing_address_line1 || undefined,
    billingCity: payload.billingCity || card.billing_city || undefined,
    billingState: payload.billingState || card.billing_state || undefined,
    billingZip: payload.billingZip || card.billing_zip || undefined,
    billingCountry: payload.billingCountry || card.billing_country || undefined
  };
}

function mapVerificationStatus(status) {
  if (status === "approved" || status === "verified") return "verified";
  if (status === "unknown" || status === "review") return "review";
  if (status === "failed" || status === "declined") return "declined";
  return "pending";
}

function buildManualProviderToken(provider, payload = {}) {
  const details = normalizeCardDetails(payload);
  if (!details.last4 || !details.expMonth || !details.expYear) {
    return null;
  }
  const fingerprint = [
    provider,
    details.first6 || "",
    details.last4,
    details.expMonth,
    details.expYear,
    String(details.cardholderName || "").toLowerCase().trim()
  ].join("|");
  const digest = crypto.createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
  return `manual:${provider}:${details.first6 || "bin"}:${details.last4}:${digest}`;
}

function getResultProviderPaymentToken(result = {}) {
  return result.providerPaymentToken ||
    result.paymentToken ||
    result.token ||
    result.source ||
    result.raw?.token ||
    null;
}

async function tokenizeCloverPayload(payload = {}) {
  if (payload.source || payload.providerPaymentToken || payload.token) {
    return {
      payload: {
        ...payload,
        source: payload.source || payload.providerPaymentToken || payload.token,
        providerPaymentToken: payload.providerPaymentToken || payload.source || payload.token
      },
      tokenization: null
    };
  }

  const tokenization = await cloverService.tokenizeCard(payload);
  const details = normalizeCardDetails({
    ...payload,
    ...(tokenization.card || {})
  });

  return {
    payload: {
      ...payload,
      pan: undefined,
      cvv: undefined,
      cvv2: undefined,
      cvc: undefined,
      source: tokenization.source,
      token: tokenization.source,
      providerPaymentToken: tokenization.source,
      first6: tokenization.card?.first6 || details.first6 || undefined,
      last4: tokenization.card?.last4 || details.last4 || undefined,
      brand: tokenization.card?.brand || details.brand || undefined,
      expMonth: tokenization.card?.exp_month || details.expMonth || payload.expMonth,
      expYear: tokenization.card?.exp_year || details.expYear || payload.expYear
    },
    tokenization: {
      ok: true,
      sourceToken: `${String(tokenization.source).slice(0, 6)}...${String(tokenization.source).slice(-4)}`,
      card: tokenization.card,
      tokenApiBaseUrl: tokenization.tokenApiBaseUrl
    }
  };
}

async function upsertProviderCardRecord({
  provider,
  providerPaymentToken,
  payload = {},
  verificationStatus = "pending",
  providerReferenceId = null,
  avsResult = null,
  authResultCode = null,
  notes = null
}) {
  if (!providerPaymentToken) {
    return null;
  }

  const details = normalizeCardDetails(payload);
  if (!details.last4 || !details.expMonth || !details.expYear) {
    return null;
  }

  const database = await db.getDb();
  const existing = await database.collection("cards").findOne({
    provider,
    provider_payment_token: providerPaymentToken
  }, { projection: { _id: 0, id: 1, provider_reference_id: 1 } });
  const id = existing?.id || uuidv4();
  const nowIso = new Date().toISOString();
  const maskedPan = details.normalizedPan
    ? `**** **** **** ${details.normalizedPan.slice(-4)}`
    : `**** **** **** ${details.last4}`;
  const isStoredUsageByRetref = Boolean(payload.retref || payload.initialRetref || payload.initialTransactionId || payload.originalTransactionId);
  const storedProviderReferenceId = isStoredUsageByRetref && existing?.provider_reference_id
    ? existing.provider_reference_id
    : providerReferenceId;

  await database.collection("cards").updateOne(
    { provider, provider_payment_token: providerPaymentToken },
    {
      $setOnInsert: {
        id,
        provider,
        provider_customer_id: payload.providerCustomerId || null,
        provider_payment_token: providerPaymentToken,
        pan_encrypted: encrypt(details.normalizedPan || ""),
        created_at: nowIso
      },
      $set: {
        masked_pan: maskedPan,
        first6: details.first6,
        last4: details.last4,
        brand: details.brand,
        exp_month: details.expMonth,
        exp_year: details.expYear,
        cardholder_name: details.cardholderName,
        billing_address_line1: payload.billingAddressLine1 || payload.street || null,
        billing_city: payload.billingCity || payload.city || null,
        billing_state: payload.billingState || payload.state || null,
        billing_zip: details.billingZip,
        billing_country: payload.billingCountry || payload.country || null,
        verification_status: verificationStatus,
        avs_result: avsResult,
        auth_result_code: authResultCode,
        provider_reference_id: storedProviderReferenceId,
        notes,
        updated_at: nowIso
      }
    },
    { upsert: true }
  );

  return {
    id,
    provider,
    maskedPan,
    first6: details.first6,
    last4: details.last4,
    brand: details.brand,
    expMonth: details.expMonth,
    expYear: details.expYear
  };
}

async function insertProviderAttempt({
  cardId,
  provider,
  attemptType,
  status,
  amount = null,
  currency = "USD",
  providerReferenceId = null,
  rawResponse = null,
  createdByUserId
}) {
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
      balance_amount,
      created_by_user_id
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      cardId || null,
      provider,
      attemptType,
      status,
      amount,
      String(currency || "USD").toUpperCase(),
      providerReferenceId,
      serializeRawResponse(rawResponse),
      null,
      createdByUserId
    ]
  );
}

function resultAttemptType(operation) {
  const map = {
    sale: "sale_check",
    charge: "sale_check",
    authorize: "auth_check",
    auth: "auth_check",
    verification: "auth_check",
    verify: "auth_check",
    live: "live_check",
    balance: "balance_check",
    capture: "capture",
    refund: "refund",
    void: "void",
    reversal: "void"
  };
  return map[operation] || `${operation}_check`;
}

function missingEnv(entries) {
  return entries.filter(([, value]) => !value).map(([name]) => name);
}

function getProviderReportCatalog() {
  const paypalManager = paypalService.getManagerStatus();
  const paypalNvp = paypalService.getNvpStatus();
  const fluidpayStatus = fluidpayService.getStatus();
  const braintreeStatus = braintreeService.getStatus();
  const nmiStatus = nmiService.getStatus();
  const zohoStatus = zohoPaymentsService.getStatus();
  const globalPaymentsStatus = globalPaymentsService.getStatus();
  const propelrPayStatus = propelrPayService.getStatus();
  const cloverMissing = missingEnv([
    ["CLOVER_MERCHANT_ID", env.providers.clover.merchantId],
    ["CLOVER_API_TOKEN or CLOVER_API_KEY", env.providers.clover.apiKey]
  ]);
  const rapidApiMissing = missingEnv([
    ["RAPIDAPI_BIN_CHECKER_KEY", process.env.RAPIDAPI_BIN_CHECKER_KEY || process.env.X_RAPIDAPI_KEY]
  ]);
  const twilioMissing = missingEnv([
    ["TWILIO_ACCOUNT_SID", process.env.TWILIO_ACCOUNT_SID],
    ["TWILIO_AUTH_TOKEN", process.env.TWILIO_AUTH_TOKEN],
    ["TWILIO_PHONE_NUMBER", process.env.TWILIO_PHONE_NUMBER],
    ["TWILIO_TWIML_URL", process.env.TWILIO_TWIML_URL]
  ]);
  const twilioVerifyMissing = missingEnv([
    ["TWILIO_ACCOUNT_SID", process.env.TWILIO_ACCOUNT_SID],
    ["TWILIO_AUTH_TOKEN", process.env.TWILIO_AUTH_TOKEN],
    ["TWILIO_VERIFY_SERVICE_SID", process.env.TWILIO_VERIFY_SERVICE_SID]
  ]);
  const twilioBrowserMissing = missingEnv([
    ["TWILIO_API_KEY_SID", process.env.TWILIO_API_KEY_SID],
    ["TWILIO_API_KEY_SECRET", process.env.TWILIO_API_KEY_SECRET],
    ["TWILIO_TWIML_APP_SID", process.env.TWILIO_TWIML_APP_SID]
  ]);
  const telnyxMissing = missingEnv([
    ["TELNYX_API_KEY", process.env.TELNYX_API_KEY],
    ["TELNYX_PHONE_NUMBER", process.env.TELNYX_PHONE_NUMBER],
    ["TELNYX_CONNECTION_ID", process.env.TELNYX_CONNECTION_ID]
  ]);

  return [
    {
      key: "clover",
      group: "payment_gateways",
      label: "Clover",
      configured: cloverMissing.length === 0,
      missing: cloverMissing,
      configNotes: [
        "CLOVER_API_BASE_URL defaults to https://api.clover.com",
        "Clover uses the eCommerce API with tokenized source values; hosted iframe config is not required"
      ],
      capabilities: ["merchant", "orders", "payments", "tenders", "ecommerce_preauth", "ecommerce_verify_with_bin", "refund"]
    },
    {
      key: "paypal",
      group: "payment_gateways",
      label: "PayPal",
      configured: paypalManager.configured || paypalNvp.configured,
      missing: {
        manager: paypalManager.missing,
        nvp: paypalNvp.missing
      },
      configNotes: [
        `REST configured: ${Boolean(env.providers.paypal.clientId && env.providers.paypal.clientSecret)}`,
        `Manager base URL: ${paypalManager.baseUrl || "-"}`,
        `NVP base URL: ${paypalNvp.baseUrl || "-"}`
      ],
      capabilities: ["rest_oauth", "manager_status", "manager_inquiry", "live_check", "nvp_test", "sale", "auth", "capture", "void"]
    },
    {
      key: "fluidpay",
      group: "payment_gateways",
      label: "FluidPay",
      configured: fluidpayStatus.configured,
      missing: fluidpayStatus.missing,
      configNotes: [
        "Required for dev: FLUIDPAY_API_KEY",
        "FLUIDPAY_ENV defaults to sandbox",
        "FLUIDPAY_API_BASE_URL defaults from FLUIDPAY_ENV",
        "FLUIDPAY_PROCESSOR_ID is optional unless your FluidPay account has no default processor"
      ],
      capabilities: ["status", "test", "sale", "auth", "capture", "void", "refund", "transaction_detail", "transaction_search"]
    },
    {
      key: "braintree",
      group: "payment_gateways",
      label: "Braintree",
      configured: braintreeStatus.configured,
      missing: braintreeStatus.missing,
      configNotes: [
        "Required for dev: BRAINTREE_MERCHANT_ID, BRAINTREE_PUBLIC_KEY and BRAINTREE_PRIVATE_KEY",
        "BRAINTREE_GRAPHQL_URL defaults from BRAINTREE_ENV",
        "BRAINTREE_MERCHANT_ACCOUNT_ID is optional unless the gateway account requires one"
      ],
      capabilities: ["status", "sale", "auth", "capture", "void", "refund", "verification"]
    },
    {
      key: "nmi",
      group: "payment_gateways",
      label: "NMI",
      configured: nmiStatus.configured,
      missing: nmiStatus.missing,
      configNotes: [
        "Required: NMI_PAYMENT_API_KEY or NMI_SECURITY_KEY",
        "NMI_API_BASE_URL defaults to https://secure.nmi.com",
        "Sale/auth/validate/capture/refund/void use the NMI Payment API form endpoint"
      ],
      capabilities: ["status", "test", "sale", "auth", "capture", "void", "refund", "verification", "transaction_detail"]
    },
    {
      key: "zoho",
      group: "payment_gateways",
      label: "Zoho Payments",
      configured: zohoStatus.configured,
      missing: zohoStatus.missing,
      optionalMissing: Object.entries(zohoStatus.pathStatus || {})
        .filter(([, configured]) => !configured)
        .map(([key]) => ({
          status: "ZOHO_PAYMENTS_STATUS_PATH",
          sale: "ZOHO_PAYMENTS_SALE_PATH",
          authorize: "ZOHO_PAYMENTS_AUTH_PATH",
          verification: "ZOHO_PAYMENTS_VERIFY_PATH",
          capture: "ZOHO_PAYMENTS_CAPTURE_PATH",
          refund: "ZOHO_PAYMENTS_REFUND_PATH",
          void: "ZOHO_PAYMENTS_VOID_PATH",
          transaction: "ZOHO_PAYMENTS_TRANSACTION_PATH"
        }[key] || `ZOHO_PAYMENTS_${key.toUpperCase()}_PATH`)),
      configNotes: [
        "Required: ZOHO_PAYMENTS_API_BASE_URL plus access token/API key or OAuth refresh credentials",
        "Operation paths are env-driven because Zoho payment products expose different API surfaces by account/product",
        "Set ZOHO_PAYMENTS_ORGANIZATION_ID when the selected Zoho API requires an organization scope"
      ],
      capabilities: ["status", "test", "sale", "auth", "capture", "void", "refund", "verification", "transaction_detail"]
    },
    {
      key: "globalpayments",
      group: "payment_gateways",
      label: "Global Payments",
      configured: globalPaymentsStatus.configured,
      missing: globalPaymentsStatus.missing,
      configNotes: [
        "Required for dev: GLOBALPAYMENTS_APP_ID and GLOBALPAYMENTS_APP_KEY",
        "GLOBALPAYMENTS_API_BASE_URL defaults to https://apis.sandbox.globalpay.com/ucp",
        "GLOBALPAYMENTS_ACCOUNT_NAME defaults to Transaction_Processing",
        "GLOBALPAYMENTS_CHANNEL defaults to CNP"
      ],
      capabilities: ["status", "test", "sale", "auth", "capture", "reversal", "refund", "verification", "transaction_detail"]
    },
    {
      key: "propelrpay",
      group: "payment_gateways",
      label: "PropelrPay",
      configured: propelrPayStatus.configured,
      missing: propelrPayStatus.missing,
      optionalMissing: Object.entries(propelrPayStatus.pathStatus)
        .filter(([, configured]) => !configured)
        .map(([key]) => ({
          sale: "PROPELRPAY_SALE_PATH",
          authorize: "PROPELRPAY_AUTH_PATH",
          verification: "PROPELRPAY_VERIFY_PATH",
          capture: "PROPELRPAY_CAPTURE_PATH",
          refund: "PROPELRPAY_REFUND_PATH",
          void: "PROPELRPAY_VOID_PATH",
          transaction: "PROPELRPAY_TRANSACTION_PATH"
        }[key] || `PROPELRPAY_${key.toUpperCase()}_PATH`)),
      configNotes: [
        "No public PropelrPay API reference was found; endpoint paths are env-driven",
        "Required for dev: PROPELRPAY_API_BASE_URL and PROPELRPAY_API_KEY",
        "Set operation paths before running live sale/auth/verification/capture/refund/void calls"
      ],
      capabilities: ["status", "test", "sale", "auth", "capture", "void", "refund", "verification", "transaction_detail"]
    },
    {
      key: "rapidapi_bin_checker",
      group: "card_intelligence",
      label: "RapidAPI BIN/IP Checker",
      configured: rapidApiMissing.length === 0,
      missing: rapidApiMissing,
      configNotes: [
        "Set RAPIDAPI_BIN_CHECKER_KEY or X_RAPIDAPI_KEY",
        "RAPIDAPI_BIN_CHECKER_HOST defaults to bin-ip-checker.p.rapidapi.com"
      ],
      capabilities: ["bin_check", "bin_ip_check"]
    },
    {
      key: "twilio_voice",
      group: "voice_verification",
      label: "Twilio Voice",
      configured: twilioMissing.length === 0,
      missing: twilioMissing,
      optionalMissing: twilioBrowserMissing,
      configNotes: [
        "Browser voice additionally needs TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID"
      ],
      capabilities: ["voice_call", "browser_voice_token", "provider_test"]
    },
    {
      key: "twilio_verify",
      group: "voice_verification",
      label: "Twilio Verify",
      configured: twilioVerifyMissing.length === 0,
      missing: twilioVerifyMissing,
      configNotes: ["Used by card phone-number OTP verification"],
      capabilities: ["start_otp", "check_otp"]
    },
    {
      key: "telnyx_voice",
      group: "voice_verification",
      label: "Telnyx Voice",
      configured: telnyxMissing.length === 0,
      missing: telnyxMissing,
      configNotes: ["Used by provider router when unverified caller-id routing is needed"],
      capabilities: ["voice_call"]
    },
    {
      key: "unchargeback",
      group: "operations",
      label: "Unchargeback",
      configured: true,
      missing: [],
      configNotes: ["DB-backed operational case tracking, no external provider key required"],
      capabilities: ["case_list", "case_create", "widget_embed", "content_embed"]
    }
  ];
}

function getPaymentProcessorHealthSnapshot() {
  return {
    running: paymentProcessorHealth.running,
    startedAt: paymentProcessorHealth.startedAt,
    checkedAt: paymentProcessorHealth.checkedAt,
    processors: paymentProcessorHealth.processors
  };
}

function getProcessorHealthErrorMessage(error) {
  const data = error?.response?.data;
  if (typeof data === "string") {
    return data;
  }
  return data?.responseMessage ||
    data?.message ||
    data?.error ||
    error?.message ||
    "Health check failed";
}

function isProcessorResultHealthy(result) {
  if (!result || result.ok === false) {
    return false;
  }
  if (result.ok === true) {
    return true;
  }
  const status = String(result.status || result.accountStatus || result.resultCode || "").toLowerCase();
  return ["ok", "success", "healthy", "approved", "completed"].includes(status);
}

function summarizeProcessorHealthResult(result) {
  return redactSensitiveReportData({
    ok: result?.ok,
    configured: result?.configured,
    status: result?.status || result?.accountStatus || null,
    resultCode: result?.resultCode || null,
    responseMessage: result?.responseMessage || result?.message || null,
    correlationId: result?.correlationId || null,
    mode: result?.mode || null,
    baseUrl: result?.baseUrl || null,
    pathStatus: result?.pathStatus || null,
    attempts: result?.attempts || null
  });
}

async function runPayPalProcessorHealthCheck() {
  const managerStatus = paypalService.getManagerStatus();
  const nvpStatus = paypalService.getNvpStatus();
  const attempts = [];

  const runAttempt = async (name, configured, check) => {
    if (!configured) {
      attempts.push({ name, configured: false, ok: false, responseMessage: "missing configuration" });
      return;
    }

    try {
      const result = await check();
      attempts.push({
        name,
        configured: true,
        ok: isProcessorResultHealthy(result),
        responseMessage: result.responseMessage || result.message || null,
        resultCode: result.resultCode || null,
        status: result.status || result.accountStatus || null,
        correlationId: result.correlationId || null
      });
    } catch (error) {
      attempts.push({
        name,
        configured: true,
        ok: false,
        responseMessage: getProcessorHealthErrorMessage(error)
      });
    }
  };

  await runAttempt(
    "rest",
    Boolean(env.providers.paypal.clientId && env.providers.paypal.clientSecret),
    () => paypalService.testRestConnection()
  );
  await runAttempt("manager", managerStatus.configured, () => paypalService.testManagerConnection());
  await runAttempt("nvp", nvpStatus.configured, () => paypalService.testNvpConnection());

  const configuredAttempts = attempts.filter((attempt) => attempt.configured);
  const ok = configuredAttempts.some((attempt) => attempt.ok);
  return {
    ok,
    configured: configuredAttempts.length > 0,
    responseMessage: ok ? "At least one PayPal API family is healthy" : "No PayPal API family passed health check",
    attempts
  };
}

function getPaymentProcessorHealthChecks() {
  return [
    { key: "clover", check: () => cloverService.testConnection() },
    { key: "paypal", ignoreCatalogConfigured: true, check: () => runPayPalProcessorHealthCheck() },
    { key: "fluidpay", check: () => fluidpayService.testConnection() },
    { key: "braintree", check: () => braintreeService.testConnection() },
    { key: "nmi", check: () => nmiService.testConnection() },
    { key: "zoho", check: () => zohoPaymentsService.testConnection() },
    { key: "globalpayments", check: () => globalPaymentsService.testConnection() },
    { key: "propelrpay", check: () => propelrPayService.testConnection() }
  ];
}

async function runPaymentProcessorHealthChecks(reason = "startup") {
  if (paymentProcessorHealth.running) {
    return getPaymentProcessorHealthSnapshot();
  }

  const catalogByKey = Object.fromEntries(
    getProviderReportCatalog()
      .filter((item) => item.group === "payment_gateways")
      .map((item) => [item.key, item])
  );
  paymentProcessorHealth.running = true;
  paymentProcessorHealth.startedAt = new Date().toISOString();

  for (const descriptor of getPaymentProcessorHealthChecks()) {
    const catalogItem = catalogByKey[descriptor.key] || { key: descriptor.key, label: descriptor.key, configured: false };
    paymentProcessorHealth.processors[descriptor.key] = {
      key: descriptor.key,
      label: catalogItem.label,
      status: "checking",
      healthy: null,
      configured: Boolean(catalogItem.configured),
      checkedAt: null,
      reason
    };

    if (!descriptor.ignoreCatalogConfigured && !catalogItem.configured) {
      paymentProcessorHealth.processors[descriptor.key] = {
        key: descriptor.key,
        label: catalogItem.label,
        status: "unhealthy",
        healthy: false,
        configured: false,
        checkedAt: new Date().toISOString(),
        message: "missing configuration",
        missing: catalogItem.missing || [],
        reason
      };
      continue;
    }

    try {
      const result = await descriptor.check();
      const healthy = isProcessorResultHealthy(result);
      paymentProcessorHealth.processors[descriptor.key] = {
        key: descriptor.key,
        label: catalogItem.label,
        status: healthy ? "healthy" : "unhealthy",
        healthy,
        configured: result?.configured !== false,
        checkedAt: new Date().toISOString(),
        message: result?.responseMessage || result?.message || (healthy ? "healthy" : "health check failed"),
        result: summarizeProcessorHealthResult(result),
        reason
      };
    } catch (error) {
      paymentProcessorHealth.processors[descriptor.key] = {
        key: descriptor.key,
        label: catalogItem.label,
        status: "unhealthy",
        healthy: false,
        configured: true,
        checkedAt: new Date().toISOString(),
        message: getProcessorHealthErrorMessage(error),
        reason
      };
    }
  }

  paymentProcessorHealth.running = false;
  paymentProcessorHealth.checkedAt = new Date().toISOString();
  return getPaymentProcessorHealthSnapshot();
}

function getProviderHealthRows() {
  const health = getPaymentProcessorHealthSnapshot();
  return getProviderReportCatalog()
    .filter((item) => item.group === "payment_gateways")
    .map((provider) => {
      const processorHealth = health.processors[provider.key] || {
        key: provider.key,
        label: provider.label,
        status: health.running ? "checking" : "unknown",
        healthy: null,
        configured: provider.configured,
        checkedAt: null
      };
      const liveStatus = processorHealth.healthy === true
        ? "live"
        : provider.configured ? "not_live" : "not_configured";
      return {
        key: provider.key,
        label: provider.label,
        configured: Boolean(provider.configured),
        live: processorHealth.healthy === true,
        liveStatus,
        status: processorHealth.status || "unknown",
        message: processorHealth.message || null,
        checkedAt: processorHealth.checkedAt || null,
        missing: provider.missing || [],
        optionalMissing: provider.optionalMissing || [],
        capabilities: provider.capabilities || [],
        configNotes: provider.configNotes || [],
        health: processorHealth
      };
    });
}

function safeParseJson(value) {
  if (!value || typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function redactSensitiveReportData(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveReportData(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactSensitiveReportData(entryValue, entryKey)
    ]));
  }
  if (/cvv|cvv2|cvc|password|secret|signature|apikey|api_key|token|source/i.test(key)) {
    return value ? "[redacted]" : value;
  }
  if (/pan|cardnumber|card_number/i.test(key)) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length >= 12) {
      return `**** **** **** ${digits.slice(-4)}`;
    }
  }
  if (/^(account|accountnumber|account_number|bankaccountnumber|bank_account_number|bankaba|routingnumber|routing_number|aba)$/i.test(key)) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.length >= 4) {
      return `****${digits.slice(-4)}`;
    }
  }
  return value;
}

function redactProcessorDebugModel(value, key = "") {
  if (Array.isArray(value)) {
    return value.map((item) => redactProcessorDebugModel(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactProcessorDebugModel(entryValue, entryKey)
    ]));
  }
  if (/cvv|cvv2|cvc|password|secret|signature|apikey|api_key|token|source/i.test(key)) {
    return value ? "[redacted]" : value;
  }
  return value;
}

function mergeDebugCardIntoModel(model, debugCard = null) {
  if (!model || typeof model !== "object" || !debugCard) {
    return model;
  }
  const clone = Array.isArray(model) ? [...model] : { ...model };
  if (clone.card && typeof clone.card === "object" && !Array.isArray(clone.card)) {
    clone.card = {
      ...clone.card,
      ...Object.fromEntries(Object.entries(debugCard).filter(([, value]) => value !== null && value !== undefined && value !== ""))
    };
  } else if (!clone.card) {
    clone.card = debugCard;
  }
  return clone;
}

function normalizeOperationStatus(status) {
  return String(status || "unknown").toLowerCase();
}

function isSuccessfulOperationStatus(status) {
  return [
    "approved",
    "authorized",
    "verified",
    "success",
    "succeeded",
    "captured",
    "refunded",
    "voided",
    "recorded",
    "ok"
  ].includes(normalizeOperationStatus(status));
}

function getOperationResultCode(result = {}) {
  return result.resultCode || result.responseCode || result.respcode || result.code || result.raw?.respcode || null;
}

function getOperationResponseMessage(result = {}) {
  return result.responseMessage || result.message || result.error || result.raw?.resptext || null;
}

function getOperationFailureReason({ result = {}, binCheck = null, fallback = "" } = {}) {
  const status = normalizeOperationStatus(result.status);
  if (isSuccessfulOperationStatus(status)) {
    return null;
  }
  return result.failureReason ||
    result.declineCategoryText ||
    result.declineCategory ||
    getOperationResponseMessage(result) ||
    binCheck?.error ||
    fallback ||
    "Provider returned a non-success status";
}

function buildOperationResponseModel({
  operationId = uuidv4(),
  provider,
  operation,
  httpStatus = 200,
  result = {},
  request = {},
  cardId = null,
  card = null,
  persistedCard = null,
  amount = null,
  binCheck = null,
  tokenization = null,
  logs = {},
  startedAt = null,
  completedAt = new Date().toISOString()
}) {
  const status = normalizeOperationStatus(result.status || (result.ok === true ? "success" : result.ok === false ? "failed" : "unknown"));
  const success = isSuccessfulOperationStatus(status);
  const resultCode = getOperationResultCode(result);
  const responseMessage = getOperationResponseMessage(result) ||
    (success ? "İşlem başarıyla tamamlandı" : "İşlem tamamlandı ancak başarılı değil");
  const failureReason = success ? null : getOperationFailureReason({ result, binCheck, fallback: responseMessage });

  return {
    operationId,
    success,
    ok: success,
    status,
    httpStatus,
    resultCode,
    responseMessage,
    failureReason,
    provider,
    operation,
    request: redactSensitiveReportData(request),
    cardId,
    card,
    persistedCard,
    amount,
    result,
    providerResponse: result,
    binCheck,
    tokenization,
    logs,
    timestamps: {
      startedAt,
      completedAt
    }
  };
}

async function writeOperationAuditLog({
  req,
  entityType = "provider",
  entityId = "unknown",
  action,
  status,
  details = {}
}) {
  await writeAuditLog({
    entityType,
    entityId,
    action,
    status,
    actorUserId: req.user?.id || null,
    details: redactSensitiveReportData(details)
  });
}

function getExceptionHttpStatus(error) {
  if (Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600) {
    return error.statusCode;
  }
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600) {
    return error.status;
  }
  if (isAxiosError(error)) {
    return 502;
  }
  return 500;
}

function getExceptionResultCode(error, httpStatus) {
  if (error?.resultCode) return error.resultCode;
  if (error?.code && typeof error.code === "string") return error.code;
  if (isAxiosError(error)) return "PROVIDER_REQUEST_FAILED";
  if (httpStatus === 400) return "VALIDATION_ERROR";
  if (httpStatus === 401) return "AUTHENTICATION_REQUIRED";
  if (httpStatus === 403) return "MISSING_PERMISSION";
  if (httpStatus === 404) return "NOT_FOUND";
  if (httpStatus === 409) return "CONFLICT";
  return "INTERNAL_ERROR";
}

function buildExceptionResult(error) {
  const httpStatus = getExceptionHttpStatus(error);
  const providerMessage = isAxiosError(error) ? getProviderMessage(error) : null;
  const message = providerMessage ||
    (httpStatus < 500 ? error?.message : null) ||
    "Internal server error";

  return {
    httpStatus,
    result: {
      status: "failed",
      resultCode: getExceptionResultCode(error, httpStatus),
      responseMessage: message,
      failureReason: message,
      providerStatus: isAxiosError(error) ? error.response?.status || null : null,
      providerMessage,
      errorType: error?.name || "Error"
    }
  };
}

async function sendOperationExceptionResponse({
  req,
  res,
  error,
  operationId = uuidv4(),
  provider = null,
  operation = null,
  request = {},
  card = null,
  logs = {},
  startedAt = null,
  action = null,
  entityType = "provider",
  entityId = null
}) {
  const { httpStatus, result } = buildExceptionResult(error);
  const response = buildOperationResponseModel({
    operationId,
    provider,
    operation,
    httpStatus,
    result,
    request,
    card,
    logs: {
      audit: false,
      providerAttempt: false,
      ...logs
    },
    startedAt
  });

  try {
    await writeOperationAuditLog({
      req,
      entityType,
      entityId: entityId || provider || "unknown",
      action: action || `${provider || "provider"}_${operation || "operation"}_exception`,
      status: response.status,
      details: {
        operationId,
        provider,
        operation,
        success: false,
        httpStatus,
        resultCode: response.resultCode,
        responseMessage: response.responseMessage,
        failureReason: response.failureReason,
        request: response.request,
        error: toSafeErrorLog(error)
      }
    });
    response.logs.audit = true;
  } catch (auditError) {
    console.error(toSafeErrorLog(auditError));
    response.logs.audit = false;
    response.logs.auditError = getProviderMessage(auditError);
  }

  return res.status(httpStatus).json(response);
}

function buildApiErrorResponse(error, req) {
  const operationId = uuidv4();
  const { httpStatus, result } = buildExceptionResult(error);
  const pathName = req?.originalUrl || req?.url || null;
  const method = req?.method || null;
  const status = normalizeOperationStatus(result.status);

  return {
    operationId,
    success: false,
    ok: false,
    status,
    httpStatus,
    resultCode: result.resultCode,
    responseMessage: result.responseMessage,
    failureReason: result.failureReason,
    path: pathName,
    method,
    request: redactSensitiveReportData({
      params: req?.params || {},
      query: req?.query || {},
      body: req?.body || {}
    }),
    error: result.responseMessage,
    errorDetails: redactSensitiveReportData(result),
    timestamps: {
      completedAt: new Date().toISOString()
    }
  };
}

function sendApiError(res, req, httpStatus, message, resultCode = null) {
  const error = new Error(message);
  error.statusCode = httpStatus;
  if (resultCode) {
    error.resultCode = resultCode;
  }
  const response = buildApiErrorResponse(error, req);
  return res.status(httpStatus).json(response);
}

function classifyAttemptProvider(attempt) {
  if (attempt.provider === "paypal" && attempt.attempt_type === "bin_check") {
    return "rapidapi_bin_checker";
  }
  if (attempt.provider === "clover") return "clover";
  if (attempt.provider === "fluidpay") return "fluidpay";
  if (attempt.provider === "braintree") return "braintree";
  if (attempt.provider === "nmi") return "nmi";
  if (attempt.provider === "zoho") return "zoho";
  if (attempt.provider === "globalpayments") return "globalpayments";
  if (attempt.provider === "propelrpay") return "propelrpay";
  if (attempt.provider === "paypal") return "paypal";
  return attempt.provider || "unknown";
}

function classifyAuditProvider(log) {
  const action = String(log.action || "");
  const entityId = String(log.entity_id || "");
  if (action.includes("bin_check")) return "rapidapi_bin_checker";
  if (action.startsWith("clover_") || entityId.startsWith("clover")) return "clover";
  if (action.startsWith("fluidpay_") || entityId.startsWith("fluidpay")) return "fluidpay";
  if (action.startsWith("nmi_") || entityId.startsWith("nmi")) return "nmi";
  if (action.startsWith("zoho_") || entityId.startsWith("zoho")) return "zoho";
  if (action.startsWith("globalpayments_") || entityId.startsWith("globalpayments")) return "globalpayments";
  if (action.startsWith("propelrpay_") || entityId.startsWith("propelrpay")) return "propelrpay";
  if (action.startsWith("paypal_") || entityId.startsWith("paypal")) return "paypal";
  if (action.startsWith("twilio_") || entityId.startsWith("twilio")) return "twilio_voice";
  if (action.startsWith("telnyx_") || entityId.startsWith("telnyx")) return "telnyx_voice";
  if (action.startsWith("unchargeback_") || log.entity_type === "unchargeback_case") return "unchargeback";
  return null;
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

function requireFluidPayConfigured(res) {
  const status = fluidpayService.getStatus();
  if (!status.configured) {
    res.status(400).json({
      error: "FluidPay configuration is incomplete",
      missing: status.missing
    });
    return false;
  }

  return true;
}

function requireGlobalPaymentsConfigured(res) {
  const status = globalPaymentsService.getStatus();
  if (!status.configured) {
    res.status(400).json({
      error: "Global Payments configuration is incomplete",
      missing: status.missing
    });
    return false;
  }

  return true;
}

function requireNmiConfigured(res) {
  const status = nmiService.getStatus();
  if (!status.configured) {
    res.status(400).json({
      error: "NMI configuration is incomplete",
      missing: status.missing
    });
    return false;
  }

  return true;
}

function requireZohoConfigured(res) {
  const status = zohoPaymentsService.getStatus();
  if (!status.configured) {
    res.status(400).json({
      error: "Zoho Payments configuration is incomplete",
      missing: status.missing
    });
    return false;
  }

  return true;
}

function requirePropelrPayConfigured(res) {
  const status = propelrPayService.getStatus();
  if (!status.configured) {
    const missingText = status.missing?.length ? `: ${status.missing.join(", ")}` : "";
    res.status(400).json({
      error: `PropelrPay configuration is incomplete${missingText}`,
      missing: status.missing
    });
    return false;
  }

  return true;
}

function getCardProviderConfigStatus(provider) {
  if (provider === "paypal") {
    const managerStatus = paypalService.getManagerStatus();
    const nvpStatus = paypalService.getNvpStatus();
    const configured = managerStatus.configured || nvpStatus.configured;
    return {
      configured,
      missing: configured ? [] : [...managerStatus.missing, ...nvpStatus.missing],
      message: "PayPal configuration is incomplete"
    };
  }
  if (provider === "clover") {
    const missing = missingEnv([
      ["CLOVER_MERCHANT_ID", env.providers.clover.merchantId],
      ["CLOVER_API_TOKEN or CLOVER_API_KEY", env.providers.clover.apiKey]
    ]);
    return {
      configured: missing.length === 0,
      missing,
      message: "Clover configuration is incomplete"
    };
  }
  if (provider === "fluidpay") {
    const status = fluidpayService.getStatus();
    return {
      configured: status.configured,
      missing: status.missing || [],
      message: "FluidPay configuration is incomplete"
    };
  }
  if (provider === "braintree") {
    const status = braintreeService.getStatus();
    return {
      configured: status.configured,
      missing: status.missing || [],
      message: "Braintree configuration is incomplete"
    };
  }
  if (provider === "nmi") {
    const status = nmiService.getStatus();
    return {
      configured: status.configured,
      missing: status.missing || [],
      message: "NMI configuration is incomplete"
    };
  }
  if (provider === "zoho") {
    const status = zohoPaymentsService.getStatus();
    return {
      configured: status.configured,
      missing: status.missing || [],
      message: "Zoho Payments configuration is incomplete"
    };
  }
  if (provider === "globalpayments") {
    const status = globalPaymentsService.getStatus();
    return {
      configured: status.configured,
      missing: status.missing || [],
      message: "Global Payments configuration is incomplete"
    };
  }
  if (provider === "propelrpay") {
    const status = propelrPayService.getStatus();
    const missingText = status.missing?.length ? `: ${status.missing.join(", ")}` : "";
    return {
      configured: status.configured,
      missing: status.missing || [],
      message: `PropelrPay configuration is incomplete${missingText}`
    };
  }
  return {
    configured: false,
    missing: [],
    message: "Unsupported provider"
  };
}

const providerOperationCatalog = {
  propelr: {
    key: "propelr",
    provider: "propelr",
    label: "PropelrPay",
    description: "CardConnect REST tabanli PropelrPay akisi. Basic Auth, merchid env ve provider'a ozel request modeli kullanir.",
    requestModel: {
      payment: ["merchid", "account", "expiry", "amount"],
      transaction: ["merchid", "retref", "amount"]
    },
    methods: [
      {
        key: "ach_sale",
        label: "ACH / eCheck Sale",
        endpoint: "POST /api/provider-operations/cards",
        operation: "ach_sale",
        fields: ["routingNumber", "accountNumber", "amount", "accountHolderName", "achEntryCode", "merchid"],
        required: ["routingNumber", "accountNumber", "amount"],
        features: ["Sends bankaba, account, amount and achEntryCode to CardPointe /auth", "No card fields are shown", "Account and routing are redacted in logs/results"]
      },
      {
        key: "token_storage",
        label: "Token Storage Transaction",
        endpoint: "POST /api/provider-operations/cards",
        operation: "sale",
        fields: ["pan", "expiry", "amount", "merchid"],
        required: ["pan", "expiry", "amount"],
        features: ["Initial storage/payment request", "Returns retref for later stored-token usage"]
      },
      {
        key: "stored_token_usage",
        label: "Stored Token Usage by Retref",
        endpoint: "POST /api/provider-operations/cards",
        operation: "sale",
        fields: ["retref", "amount", "merchid"],
        required: ["retref", "amount"],
        features: ["Operator enters only the previous retref", "Server resolves the stored token from local records"]
      },
      {
        key: "auth",
        label: "Auth / Payment",
        endpoint: "POST /api/provider-operations/cards",
        operation: "auth",
        fields: ["pan", "expiry", "amount", "merchid"],
        required: ["pan", "expiry", "amount"],
        features: ["Sends account, expiry, amount, merchid", "Default CardConnect path: /auth", "API response returns amount.requestedAmount/submittedAmount/providerAmount"]
      },
      {
        key: "sale",
        label: "Sale",
        endpoint: "POST /api/provider-operations/cards",
        operation: "sale",
        fields: ["pan", "expiry", "amount", "merchid"],
        required: ["pan", "expiry", "amount"],
        features: ["Same CardConnect auth endpoint by default", "Sends capture=Y for payment sale scenario", "CardConnect respstat/respcode/resptext/retref are normalized"]
      },
      {
        key: "verification",
        label: "Verification",
        endpoint: "POST /api/provider-operations/cards",
        operation: "verification",
        fields: ["pan", "expiry", "amount", "merchid"],
        required: ["pan", "expiry"],
        features: ["Provider-only verification", "Does not trigger PayPal BIN check unless runBinCheck is true"]
      },
      {
        key: "amount_sequence",
        label: "2 Request Amount Sequence",
        endpoint: "POST /api/providers/propelr/amount-sequence",
        operation: "auth",
        fields: ["pan", "expiry", "sequenceAmount1", "sequenceAmount2", "merchid"],
        required: ["pan", "expiry", "sequenceAmount1", "sequenceAmount2"],
        features: ["Runs two Propelr auth requests sequentially", "Default amounts: 1,100.12 and 1,100.25", "Returns each outbound request body, submittedAmount, providerAmount and response"]
      },
      {
        key: "add_amount_by_retref",
        label: "Add Amount by Retref",
        endpoint: "POST /api/provider-operations/cards",
        operation: "capture",
        fields: ["retref", "amount", "merchid"],
        required: ["retref", "amount"],
        features: ["No card fields are shown", "Sends only retref and amount to the transaction operation", "Use for same-reference follow-up amounts"]
      },
      {
        key: "capture",
        label: "Capture",
        endpoint: "POST /api/provider-operations/cards",
        operation: "capture",
        fields: ["transactionId", "amount", "merchid"],
        required: ["transactionId"],
        features: ["Sends retref from transactionId", "amount is optional if provider allows full capture"]
      },
      {
        key: "refund",
        label: "Refund",
        endpoint: "POST /api/provider-operations/cards",
        operation: "refund",
        fields: ["transactionId", "amount", "merchid"],
        required: ["transactionId", "amount"],
        features: ["Sends retref and amount", "Default CardConnect path: /refund"]
      },
      {
        key: "void",
        label: "Void",
        endpoint: "POST /api/provider-operations/cards",
        operation: "void",
        fields: ["transactionId", "merchid"],
        required: ["transactionId"],
        features: ["Sends retref only with merchid", "Default CardConnect path: /void"]
      },
      {
        key: "transaction_detail",
        label: "Transaction Detail",
        endpoint: "GET /api/providers/propelr/transactions/:transactionId",
        operation: "transaction_detail",
        fields: ["transactionId"],
        required: ["transactionId"],
        features: ["Reads transaction status by provider reference", "Uses transaction path when configured"]
      }
    ]
  },
  fluidpay: {
    key: "fluidpay",
    provider: "fluidpay",
    label: "FluidPay",
    description: "FluidPay gateway card operations.",
    methods: [
      { key: "sale", label: "Sale", operation: "sale", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Gateway sale", "Amount in cents"] },
      { key: "auth", label: "Authorize", operation: "auth", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Authorization hold", "Capture later"] },
      { key: "verification", label: "Verification", operation: "verification", fields: ["pan", "expMonth", "expYear", "cvv2"], required: ["pan", "expMonth", "expYear"], features: ["Verification transaction"] },
      { key: "capture", label: "Capture", operation: "capture", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Capture an auth"] },
      { key: "refund", label: "Refund", operation: "refund", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Refund provider transaction"] },
      { key: "void", label: "Void", operation: "void", fields: ["transactionId"], required: ["transactionId"], features: ["Void provider transaction"] }
    ]
  },
  braintree: {
    key: "braintree",
    provider: "braintree",
    label: "Braintree",
    description: "Braintree GraphQL card operations using tokenized payment methods or direct card tokenization.",
    methods: [
      { key: "sale", label: "Sale", operation: "sale", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["chargePaymentMethod", "Amount is decimal currency value"] },
      { key: "auth", label: "Authorize", operation: "auth", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["authorizePaymentMethod", "Capture later by transaction id"] },
      { key: "verification", label: "Verification", operation: "verification", fields: ["pan", "expMonth", "expYear", "cvv2"], required: ["pan", "expMonth", "expYear"], features: ["Tokenizes card as a payment method", "No capture or sale is submitted"] },
      { key: "capture", label: "Capture", operation: "capture", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Capture previous authorization"] },
      { key: "refund", label: "Refund", operation: "refund", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Refund previous transaction"] },
      { key: "void", label: "Void", operation: "void", fields: ["transactionId"], required: ["transactionId"], features: ["Reverse an unsettled transaction"] }
    ]
  },
  nmi: {
    key: "nmi",
    provider: "nmi",
    label: "NMI",
    description: "NMI Payment API card operations using security key authentication.",
    methods: [
      { key: "sale", label: "Sale", operation: "sale", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Posts type=sale to /api/transact.php", "Amount is a decimal currency value"] },
      { key: "auth", label: "Authorize", operation: "auth", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Posts type=auth for an authorization hold", "Capture later by transaction id"] },
      { key: "verification", label: "Validate", operation: "verification", fields: ["pan", "expMonth", "expYear", "cvv2"], required: ["pan", "expMonth", "expYear"], features: ["Posts type=validate", "No amount is required"] },
      { key: "capture", label: "Capture", operation: "capture", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Captures a previous auth by transaction id"] },
      { key: "refund", label: "Refund", operation: "refund", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Refunds a previous transaction"] },
      { key: "void", label: "Void", operation: "void", fields: ["transactionId"], required: ["transactionId"], features: ["Voids an unsettled transaction"] },
      { key: "transaction_detail", label: "Transaction Detail", operation: "transaction_detail", fields: ["transactionId"], required: ["transactionId"], features: ["Reads transaction details through /api/query.php"] }
    ]
  },
  zoho: {
    key: "zoho",
    provider: "zoho",
    label: "Zoho Payments",
    description: "Zoho Payments operations using configured Zoho API base URL, OAuth/API key auth and env-driven operation paths.",
    methods: [
      { key: "sale", label: "Sale", operation: "sale", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Posts a sale payload to ZOHO_PAYMENTS_SALE_PATH", "Amount is a decimal currency value"] },
      { key: "auth", label: "Authorize", operation: "auth", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Posts an authorization payload to ZOHO_PAYMENTS_AUTH_PATH", "Capture later by transaction id"] },
      { key: "verification", label: "Verification", operation: "verification", fields: ["pan", "expMonth", "expYear", "cvv2"], required: ["pan", "expMonth", "expYear"], features: ["Posts card verification to ZOHO_PAYMENTS_VERIFY_PATH", "No amount is required by default"] },
      { key: "capture", label: "Capture", operation: "capture", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Captures a previous authorization by transaction id"] },
      { key: "refund", label: "Refund", operation: "refund", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Refunds a previous transaction"] },
      { key: "void", label: "Void", operation: "void", fields: ["transactionId"], required: ["transactionId"], features: ["Voids or cancels an unsettled transaction"] },
      { key: "transaction_detail", label: "Transaction Detail", operation: "transaction_detail", fields: ["transactionId"], required: ["transactionId"], features: ["Reads transaction details through ZOHO_PAYMENTS_TRANSACTION_PATH"] }
    ]
  },
  globalpayments: {
    key: "globalpayments",
    provider: "globalpayments",
    label: "Global Payments",
    description: "Global Payments / Portico card operations.",
    methods: [
      { key: "sale", label: "Sale", operation: "sale", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Sale request"] },
      { key: "auth", label: "Authorize", operation: "auth", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Authorization request"] },
      { key: "verification", label: "Verification", operation: "verification", fields: ["pan", "expMonth", "expYear", "cvv2"], required: ["pan", "expMonth", "expYear"], features: ["Card verification"] },
      { key: "capture", label: "Capture", operation: "capture", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Capture previous auth"] },
      { key: "refund", label: "Refund", operation: "refund", fields: ["transactionId", "amount"], required: ["transactionId"], features: ["Refund previous transaction"] },
      { key: "void", label: "Void", operation: "void", fields: ["transactionId"], required: ["transactionId"], features: ["Void previous transaction"] }
    ]
  },
  clover: {
    key: "clover",
    provider: "clover",
    label: "Clover",
    description: "Clover source-token based eCommerce operations.",
    methods: [
      { key: "verification", label: "Verify", operation: "verification", fields: ["pan", "expMonth", "expYear", "cvv2"], required: ["pan", "expMonth", "expYear", "cvv2"], features: ["Tokenizes card with Clover", "No eCommerce preauth is submitted"] },
      { key: "auth", label: "Auth / Preauth", operation: "auth", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "cvv2", "amount"], features: ["Tokenizes card with Clover", "Creates eCommerce preauthorization"] },
      { key: "void", label: "Void", operation: "void", fields: ["transactionId"], required: ["transactionId"], features: ["Voids a Clover preauthorization"] }
    ]
  },
  paypal: {
    key: "paypal",
    provider: "paypal",
    label: "PayPal",
    description: "PayPal NVP / Payflow payment operations.",
    methods: [
      { key: "sale", label: "Sale", operation: "sale", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["DoDirectPayment sale"] },
      { key: "auth", label: "Authorize", operation: "auth", fields: ["pan", "expMonth", "expYear", "cvv2", "amount", "currency"], required: ["pan", "expMonth", "expYear", "amount"], features: ["Authorization hold"] },
      { key: "capture", label: "Capture", operation: "capture", fields: ["authorizationPnref", "amount", "captureComplete"], required: ["authorizationPnref", "amount"], features: ["Capture PayPal authorization"] },
      { key: "void", label: "Void", operation: "void", fields: ["authorizationPnref", "note"], required: ["authorizationPnref"], features: ["Void PayPal authorization"] }
    ]
  }
};

function getProviderOperationCatalog() {
  const publicConfig = getPublicProviderConfig();
  return Object.fromEntries(
    Object.entries(providerOperationCatalog).map(([key, provider]) => [
      key,
      {
        ...provider,
        configured: Boolean(publicConfig[key]?.configured || publicConfig[key]?.ecommerceConfigured || publicConfig[key]?.tokenizationConfigured),
        config: publicConfig[key] || null
      }
    ])
  );
}

function normalizeProviderKey(provider) {
  const key = String(provider || "").toLowerCase();
  if (key === "propelr") return "propelrpay";
  if (key === "networkmerchants" || key === "network-merchants") return "nmi";
  if (key === "zohopayments" || key === "zoho-payments" || key === "zoho_payment") return "zoho";
  return key;
}

function requireCloverConfigured(res) {
  const missing = missingEnv([
    ["CLOVER_MERCHANT_ID", env.providers.clover.merchantId],
    ["CLOVER_API_TOKEN or CLOVER_API_KEY", env.providers.clover.apiKey]
  ]);
  if (missing.length > 0) {
    res.status(400).json({
      error: "Clover configuration is incomplete",
      missing
    });
    return false;
  }

  return true;
}

app.get("/health", asyncHandler(async (_req, res) => {
  const mongo = await getMongoStatus();
  res.status(mongo.ok ? 200 : 503).json({
    ok: mongo.ok,
    services: { mongo }
  });
}));

app.get("/api/system/mongodb/status", asyncHandler(async (_req, res) => {
  const mongo = await getMongoStatus();
  res.status(mongo.ok ? 200 : 503).json(mongo);
}));

app.get("/api/system/health", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  const [mongo, ollama] = await Promise.all([
    getMongoStatus(),
    getOllamaStatus()
  ]);
  const providerHealth = getPaymentProcessorHealthSnapshot();
  const providers = getProviderHealthRows();
  const ok = Boolean(mongo.ok && providers.every((provider) => !provider.configured || provider.live));
  res.status(ok ? 200 : 207).json({
    ok,
    generatedAt: new Date().toISOString(),
    services: {
      mongo,
      ollama,
      providers: {
        running: providerHealth.running,
        checkedAt: providerHealth.checkedAt,
        rows: providers
      }
    }
  });
}));

app.post("/api/system/health/check", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const [mongo, ollama, providerHealth] = await Promise.all([
    getMongoStatus(),
    getOllamaStatus(),
    runPaymentProcessorHealthChecks("manual-system-health")
  ]);
  const providers = getProviderHealthRows();
  const ok = Boolean(mongo.ok && providers.every((provider) => !provider.configured || provider.live));
  const response = {
    ok,
    generatedAt: new Date().toISOString(),
    services: {
      mongo,
      ollama,
      providers: {
        running: providerHealth.running,
        checkedAt: providerHealth.checkedAt,
        rows: providers
      }
    }
  };
  await writeOperationAuditLog({
    req,
    entityType: "system",
    entityId: "health",
    action: "system_health_check",
    status: ok ? "success" : "partial",
    details: response
  });
  res.status(ok ? 200 : 207).json(response);
}));

app.get("/api/security/burp-suite/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(burpSuiteService.getStatus());
}));

function getOllamaBaseUrl() {
  return process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
}

function getOllamaDefaultModel() {
  return process.env.OLLAMA_DEFAULT_MODEL || "qwen2.5:7b";
}

async function fetchOllamaTags() {
  const response = await fetch(process.env.OLLAMA_TAGS_URL || `${getOllamaBaseUrl()}/api/tags`);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { response, data };
}

async function getOllamaStatus() {
  try {
    const { response, data } = await fetchOllamaTags();
    const models = Array.isArray(data.models) ? data.models : [];
    return {
      ok: response.ok,
      configured: response.ok && models.length > 0,
      status: response.ok ? (models.length ? "healthy" : "no_models") : "unhealthy",
      baseUrl: getOllamaBaseUrl(),
      modelCount: models.length,
      models: models.map((model) => ({ name: model.name, modifiedAt: model.modified_at || null, size: model.size || null })),
      message: models.length
        ? "Ollama models loaded."
        : `Ollama çalışıyor ama yüklü model yok. Örnek: \`ollama pull ${getOllamaDefaultModel()}\``
    };
  } catch (error) {
    return {
      ok: false,
      configured: false,
      status: "unhealthy",
      baseUrl: getOllamaBaseUrl(),
      modelCount: 0,
      models: [],
      message: getOllamaErrorMessage(error)
    };
  }
}

function getOllamaErrorMessage(error) {
  if (error?.cause?.code === "ECONNREFUSED" || error?.code === "ECONNREFUSED") {
    return "Ollama servisi çalışmıyor. Önce `ollama serve` komutunu başlatın.";
  }
  return error?.message || "Ollama request failed";
}

app.get("/api/ollama/tags", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  const status = await getOllamaStatus();
  res.status(status.ok ? 200 : 503).json(status);
}));

app.get("/api/ollama/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  const status = await getOllamaStatus();
  res.status(status.ok ? 200 : 503).json(status);
}));

app.post("/api/ollama/chat", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  let payload = req.body || {};
  try {
    const { data } = await fetchOllamaTags();
    const models = Array.isArray(data.models) ? data.models : [];
    if (!models.length) {
      return res.status(503).json({
        ok: false,
        status: "failed",
        responseMessage: `Ollama çalışıyor ama yüklü model yok. Örnek: \`ollama pull ${getOllamaDefaultModel()}\``
      });
    }
    const requestedModel = String(payload.model || "").trim();
    const exists = models.some((model) => model.name === requestedModel);
    payload = {
      ...payload,
      model: exists ? requestedModel : models[0].name
    };
  } catch (error) {
    return res.status(503).json({
      ok: false,
      status: "failed",
      responseMessage: getOllamaErrorMessage(error)
    });
  }

  const response = await fetch(process.env.OLLAMA_CHAT_URL || `${getOllamaBaseUrl()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text };
    }
    return res.status(response.status).json({
      ok: false,
      status: "failed",
      responseMessage: data?.error || data?.message || "Ollama chat request failed",
      providerStatus: response.status,
      providerResponse: data
    });
  }

  res.status(response.status);
  res.setHeader("Content-Type", response.headers.get("content-type") || "application/x-ndjson");
  if (!response.body) {
    res.end(await response.text());
    return;
  }
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
}));

app.post("/api/security/burp-suite/start", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  res.json(burpSuiteService.startRuntime(req.body || {}));
}));

app.post("/api/security/burp-suite/stop", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(burpSuiteService.stopRuntime());
}));

app.post("/api/security/burp-suite/otp/arm", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  res.json(burpSuiteService.armOtpCapture(req.body || {}));
}));

app.post("/api/security/burp-suite/otp/send", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const targetUrl = body.targetUrl || `http://127.0.0.1:${env.port}/api/security/burp-suite/otp/inbox`;
  const result = await burpSuiteService.sendOtpChallenge({
    ...body,
    targetUrl
  });
  res.json(result);
}));

app.post("/api/security/burp-suite/otp/inbox", asyncHandler(async (req, res) => {
  if (req.get("x-local-otp-simulator") !== "PaymentApi") {
    return sendApiError(res, req, 403, "Local OTP simulator header is required", "MISSING_LOCAL_OTP_HEADER");
  }

  const record = burpSuiteService.recordOtpInbox(req.body || {});
  res.status(202).json({
    ok: true,
    received: true,
    id: record.id,
    createdAt: record.createdAt
  });
}));

app.get("/api/security/burp-suite/otp/messages", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  res.json({ messages: burpSuiteService.getOtpMessages(req.query.limit || 20) });
}));

app.get("/api/security/burp-suite/traffic", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  res.json({
    status: burpSuiteService.getStatus(),
    events: burpSuiteService.getTrafficEvents(req.query.limit || 50),
    pending: burpSuiteService.getPendingResponses(),
    otpMessages: burpSuiteService.getOtpMessages(20)
  });
}));

app.get("/api/security/burp-suite/pending", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json({ pending: burpSuiteService.getPendingResponses() });
}));

app.post("/api/security/burp-suite/pending/:pendingId/resolve", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  res.json(burpSuiteService.resolvePendingResponse(req.params.pendingId, req.body || {}));
}));

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return sendApiError(res, req, 400, "username and password are required", "VALIDATION_ERROR");
  }

  const user = await authenticate(username, password);
  if (!user) {
    return sendApiError(res, req, 401, "Invalid credentials", "INVALID_CREDENTIALS");
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

app.get("/api/providers/status-table", requireAuth, requirePermission("canListCards"), (_req, res) => {
  res.json({
    generatedAt: new Date().toISOString(),
    health: getPaymentProcessorHealthSnapshot(),
    rows: getProviderHealthRows()
  });
});

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
  if (!requireCloverConfigured(res)) {
    return;
  }
  const result = await cloverService.testConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "clover",
    action: "clover_connection_test",
    status: result.ok ? "success" : "failed",
    actorUserId: req.user.id,
    details: result
  });
  res.status(result.ok ? 200 : 400).json(result);
}));

app.get("/api/providers/clover/iframe-config", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(cloverService.getIframeConfig());
}));

app.post("/api/providers/clover/cards/tokenize", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  const { payload, tokenization } = await tokenizeCloverPayload({
    ...req.body,
    provider: "clover"
  });
  const card = buildCardLogSnapshot(payload);

  await writeAuditLog({
    entityType: "provider",
    entityId: "clover-tokenize",
    action: "clover_card_tokenize",
    status: "success",
    actorUserId: req.user.id,
    details: {
      card,
      tokenization
    }
  });

  res.json({
    ok: true,
    source: payload.source,
    tokenization,
    card
  });
}));

app.get("/api/providers/clover/merchant", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireCloverConfigured(res)) {
    return;
  }
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
  if (!requireCloverConfigured(res)) {
    return;
  }
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
  if (!requireCloverConfigured(res)) {
    return;
  }
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
  if (!requireCloverConfigured(res)) {
    return;
  }
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

app.post("/api/providers/clover/cards/verify-with-bin", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!req.user.permissions.canRunBinCheck) {
    return sendApiError(res, req, 403, "Missing permission: canRunBinCheck", "MISSING_PERMISSION");
  }

  const cardId = getSavedCardId(req.body.cardId);
  if (cardId) {
    await ensureCardExists(cardId);
  }

  const amount = Number(req.body.amount || 1);
  const currency = req.body.currency || "usd";
  const { payload, tokenization } = await tokenizeCloverPayload(req.body);
  const cardLog = buildCardLogSnapshot(payload);
  const [verificationResult, binResult] = await Promise.allSettled([
    cloverService.verifyCard({
      source: payload.source
    }),
    paypalService.binCheckCard(payload)
  ]);

  const verification = verificationResult.status === "fulfilled"
    ? {
        ok: true,
        ...verificationResult.value
      }
    : {
        ok: false,
        status: "failed",
        error: verificationResult.reason?.message || "Clover verification failed"
      };

  const binCheck = binResult.status === "fulfilled"
    ? {
        ok: true,
        ...binResult.value
      }
    : {
        ok: false,
        status: "failed",
        error: binResult.reason?.message || "BIN check failed"
      };

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
      balance_amount,
      created_by_user_id
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      cardId || null,
      "clover",
      "auth_check",
      verification.status,
      amount,
      String(currency).toUpperCase(),
      verification.cloverChargeId || null,
      serializeRawResponse({
        card: cardLog,
        verification,
        tokenization
      }),
      null,
      req.user.id
    ]
  );

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
      cardId || null,
      binCheck.status,
      serializeRawResponse({
        card: cardLog,
        binCheck
      }),
      req.user.id
    ]
  );

  if (cardId) {
    if (verification.ok) {
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
          verification.status === "approved" ? "verified" : verification.status === "review" ? "review" : "declined",
          verification.fraudChecks?.addressZipCheck || verification.fraudChecks?.addressLine1Check || null,
          verification.fraudChecks?.cvcCheck || verification.status,
          verification.cloverChargeId || null,
          "Clover verify-with-bin",
          cardId
        ]
      );
    }
  }

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || "clover-manual",
    action: "clover_verify_with_bin",
    status: verification.status,
    actorUserId: req.user.id,
    details: {
      card: cardLog,
      verification,
      binCheck,
      tokenization
    }
  });

  res.json({
    cardId: cardId || null,
    card: cardLog,
    verification,
    binCheck,
    tokenization
  });
}));

app.post("/api/providers/clover/cards/iframe-verify", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!req.user.permissions.canRunBinCheck) {
    return sendApiError(res, req, 403, "Missing permission: canRunBinCheck", "MISSING_PERMISSION");
  }
  if (!requireCloverConfigured(res)) {
    return;
  }

  const source = req.body.source || req.body.token;
  const payload = {
    ...req.body,
    provider: "clover",
    providerPaymentToken: source
  };
  const cardLog = buildCardLogSnapshot(payload);
  const [verificationResult, binResult] = await Promise.allSettled([
    cloverService.verifyCard({ source }),
    paypalService.binCheckCard(payload)
  ]);

  const verification = verificationResult.status === "fulfilled"
    ? {
        ok: true,
        ...verificationResult.value
      }
    : {
        ok: false,
        status: "failed",
        error: verificationResult.reason?.message || "Clover token verification failed"
      };
  const binCheck = binResult.status === "fulfilled"
    ? {
        ok: true,
        ...binResult.value
      }
    : {
        ok: false,
        status: "failed",
        error: binResult.reason?.message || "BIN check failed"
      };
  const savedCard = await upsertProviderCardRecord({
    provider: "clover",
    providerPaymentToken: source,
    payload,
    verificationStatus: verification.ok ? "review" : "declined",
    authResultCode: verification.status,
    notes: "Clover token-only iframe verification"
  });

  await query(
    `insert into verification_attempts (
      card_id,
      provider,
      attempt_type,
      status,
      amount,
      currency,
      raw_response,
      created_by_user_id
    ) values ($1, 'clover', 'iframe_verify', $2, $3, $4, $5, $6)`,
    [
      savedCard?.id || null,
      verification.status,
      Number(req.body.amount || 0),
      String(req.body.currency || "USD").toUpperCase(),
      serializeRawResponse({ card: cardLog, verification, binCheck }),
      req.user.id
    ]
  );

  await writeAuditLog({
    entityType: savedCard?.id ? "card" : "provider",
    entityId: savedCard?.id || "clover-iframe",
    action: "clover_iframe_token_verify",
    status: verification.status,
    actorUserId: req.user.id,
    details: {
      card: cardLog,
      verification,
      binCheck,
      savedCard: savedCard ? { id: savedCard.id, maskedPan: savedCard.maskedPan } : null
    }
  });

  res.json({
    cardId: savedCard?.id || null,
    card: cardLog,
    savedCard,
    verification,
    binCheck
  });
}));

app.post("/api/providers/clover/refund", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  if (!requireCloverConfigured(res)) {
    return;
  }
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

app.get("/api/providers/clover/tenders", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireCloverConfigured(res)) {
    return;
  }
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

app.get("/api/providers/fluidpay/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(fluidpayService.getStatus());
}));

app.post("/api/providers/fluidpay/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const result = await fluidpayService.testConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "fluidpay",
    action: "fluidpay_connection_test",
    status: result.ok ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      baseUrl: result.baseUrl,
      responseMessage: result.responseMessage,
      correlationId: result.correlationId,
      totalCount: result.totalCount
    }
  });
  res.status(result.ok ? 200 : 400).json(result);
}));

app.post("/api/providers/fluidpay/cards/sale", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const cardId = getSavedCardId(req.body.cardId);
  if (cardId) {
    await ensureCardExists(cardId);
  }

  const result = await fluidpayService.saleCard({
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
        balance_amount,
        created_by_user_id
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cardId,
        "fluidpay",
        "sale_check",
        result.status,
        result.amount,
        result.currency || "USD",
        result.transactionId,
        serializeRawResponse(result),
        null,
        req.user.id
      ]
    );
  }

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || "fluidpay-manual",
    action: "fluidpay_sale",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      transactionId: result.transactionId,
      amount: result.amount,
      currency: result.currency,
      correlationId: result.correlationId,
      card: result.card
    }
  });

  res.json(result);
}));

app.post("/api/providers/fluidpay/cards/auth", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const cardId = getSavedCardId(req.body.cardId);
  if (cardId) {
    await ensureCardExists(cardId);
  }

  const result = await fluidpayService.authorizeCard({
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
        balance_amount,
        created_by_user_id
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cardId,
        "fluidpay",
        "auth_check",
        result.status,
        result.amount,
        result.currency || "USD",
        result.transactionId,
        serializeRawResponse(result),
        null,
        req.user.id
      ]
    );

    await query(
      `update cards
      set
        verification_status = $1,
        avs_result = $2,
        auth_result_code = $3,
        provider_reference_id = $4,
        updated_at = current_timestamp
      where id = $5`,
      [
        result.status === "approved" ? "verified" : result.status === "unknown" ? "review" : "declined",
        result.avsResult || null,
        result.authCode || String(result.resultCode || "") || null,
        result.transactionId || null,
        cardId
      ]
    );
  }

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || "fluidpay-manual",
    action: "fluidpay_authorize",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      transactionId: result.transactionId,
      amount: result.amount,
      currency: result.currency,
      correlationId: result.correlationId,
      card: result.card
    }
  });

  res.json({
    ...result,
    authorizationId: result.transactionId,
    captureReady: result.status === "approved" && Boolean(result.transactionId)
  });
}));

app.post("/api/providers/fluidpay/cards/capture", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const result = await fluidpayService.captureTransaction({
    ...req.body,
    ipAddress: req.ip
  });
  await writeAuditLog({
    entityType: "provider",
    entityId: req.body.transactionId,
    action: "fluidpay_capture",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      transactionId: result.transactionId,
      amount: result.amount,
      currency: result.currency,
      correlationId: result.correlationId
    }
  });
  res.json(result);
}));

app.post("/api/providers/fluidpay/cards/void", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const result = await fluidpayService.voidTransaction(req.body);
  await writeAuditLog({
    entityType: "provider",
    entityId: req.body.transactionId,
    action: "fluidpay_void",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      responseMessage: result.responseMessage,
      transactionId: result.transactionId,
      correlationId: result.correlationId
    }
  });
  res.json(result);
}));

app.post("/api/providers/fluidpay/cards/refund", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const result = await fluidpayService.refundTransaction(req.body);
  await writeAuditLog({
    entityType: "provider",
    entityId: req.body.transactionId,
    action: "fluidpay_refund",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      transactionId: result.transactionId,
      amount: result.amount,
      currency: result.currency,
      correlationId: result.correlationId
    }
  });
  res.json(result);
}));

app.get("/api/providers/fluidpay/transactions/:transactionId", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const result = await fluidpayService.getTransaction(req.params.transactionId);
  await writeAuditLog({
    entityType: "provider",
    entityId: req.params.transactionId,
    action: "fluidpay_transaction_fetch",
    status: result.status === "success" ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      responseMessage: result.responseMessage,
      correlationId: result.correlationId
    }
  });
  res.json(result);
}));

app.post("/api/providers/fluidpay/transactions/search", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireFluidPayConfigured(res)) {
    return;
  }

  const result = await fluidpayService.searchTransactions(req.body);
  await writeAuditLog({
    entityType: "provider",
    entityId: "fluidpay",
    action: "fluidpay_transaction_search",
    status: result.ok ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      totalCount: result.totalCount,
      responseMessage: result.responseMessage,
      correlationId: result.correlationId
    }
  });
  res.json(result);
}));

app.get("/api/providers/globalpayments/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(globalPaymentsService.getStatus());
}));

app.post("/api/providers/globalpayments/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireGlobalPaymentsConfigured(res)) {
    return;
  }

  const result = await globalPaymentsService.testConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "globalpayments",
    action: "globalpayments_connection_test",
    status: result.ok ? "success" : "failed",
    actorUserId: req.user.id,
    details: {
      baseUrl: result.baseUrl,
      responseMessage: result.responseMessage,
      correlationId: result.correlationId
    }
  });
  res.status(result.ok ? 200 : 400).json(result);
}));

app.get("/api/providers/globalpayments/transactions/:transactionId", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireGlobalPaymentsConfigured(res)) {
    return;
  }

  const result = await globalPaymentsService.getTransaction(req.params.transactionId);
  await writeAuditLog({
    entityType: "provider",
    entityId: req.params.transactionId,
    action: "globalpayments_transaction_fetch",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      responseMessage: result.responseMessage,
      correlationId: result.correlationId
    }
  });
  res.json(result);
}));

async function runProviderCardOperation(req, res, { provider, operation }) {
  const operationId = uuidv4();
  const startedAt = new Date().toISOString();
  provider = normalizeProviderKey(provider);
  operation = String(operation || "").toLowerCase();
  try {
  if (!["clover", "fluidpay", "globalpayments", "propelrpay", "paypal", "braintree", "nmi", "zoho"].includes(provider)) {
    const response = buildOperationResponseModel({
      operationId,
      provider: provider || req.body.provider || null,
      operation,
      httpStatus: 400,
      result: {
        status: "failed",
        resultCode: "INVALID_PROVIDER",
        responseMessage: "provider must be clover, fluidpay, globalpayments, propelr, propelrpay, paypal, braintree, nmi or zoho"
      },
      request: req.body,
      logs: { audit: false, providerAttempt: false },
      startedAt
    });
    return res.status(400).json(response);
  }
  if (!["sale", "charge", "authorize", "auth", "ach", "ach_sale", "echeck", "verification", "verify", "live", "balance", "capture", "refund", "void", "reversal"].includes(operation)) {
    const response = buildOperationResponseModel({
      operationId,
      provider,
      operation,
      httpStatus: 400,
      result: {
        status: "failed",
        resultCode: "UNSUPPORTED_OPERATION",
        responseMessage: "Unsupported operation"
      },
      request: req.body,
      logs: { audit: false, providerAttempt: false },
      startedAt
    });
    return res.status(400).json(response);
  }
  if (["verification", "verify"].includes(operation) && !req.user.permissions.canRunBinCheck) {
    const response = buildOperationResponseModel({
      operationId,
      provider,
      operation,
      httpStatus: 403,
      result: {
        status: "failed",
        resultCode: "MISSING_PERMISSION",
        responseMessage: "Missing permission: canRunBinCheck"
      },
      request: req.body,
      logs: { audit: false, providerAttempt: false },
      startedAt
    });
    return res.status(403).json(response);
  }
  const configStatus = getCardProviderConfigStatus(provider);
  if (!configStatus.configured) {
    const response = buildOperationResponseModel({
      operationId,
      provider,
      operation,
      httpStatus: 400,
      result: {
        status: "failed",
        resultCode: "CONFIG_MISSING",
        responseMessage: configStatus.message,
        missing: configStatus.missing
      },
      request: req.body,
      logs: { audit: false, providerAttempt: false },
      startedAt
    });
    await writeOperationAuditLog({
      req,
      entityType: "provider",
      entityId: provider,
      action: `${provider}_${operation}_config_missing`,
      status: response.status,
      details: {
        operationId,
        httpStatus: 400,
        resultCode: response.resultCode,
        responseMessage: response.responseMessage,
        failureReason: response.failureReason,
        missing: configStatus.missing,
        request: response.request
      }
    });
    response.logs.audit = true;
    return res.status(400).json(response);
  }

  const requestedCardId = getSavedCardId(req.body.cardId);
  const retrefLookup = req.body.retref || req.body.initialRetref || req.body.initialTransactionId || req.body.originalTransactionId;
  const isTransactionOnly = ["capture", "refund", "void", "reversal"].includes(operation);
  let savedCard = requestedCardId ? await getCardRecord(requestedCardId) : null;
  if (!isTransactionOnly && !savedCard && retrefLookup && !req.body.pan && !req.body.account && !req.body.token && !req.body.source && !req.body.providerPaymentToken) {
    savedCard = await getCardRecordByProviderReferenceId(provider, retrefLookup);
    if (!savedCard) {
      const response = buildOperationResponseModel({
        operationId,
        provider,
        operation,
        httpStatus: 404,
        result: {
          status: "failed",
          resultCode: "STORED_TOKEN_NOT_FOUND",
          responseMessage: "No stored token was found for the supplied retref",
          failureReason: "Run token storage first, then submit stored token usage with that returned retref"
        },
        request: {
          provider,
          operation,
          retref: retrefLookup,
          amount: req.body.amount ?? null,
          currency: req.body.currency || null
        },
        logs: { audit: false, providerAttempt: false },
        startedAt
      });
      await writeOperationAuditLog({
        req,
        entityType: "provider",
        entityId: `${provider}-retref-${retrefLookup}`,
        action: `${provider}_${operation}_retref_lookup`,
        status: "failed",
        details: {
          operationId,
          resultCode: response.resultCode,
          responseMessage: response.responseMessage,
          failureReason: response.failureReason,
          retref: retrefLookup
        }
      });
      response.logs.audit = true;
      return res.status(404).json(response);
    }
  }
  let payload = payloadWithSavedCard({
    ...req.body,
    provider,
    operation,
    ipAddress: req.ip
  }, savedCard);
  let tokenization = null;
  if (provider === "clover" && ["verification", "verify", "authorize", "auth"].includes(operation) && !(payload.source || payload.providerPaymentToken || payload.token)) {
    const tokenized = await tokenizeCloverPayload(payload);
    payload = tokenized.payload;
    tokenization = tokenized.tokenization;
  }
  const cardLog = buildCardLogSnapshot(payload);

  let resultPromise;
  if (provider === "fluidpay") {
    if (operation === "sale" || operation === "charge") resultPromise = fluidpayService.saleCard(payload);
    if (operation === "authorize" || operation === "auth" || operation === "balance") resultPromise = fluidpayService.authorizeCard(payload);
    if (operation === "verification" || operation === "verify" || operation === "live") resultPromise = fluidpayService.createTransaction(payload, "verification");
    if (operation === "capture") resultPromise = fluidpayService.captureTransaction(payload);
    if (operation === "refund") resultPromise = fluidpayService.refundTransaction(payload);
    if (operation === "void" || operation === "reversal") resultPromise = fluidpayService.voidTransaction(payload);
  }
  if (provider === "braintree") {
    if (operation === "sale" || operation === "charge") resultPromise = braintreeService.saleCard(payload);
    if (operation === "authorize" || operation === "auth" || operation === "balance") resultPromise = braintreeService.authorizeCard(payload);
    if (operation === "verification" || operation === "verify" || operation === "live") resultPromise = braintreeService.verifyCard(payload);
    if (operation === "capture") resultPromise = braintreeService.captureTransaction(payload);
    if (operation === "refund") resultPromise = braintreeService.refundTransaction(payload);
    if (operation === "void" || operation === "reversal") resultPromise = braintreeService.voidTransaction(payload);
  }
  if (provider === "nmi") {
    if (operation === "sale" || operation === "charge") resultPromise = nmiService.saleCard(payload);
    if (operation === "authorize" || operation === "auth" || operation === "balance") resultPromise = nmiService.authorizeCard(payload);
    if (operation === "verification" || operation === "verify" || operation === "live") resultPromise = nmiService.verifyCard(payload);
    if (operation === "capture") resultPromise = nmiService.captureTransaction(payload);
    if (operation === "refund") resultPromise = nmiService.refundTransaction(payload);
    if (operation === "void" || operation === "reversal") resultPromise = nmiService.voidTransaction(payload);
  }
  if (provider === "zoho") {
    if (operation === "sale" || operation === "charge") resultPromise = zohoPaymentsService.saleCard(payload);
    if (operation === "authorize" || operation === "auth" || operation === "balance") resultPromise = zohoPaymentsService.authorizeCard(payload);
    if (operation === "verification" || operation === "verify" || operation === "live") resultPromise = zohoPaymentsService.verifyCard(payload);
    if (operation === "capture") resultPromise = zohoPaymentsService.captureTransaction(payload);
    if (operation === "refund") resultPromise = zohoPaymentsService.refundTransaction(payload);
    if (operation === "void" || operation === "reversal") resultPromise = zohoPaymentsService.voidTransaction(payload);
  }
  if (provider === "globalpayments") {
    if (operation === "sale" || operation === "charge") resultPromise = globalPaymentsService.saleCard(payload);
    if (operation === "authorize" || operation === "auth" || operation === "balance") resultPromise = globalPaymentsService.authorizeCard(payload);
    if (operation === "verification" || operation === "verify" || operation === "live") resultPromise = globalPaymentsService.verifyCard(payload);
    if (operation === "capture") resultPromise = globalPaymentsService.captureTransaction(payload);
    if (operation === "refund") resultPromise = globalPaymentsService.refundTransaction(payload);
    if (operation === "void" || operation === "reversal") resultPromise = globalPaymentsService.reverseTransaction(payload);
  }
  if (provider === "propelrpay") {
    if (operation === "sale" || operation === "charge") resultPromise = propelrPayService.saleCard(payload);
    if (operation === "authorize" || operation === "auth" || operation === "balance") resultPromise = propelrPayService.authorizeCard(payload);
    if (operation === "ach" || operation === "ach_sale" || operation === "echeck") resultPromise = propelrPayService.achSale(payload);
    if (operation === "verification" || operation === "verify" || operation === "live") resultPromise = propelrPayService.verifyCard(payload);
    if (operation === "capture") resultPromise = propelrPayService.captureTransaction(payload);
    if (operation === "refund") resultPromise = propelrPayService.refundTransaction(payload);
    if (operation === "void" || operation === "reversal") resultPromise = propelrPayService.reverseTransaction(payload);
  }
  if (provider === "paypal") {
    if (operation === "sale" || operation === "charge") resultPromise = paypalService.saleCardNvp(payload);
    if (operation === "authorize" || operation === "auth" || operation === "balance") resultPromise = paypalService.authorizeCardNvp(payload);
    if (operation === "verification" || operation === "verify" || operation === "live") resultPromise = paypalService.liveCheckCard(payload);
    if (operation === "capture") resultPromise = paypalService.captureAuthorizationNvp({ authorizationPnref: payload.transactionId || payload.retref, amount: payload.amount });
    if (operation === "void" || operation === "reversal") resultPromise = paypalService.voidAuthorizationNvp({ authorizationPnref: payload.transactionId || payload.retref });
  }
  if (provider === "clover") {
    if (operation === "verification" || operation === "verify" || operation === "live") {
      resultPromise = cloverService.verifyCard({
        source: payload.source || payload.providerPaymentToken || payload.token
      });
    } else if (operation === "authorize" || operation === "auth" || operation === "balance") {
      resultPromise = cloverService.createPreAuthorization({
        source: payload.source || payload.providerPaymentToken || payload.token,
        amount: Number(payload.amount || 1),
        currency: payload.currency || "usd"
      });
    } else if (operation === "void" || operation === "reversal") {
      resultPromise = cloverService.voidPreAuthorization({
        transactionId: payload.transactionId || payload.retref || payload.cloverChargeId
      });
    } else {
      const response = buildOperationResponseModel({
        operationId,
        provider,
        operation,
        httpStatus: 400,
        result: {
          status: "failed",
          resultCode: "UNSUPPORTED_CLOVER_OPERATION",
          responseMessage: "Clover provider operations currently support verification/authorize/void; refunds stay on the Clover refund form"
        },
        request: {
          provider,
          operation,
          amount: payload.amount,
          currency: payload.currency,
          card: cardLog
        },
        card: cardLog,
        logs: { audit: false, providerAttempt: false },
        startedAt
      });
      return res.status(400).json(response);
    }
  }

  if (!resultPromise) {
    const response = buildOperationResponseModel({
      operationId,
      provider,
      operation,
      httpStatus: 400,
      result: {
        status: "failed",
        resultCode: "UNSUPPORTED_PROVIDER_OPERATION",
        responseMessage: "Unsupported provider operation"
      },
      request: {
        provider,
        operation,
        amount: payload.amount,
        currency: payload.currency,
        card: cardLog
      },
      card: cardLog,
      logs: { audit: false, providerAttempt: false },
      startedAt
    });
    return res.status(400).json(response);
  }

  const shouldRunBinCheck = req.body.runBinCheck === true && ["verification", "verify", "live", "balance", "auth", "sale", "charge"].includes(operation) && Boolean(payload.bin || payload.first6 || cardLog.first6);
  const binPromise = shouldRunBinCheck
    ? paypalService.binCheckCard({
        ...payload,
        bin: payload.bin || payload.first6 || cardLog.first6
      })
    : Promise.resolve(null);
  const [operationResult, binResult] = await Promise.allSettled([resultPromise, binPromise]);
  const result = operationResult.status === "fulfilled"
    ? operationResult.value
    : {
        status: "failed",
        resultCode: "PROVIDER_REQUEST_FAILED",
        responseMessage: getProviderMessage(operationResult.reason),
        error: getProviderMessage(operationResult.reason)
      };
  const binCheck = binResult.status === "fulfilled"
    ? binResult.value ? { ok: true, ...binResult.value } : null
    : {
        ok: false,
        status: "failed",
        error: getProviderMessage(binResult.reason)
      };

  let operationNotes = `${provider} ${operation}`;
  if (binCheck?.ok && binCheck?.details) {
    const binNotes = `Bank: ${binCheck.details["Issuer Name / Bank"] || '-'}, Type: ${binCheck.details["Card Type"] || '-'} ${binCheck.details["Card Level"] || '-'}, Country: ${binCheck.details["ISO Country Code A2"] || '-'}`;
    operationNotes = `${operationNotes} | ${binNotes}`;
    payload.brand = payload.brand || binCheck.details["Card Brand"];
  }

  const providerPaymentToken = payload.providerPaymentToken ||
    payload.token ||
    payload.source ||
    getResultProviderPaymentToken(result) ||
    (!isTransactionOnly ? buildManualProviderToken(provider, payload) : null);
  const persistedCard = !isTransactionOnly
    ? await upsertProviderCardRecord({
        provider,
        providerPaymentToken,
        payload,
        verificationStatus: mapVerificationStatus(result.status),
        providerReferenceId: result.transactionId || result.cloverChargeId || result.pnref || null,
        avsResult: result.avsResult || result.fraudChecks?.addressZipCheck || result.fraudChecks?.addressLine1Check || result.avsZip || result.avsAddress || null,
        authResultCode: result.authCode || result.cvvResult || result.fraudChecks?.cvcCheck || result.resultCode || result.status || null,
        notes: operationNotes
      })
    : null;
  const cardId = persistedCard?.id || requestedCardId || null;

  await insertProviderAttempt({
    cardId,
    provider,
    attemptType: resultAttemptType(operation),
    status: result.status || "unknown",
    amount: result.amount ?? payload.amount ?? null,
    currency: result.currency || payload.currency || "USD",
    providerReferenceId: result.transactionId || result.cloverChargeId || result.pnref || payload.transactionId || payload.retref || null,
    rawResponse: {
      operation,
      request: {
        provider,
        operation,
        amount: payload.amount ?? null,
        gratuityAmount: payload.gratuityAmount ?? null,
        currency: payload.currency || null,
        transactionId: payload.transactionId || payload.retref || null,
        card: buildCardDebugSnapshot(payload)
      },
      card: cardLog,
      persistedCard,
      result,
      tokenization
    },
    createdByUserId: req.user.id
  });
  const providerAttemptLogged = true;

  let binAttemptLogged = false;
  if (binCheck) {
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
        binCheck.status,
        serializeRawResponse({
          card: cardLog,
          binCheck
        }),
        req.user.id
      ]
    );
    binAttemptLogged = true;
  }

  const amountSummary = provider === "propelrpay"
    ? {
        requestedAmount: payload.amount ?? null,
        submittedAmount: result.submittedAmount ?? payload.amount ?? null,
        providerAmount: result.providerAmount ?? null
      }
    : {
        requestedAmount: payload.amount ?? null,
        submittedAmount: result.amount ?? payload.amount ?? null,
        providerAmount: result.amount ?? null
      };

  const responseHttpStatus = operationResult.status === "fulfilled" ? 200 : 502;
  const responseModel = buildOperationResponseModel({
    operationId,
    provider,
    operation,
    httpStatus: responseHttpStatus,
    result,
    request: {
      provider,
      operation,
      amount: payload.amount ?? null,
      gratuityAmount: payload.gratuityAmount ?? null,
      currency: payload.currency || null,
      transactionId: payload.transactionId || payload.retref || null,
      card: cardLog
    },
    cardId,
    card: cardLog,
    persistedCard,
    amount: amountSummary,
    binCheck,
    tokenization,
    logs: {
      audit: false,
      providerAttempt: providerAttemptLogged,
      binAttempt: binAttemptLogged
    },
    startedAt
  });

  await writeOperationAuditLog({
    req,
    entityType: cardId ? "card" : "provider",
    entityId: cardId || `${provider}-manual`,
    action: `${provider}_${operation}`,
    status: responseModel.status || "unknown",
    details: {
      operationId,
      provider,
      operation,
      success: responseModel.success,
      httpStatus: responseHttpStatus,
      resultCode: responseModel.resultCode,
      responseMessage: responseModel.responseMessage,
      failureReason: responseModel.failureReason,
      storedCredential: result.storedCredential || null,
      request: responseModel.request,
      card: cardLog,
      persistedCard,
      result,
      amountSummary,
      binCheck,
      tokenization
    }
  });
  responseModel.logs.audit = true;

  return res.status(responseHttpStatus).json(responseModel);
  } catch (error) {
    return sendOperationExceptionResponse({
      req,
      res,
      error,
      operationId,
      provider,
      operation,
      request: {
        provider,
        operation,
        amount: req.body?.amount ?? null,
        currency: req.body?.currency || null,
        transactionId: req.body?.transactionId || req.body?.retref || null,
        card: buildCardLogSnapshot(req.body || {})
      },
      card: buildCardLogSnapshot(req.body || {}),
      startedAt,
      action: `${provider || "provider"}_${operation || "operation"}_exception`,
      entityId: provider || "provider"
    });
  }
}

function globalPaymentsCardRoute(operation) {
  return asyncHandler(async (req, res) => {
    await runProviderCardOperation(req, res, {
      provider: "globalpayments",
      operation
    });
  });
}

app.post("/api/providers/globalpayments/cards/sale", requireAuth, requirePermission("canRunAuthCheck"), globalPaymentsCardRoute("sale"));
app.post("/api/providers/globalpayments/cards/auth", requireAuth, requirePermission("canRunAuthCheck"), globalPaymentsCardRoute("authorize"));
app.post("/api/providers/globalpayments/cards/verify", requireAuth, requirePermission("canRunAuthCheck"), globalPaymentsCardRoute("verification"));
app.post("/api/providers/globalpayments/cards/capture", requireAuth, requirePermission("canRunAuthCheck"), globalPaymentsCardRoute("capture"));
app.post("/api/providers/globalpayments/cards/refund", requireAuth, requirePermission("canRunAuthCheck"), globalPaymentsCardRoute("refund"));
app.post("/api/providers/globalpayments/cards/void", requireAuth, requirePermission("canRunAuthCheck"), globalPaymentsCardRoute("void"));

app.get("/api/providers/braintree/client-token", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  const status = braintreeService.getStatus();
  if (!status.configured) {
    return sendApiError(res, req, 400, "Braintree configuration is incomplete", "CONFIG_MISSING");
  }
  const result = await braintreeService.generateClientToken({
    customerId: req.query.customerId
  });
  res.json(result);
}));

app.post("/api/providers/braintree/dropin/checkout", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  const operationId = uuidv4();
  const startedAt = new Date().toISOString();
  const operation = String(req.body.operation || "sale").toLowerCase();
  const request = {
    provider: "braintree",
    operation,
    amount: req.body.amount ?? null,
    currency: req.body.currency || "USD",
    submitForSettlement: req.body.submitForSettlement,
    deviceData: req.body.deviceData ? "[present]" : null
  };

  try {
    const configStatus = getCardProviderConfigStatus("braintree");
    if (!configStatus.configured) {
      const responseModel = buildOperationResponseModel({
        operationId,
        provider: "braintree",
        operation,
        httpStatus: 400,
        result: {
          status: "failed",
          resultCode: "CONFIG_MISSING",
          responseMessage: configStatus.message,
          missing: configStatus.missing
        },
        request,
        logs: { audit: false, providerAttempt: false },
        startedAt
      });
      await writeOperationAuditLog({
        req,
        entityType: "provider",
        entityId: "braintree",
        action: `braintree_${operation}_dropin_config_missing`,
        status: responseModel.status,
        details: {
          operationId,
          resultCode: responseModel.resultCode,
          responseMessage: responseModel.responseMessage,
          missing: configStatus.missing,
          request: responseModel.request
        }
      });
      responseModel.logs.audit = true;
      return res.status(400).json(responseModel);
    }

    const result = await braintreeService.checkoutNonce(req.body);
    const responseHttpStatus = isSuccessfulOperationStatus(result.status) ? 200 : 402;
    const responseModel = buildOperationResponseModel({
      operationId,
      provider: "braintree",
      operation,
      httpStatus: responseHttpStatus,
      result,
      request,
      amount: {
        requestedAmount: req.body.amount ?? null,
        submittedAmount: result.amount ?? req.body.amount ?? null,
        providerAmount: result.amount ?? null
      },
      logs: { audit: false, providerAttempt: false },
      startedAt
    });

    await insertProviderAttempt({
      cardId: getSavedCardId(req.body.cardId) || null,
      provider: "braintree",
      attemptType: resultAttemptType(operation),
      status: responseModel.status,
      amount: result.amount ?? req.body.amount ?? null,
      currency: result.currency || req.body.currency || "USD",
      providerReferenceId: result.transactionId || null,
      rawResponse: {
        operation,
        request,
        result
      },
      createdByUserId: req.user.id
    });
    responseModel.logs.providerAttempt = true;

    await writeOperationAuditLog({
      req,
      entityType: "provider",
      entityId: result.transactionId || "braintree-dropin",
      action: `braintree_${operation}_dropin_checkout`,
      status: responseModel.status,
      details: {
        operationId,
        success: responseModel.success,
        httpStatus: responseHttpStatus,
        resultCode: responseModel.resultCode,
        responseMessage: responseModel.responseMessage,
        failureReason: responseModel.failureReason,
        request: responseModel.request,
        result
      }
    });
    responseModel.logs.audit = true;

    return res.status(responseHttpStatus).json(responseModel);
  } catch (error) {
    return sendOperationExceptionResponse({
      req,
      res,
      error,
      operationId,
      provider: "braintree",
      operation,
      request,
      startedAt,
      action: `braintree_${operation}_dropin_exception`,
      entityId: "braintree"
    });
  }
}));

function nmiCardRoute(operation) {
  return asyncHandler(async (req, res) => {
    await runProviderCardOperation(req, res, {
      provider: "nmi",
      operation
    });
  });
}

app.get("/api/providers/nmi/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(nmiService.getStatus());
}));

app.post("/api/providers/nmi/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireNmiConfigured(res)) {
    return;
  }

  const result = await nmiService.testConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "nmi",
    action: "nmi_connection_test",
    status: result.ok ? "success" : result.status || "unknown",
    actorUserId: req.user.id,
    details: result
  });
  res.status(result.ok ? 200 : 400).json(result);
}));

app.post("/api/providers/nmi/cards/sale", requireAuth, requirePermission("canRunAuthCheck"), nmiCardRoute("sale"));
app.post("/api/providers/nmi/cards/auth", requireAuth, requirePermission("canRunAuthCheck"), nmiCardRoute("authorize"));
app.post("/api/providers/nmi/cards/verify", requireAuth, requirePermission("canRunAuthCheck"), nmiCardRoute("verification"));
app.post("/api/providers/nmi/cards/capture", requireAuth, requirePermission("canRunAuthCheck"), nmiCardRoute("capture"));
app.post("/api/providers/nmi/cards/refund", requireAuth, requirePermission("canRunAuthCheck"), nmiCardRoute("refund"));
app.post("/api/providers/nmi/cards/void", requireAuth, requirePermission("canRunAuthCheck"), nmiCardRoute("void"));
app.get("/api/providers/nmi/transactions/:transactionId", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireNmiConfigured(res)) {
    return;
  }
  const result = await nmiService.getTransaction(req.params.transactionId);
  res.json(result);
}));

function zohoCardRoute(operation) {
  return asyncHandler(async (req, res) => {
    await runProviderCardOperation(req, res, {
      provider: "zoho",
      operation
    });
  });
}

app.get("/api/providers/zoho/status", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(zohoPaymentsService.getStatus());
}));

app.post("/api/providers/zoho/test", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireZohoConfigured(res)) {
    return;
  }

  const result = await zohoPaymentsService.testConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "zoho",
    action: "zoho_connection_test",
    status: result.ok ? "success" : result.status || "unknown",
    actorUserId: req.user.id,
    details: result
  });
  res.status(result.ok === false ? 400 : 200).json(result);
}));

app.post("/api/providers/zoho/cards/sale", requireAuth, requirePermission("canRunAuthCheck"), zohoCardRoute("sale"));
app.post("/api/providers/zoho/cards/auth", requireAuth, requirePermission("canRunAuthCheck"), zohoCardRoute("authorize"));
app.post("/api/providers/zoho/cards/verify", requireAuth, requirePermission("canRunAuthCheck"), zohoCardRoute("verification"));
app.post("/api/providers/zoho/cards/capture", requireAuth, requirePermission("canRunAuthCheck"), zohoCardRoute("capture"));
app.post("/api/providers/zoho/cards/refund", requireAuth, requirePermission("canRunAuthCheck"), zohoCardRoute("refund"));
app.post("/api/providers/zoho/cards/void", requireAuth, requirePermission("canRunAuthCheck"), zohoCardRoute("void"));
app.get("/api/providers/zoho/transactions/:transactionId", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requireZohoConfigured(res)) {
    return;
  }
  const result = await zohoPaymentsService.getTransaction(req.params.transactionId);
  res.json(result);
}));

app.get(["/api/providers/propelrpay/status", "/api/providers/propelr/status"], requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(propelrPayService.getStatus());
}));

app.get("/api/provider-operations/catalog", requireAuth, requirePermission("canListCards"), (_req, res) => {
  res.json(getProviderOperationCatalog());
});

app.post(["/api/providers/propelrpay/test", "/api/providers/propelr/test"], requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  if (!requirePropelrPayConfigured(res)) {
    return;
  }

  const result = await propelrPayService.testConnection();
  await writeAuditLog({
    entityType: "provider",
    entityId: "propelrpay",
    action: "propelrpay_connection_test",
    status: result.ok ? "success" : result.status || "unknown",
    actorUserId: req.user.id,
    details: {
      baseUrl: result.baseUrl,
      responseMessage: result.responseMessage,
      correlationId: result.correlationId,
      pathStatus: result.pathStatus
    }
  });
  res.status(result.ok === false ? 400 : 200).json(result);
}));

app.post(["/api/providers/propelrpay/amount-sequence", "/api/providers/propelr/amount-sequence"], requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  const operationId = uuidv4();
  const startedAt = new Date().toISOString();
  const request = {
    provider: "propelrpay",
    operation: "amount_sequence",
    amounts: req.body.amounts || [req.body.sequenceAmount1, req.body.sequenceAmount2].filter(Boolean),
    card: buildCardLogSnapshot(req.body)
  };
  try {
    const configStatus = getCardProviderConfigStatus("propelrpay");
    if (!configStatus.configured) {
      const responseModel = buildOperationResponseModel({
        operationId,
        provider: "propelrpay",
        operation: "amount_sequence",
        httpStatus: 400,
        result: {
          status: "failed",
          resultCode: "CONFIG_MISSING",
          responseMessage: configStatus.message,
          missing: configStatus.missing
        },
        request,
        card: buildCardLogSnapshot(req.body),
        logs: { audit: false, providerAttempt: false },
        startedAt
      });
      await writeOperationAuditLog({
        req,
        entityType: "provider",
        entityId: "propelrpay",
        action: "propelrpay_amount_sequence_config_missing",
        status: responseModel.status,
        details: {
          operationId,
          resultCode: responseModel.resultCode,
          responseMessage: responseModel.responseMessage,
          failureReason: responseModel.failureReason,
          missing: configStatus.missing,
          request: responseModel.request
        }
      });
      responseModel.logs.audit = true;
      return res.status(400).json(responseModel);
    }

    const result = await propelrPayService.runAmountSequence(req.body);
    const httpStatus = result.ok ? 200 : 207;
    const responseModel = buildOperationResponseModel({
      operationId,
      provider: "propelrpay",
      operation: "amount_sequence",
      httpStatus,
      result: {
        ...result,
        status: result.ok ? "success" : "partial",
        resultCode: result.ok ? "OK" : "PARTIAL",
        responseMessage: result.ok ? "Propelr amount sequence completed" : "Propelr amount sequence completed with one or more non-success responses"
      },
      request,
      card: buildCardLogSnapshot(req.body),
      logs: { audit: false, providerAttempt: false },
      startedAt
    });
    await writeOperationAuditLog({
      req,
      entityType: "provider",
      entityId: "propelrpay",
      action: "propelrpay_amount_sequence",
      status: responseModel.status,
      details: {
        operationId,
        success: responseModel.success,
        httpStatus,
        resultCode: responseModel.resultCode,
        responseMessage: responseModel.responseMessage,
        failureReason: responseModel.failureReason,
        request: responseModel.request,
        result
      }
    });
    responseModel.logs.audit = true;
    return res.status(httpStatus).json(responseModel);
  } catch (error) {
    return sendOperationExceptionResponse({
      req,
      res,
      error,
      operationId,
      provider: "propelrpay",
      operation: "amount_sequence",
      request,
      card: buildCardLogSnapshot(req.body),
      startedAt,
      action: "propelrpay_amount_sequence_exception",
      entityId: "propelrpay"
    });
  }
}));

app.get(["/api/providers/propelrpay/transactions/:transactionId", "/api/providers/propelr/transactions/:transactionId"], requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const operationId = uuidv4();
  const startedAt = new Date().toISOString();
  const request = {
    provider: "propelrpay",
    operation: "transaction_detail",
    transactionId: req.params.transactionId
  };
  try {
    const configStatus = getCardProviderConfigStatus("propelrpay");
    if (!configStatus.configured) {
      const responseModel = buildOperationResponseModel({
        operationId,
        provider: "propelrpay",
        operation: "transaction_detail",
        httpStatus: 400,
        result: {
          status: "failed",
          resultCode: "CONFIG_MISSING",
          responseMessage: configStatus.message,
          missing: configStatus.missing
        },
        request,
        logs: { audit: false, providerAttempt: false },
        startedAt
      });
      await writeOperationAuditLog({
        req,
        entityType: "provider",
        entityId: "propelrpay",
        action: "propelrpay_transaction_fetch_config_missing",
        status: responseModel.status,
        details: {
          operationId,
          resultCode: responseModel.resultCode,
          responseMessage: responseModel.responseMessage,
          failureReason: responseModel.failureReason,
          missing: configStatus.missing,
          request: responseModel.request
        }
      });
      responseModel.logs.audit = true;
      return res.status(400).json(responseModel);
    }

    const result = await propelrPayService.getTransaction(req.params.transactionId);
    const responseModel = buildOperationResponseModel({
      operationId,
      provider: "propelrpay",
      operation: "transaction_detail",
      httpStatus: 200,
      result,
      request,
      logs: { audit: false, providerAttempt: false },
      startedAt
    });
    await writeOperationAuditLog({
      req,
      entityType: "provider",
      entityId: req.params.transactionId,
      action: "propelrpay_transaction_fetch",
      status: responseModel.status,
      details: {
        operationId,
        success: responseModel.success,
        httpStatus: 200,
        resultCode: responseModel.resultCode,
        responseMessage: responseModel.responseMessage,
        failureReason: responseModel.failureReason,
        correlationId: result.correlationId,
        result
      }
    });
    responseModel.logs.audit = true;
    return res.json(responseModel);
  } catch (error) {
    return sendOperationExceptionResponse({
      req,
      res,
      error,
      operationId,
      provider: "propelrpay",
      operation: "transaction_detail",
      request,
      startedAt,
      action: "propelrpay_transaction_fetch_exception",
      entityType: "provider",
      entityId: req.params.transactionId
    });
  }
}));

app.post("/api/provider-operations/cards", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  await runProviderCardOperation(req, res, {
    provider: req.body.provider,
    operation: req.body.operation
  });
}));

app.post("/api/checkers/balance", requireAuth, requirePermission("canRunBalanceCheck"), asyncHandler(async (req, res) => {
  const cardId = getSavedCardId(req.body.cardId);
  const savedCard = cardId ? await getCardRecord(cardId) : null;
  const payload = payloadWithSavedCard(req.body, savedCard);
  const cardLog = buildCardLogSnapshot(payload);
  const balanceAmount = req.body.balanceAmount == null || req.body.balanceAmount === ""
    ? null
    : Number(req.body.balanceAmount);
  const status = Number.isFinite(balanceAmount) ? "recorded" : "review";

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
      cardId || null,
      req.body.provider || "manual",
      "balance_check",
      status,
      req.body.amount == null ? null : Number(req.body.amount),
      String(req.body.currency || "USD").toUpperCase(),
      req.body.reference || null,
      serializeRawResponse({
        card: cardLog,
        message: "Balance check record created from checker screen"
      }),
      Number.isFinite(balanceAmount) ? balanceAmount : null,
      req.user.id
    ]
  );

  await writeAuditLog({
    entityType: cardId ? "card" : "checker",
    entityId: cardId || "manual-balance",
    action: "balance_check_recorded",
    status,
    actorUserId: req.user.id,
    details: {
      card: cardLog,
      balanceAmount: Number.isFinite(balanceAmount) ? balanceAmount : null
    }
  });

  res.status(201).json({
    id: result.rows[0].id,
    cardId: cardId || null,
    status,
    balanceAmount: req.user.permissions.canViewBalance ? (Number.isFinite(balanceAmount) ? balanceAmount : null) : null,
    responseMessage: "Balance check recorded",
    createdAt: result.rows[0].created_at
  });
}));

app.get("/api/unchargeback/cases", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  const cases = await unchargebackService.listCases();
  res.json({ data: cases });
}));

app.post("/api/unchargeback/cases", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const created = await unchargebackService.createCase(req.body, req.user.id);
  await writeAuditLog({
    entityType: "unchargeback_case",
    entityId: created.id,
    action: "unchargeback_case_created",
    status: "success",
    actorUserId: req.user.id,
    details: {
      ownerName: created.owner_name,
      ownerNumber: created.owner_number,
      contentPrice: created.content_price,
      caseId: created.case_id,
      transactionId: created.transaction_id
    }
  });

  res.status(201).json(created);
}));

app.post("/api/unchargeback/cases/:caseId/:kind", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const updated = await unchargebackService.updateEmbed(
    req.params.caseId,
    req.params.kind,
    req.body.embedHtml
  );
  await writeAuditLog({
    entityType: "unchargeback_case",
    entityId: updated.id,
    action: `unchargeback_${req.params.kind}_saved`,
    status: "success",
    actorUserId: req.user.id,
    details: {
      kind: req.params.kind,
      src: updated[`${req.params.kind}_src`] || null
    }
  });

  res.json(updated);
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

app.post("/api/providers/paypal/direct-payment/cards/sale", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requirePayPalNvpConfigured(res)) {
    return;
  }

  const cardId = getSavedCardId(req.body.cardId);
  if (cardId) {
    await ensureCardExists(cardId);
  }

  const result = await paypalService.saleCardNvp({
    ...req.body,
    ipAddress: req.ip
  });

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || "paypal-manual",
    action: "paypal_nvp_sale",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      processor: result.processor,
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      transactionId: result.pnref,
      amount: result.amount,
      card: result.card
    }
  });

  res.json({
    status: result.status,
    resultCode: result.resultCode,
    responseMessage: result.responseMessage,
    transactionId: result.pnref,
    processor: result.processor,
    authCode: result.authCode,
    avsAddress: result.avsAddress,
    avsZip: result.avsZip,
    cvv2Match: result.cvv2Match,
    amount: result.amount,
    card: result.card
  });
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

app.post("/api/providers/paypal/direct-payment/cards/void", requireAuth, requirePermission("canRunAuthCheck"), asyncHandler(async (req, res) => {
  if (!requirePayPalNvpConfigured(res)) {
    return;
  }

  const cardId = getSavedCardId(req.body.cardId);
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

  const result = await paypalService.voidAuthorizationNvp({
    authorizationPnref,
    note: req.body.note
  });

  await writeAuditLog({
    entityType: cardId ? "card" : "provider",
    entityId: cardId || authorizationPnref,
    action: "paypal_nvp_void",
    status: result.status,
    actorUserId: req.user.id,
    details: {
      processor: result.processor,
      resultCode: result.resultCode,
      responseMessage: result.responseMessage,
      originalPnref: result.originalPnref
    }
  });

  res.json({
    status: result.status,
    resultCode: result.resultCode,
    responseMessage: result.responseMessage,
    originalPnref: result.originalPnref,
    processor: result.processor,
    authCode: result.authCode
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

app.get("/api/provider-reports", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const limit = Math.max(0, Number(req.query.limit ?? 0));
  const database = await db.getDb();
  const catalog = getProviderReportCatalog();
  const reportsByKey = Object.fromEntries(catalog.map((provider) => [
    provider.key,
    {
      ...provider,
      transactionCount: 0,
      auditCount: 0,
      transactions: [],
      auditLogs: []
    }
  ]));

  const transactionCursor = database.collection("verification_attempts")
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 });
  const auditCursor = database.collection("audit_logs")
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 });

  if (limit > 0) {
    transactionCursor.limit(limit);
    auditCursor.limit(limit);
  }

  const [transactions, auditLogs] = await Promise.all([
    transactionCursor.toArray(),
    auditCursor.toArray()
  ]);

  for (const transaction of transactions) {
    const providerKey = classifyAttemptProvider(transaction);
    const report = reportsByKey[providerKey];
    if (!report) {
      continue;
    }
    const normalized = {
      ...transaction,
      raw_response: redactSensitiveReportData(safeParseJson(transaction.raw_response))
    };
    report.transactionCount += 1;
    report.transactions.push(normalized);
  }

  for (const log of auditLogs) {
    const providerKey = classifyAuditProvider(log);
    const report = providerKey ? reportsByKey[providerKey] : null;
    if (!report) {
      continue;
    }
    const normalized = {
      ...log,
      details: redactSensitiveReportData(safeParseJson(log.details))
    };
    report.auditCount += 1;
    report.auditLogs.push(normalized);
  }

  const groups = catalog.reduce((acc, provider) => {
    if (!acc[provider.group]) {
      acc[provider.group] = [];
    }
    acc[provider.group].push(reportsByKey[provider.key]);
    return acc;
  }, {});

  res.json({
    generatedAt: new Date().toISOString(),
    limit,
    groups,
    providers: Object.values(reportsByKey),
    envHelp: {
      fluidpay: {
        required: ["FLUIDPAY_API_KEY"],
        recommendedDev: {
          FLUIDPAY_ENV: process.env.FLUIDPAY_ENV || "sandbox",
          FLUIDPAY_API_BASE_URL: env.providers.fluidpay.baseUrl || "https://sandbox.fluidpay.com",
          FLUIDPAY_PROCESSOR_ID: "optional unless your FluidPay account has no default processor",
          FLUIDPAY_TIMEOUT_MS: String(env.providers.fluidpay.timeoutMs || 180000)
        },
        missing: reportsByKey.fluidpay.missing
      },
      braintree: {
        required: ["BRAINTREE_MERCHANT_ID", "BRAINTREE_PUBLIC_KEY", "BRAINTREE_PRIVATE_KEY"],
        recommendedDev: {
          BRAINTREE_ENV: process.env.BRAINTREE_ENV || "sandbox",
          BRAINTREE_GRAPHQL_URL: env.providers.braintree.baseUrl || "https://payments.sandbox.braintree-api.com/graphql",
          BRAINTREE_MERCHANT_ACCOUNT_ID: env.providers.braintree.merchantAccountId || "optional unless required by your Braintree account",
          BRAINTREE_TIMEOUT_MS: String(env.providers.braintree.timeoutMs || 180000)
        },
        missing: reportsByKey.braintree.missing
      },
      nmi: {
        required: ["NMI_PAYMENT_API_KEY or NMI_SECURITY_KEY"],
        recommendedDev: {
          NMI_API_BASE_URL: env.providers.nmi.baseUrl || "https://secure.nmi.com",
          NMI_TRANSACTION_PATH: env.providers.nmi.transactionPath || "/api/transact.php",
          NMI_QUERY_PATH: env.providers.nmi.queryPath || "/api/query.php",
          NMI_CLIENT_KEY: env.providers.nmi.clientKey ? "configured" : "optional for Collect.js/client tokenization",
          NMI_COMPONENT_TOKEN_KEY: env.providers.nmi.componentTokenKey ? "configured" : "optional for component tokenization",
          NMI_TIMEOUT_MS: String(env.providers.nmi.timeoutMs || 180000)
        },
        missing: reportsByKey.nmi.missing
      },
      zoho: {
        required: ["ZOHO_PAYMENTS_API_BASE_URL", "ZOHO_PAYMENTS_ACCESS_TOKEN or ZOHO_PAYMENTS_API_KEY or OAuth refresh credentials"],
        recommendedDev: {
          ZOHO_PAYMENTS_API_BASE_URL: env.providers.zoho.baseUrl || "provided by Zoho Payments/API product docs",
          ZOHO_ACCOUNTS_BASE_URL: env.providers.zoho.accountsUrl || "https://accounts.zoho.com",
          ZOHO_PAYMENTS_ORGANIZATION_ID: env.providers.zoho.organizationId ? "configured" : "optional unless required by selected Zoho API",
          ZOHO_PAYMENTS_STATUS_PATH: env.providers.zoho.paths.status || "optional health/status endpoint",
          ZOHO_PAYMENTS_SALE_PATH: env.providers.zoho.paths.sale || "provider-specific",
          ZOHO_PAYMENTS_AUTH_PATH: env.providers.zoho.paths.authorize || "provider-specific",
          ZOHO_PAYMENTS_VERIFY_PATH: env.providers.zoho.paths.verification || "provider-specific",
          ZOHO_PAYMENTS_CAPTURE_PATH: env.providers.zoho.paths.capture || "provider-specific",
          ZOHO_PAYMENTS_REFUND_PATH: env.providers.zoho.paths.refund || "provider-specific",
          ZOHO_PAYMENTS_VOID_PATH: env.providers.zoho.paths.void || "provider-specific",
          ZOHO_PAYMENTS_TRANSACTION_PATH: env.providers.zoho.paths.transaction || "provider-specific"
        },
        missing: reportsByKey.zoho.missing,
        optionalMissing: reportsByKey.zoho.optionalMissing
      },
      globalpayments: {
        required: ["GLOBALPAYMENTS_APP_ID or GLOBALPAYMENTS_PUBLIC_API_KEY", "GLOBALPAYMENTS_APP_KEY or GLOBALPAYMENTS_SECRET_API_KEY"],
        recommendedDev: {
          GLOBALPAYMENTS_ENV: process.env.GLOBALPAYMENTS_ENV || "sandbox",
          GLOBALPAYMENTS_API_MODE: env.providers.globalpayments.mode || "ucp",
          GLOBALPAYMENTS_API_BASE_URL: env.providers.globalpayments.baseUrl || "https://apis.sandbox.globalpay.com/ucp",
          GLOBALPAYMENTS_MERCHANT_ID: env.providers.globalpayments.merchantId ? "configured" : "optional support reference",
          GLOBALPAYMENTS_SITE_ID: env.providers.globalpayments.siteId ? "configured" : "optional support reference",
          GLOBALPAYMENTS_DEVICE_ID: env.providers.globalpayments.deviceId ? "configured" : "optional support reference",
          GLOBALPAYMENTS_WEBSITE: env.providers.globalpayments.website || "optional support reference",
          GLOBALPAYMENTS_KEY_TYPE: env.providers.globalpayments.keyType || "optional support reference",
          GLOBALPAYMENTS_ACCOUNT_NAME: env.providers.globalpayments.accountName || "Transaction_Processing",
          GLOBALPAYMENTS_CHANNEL: env.providers.globalpayments.channel || "CNP",
          GLOBALPAYMENTS_COUNTRY: env.providers.globalpayments.country || "US",
          GLOBALPAYMENTS_API_VERSION: env.providers.globalpayments.version || "2021-03-22",
          GLOBALPAYMENTS_TIMEOUT_MS: String(env.providers.globalpayments.timeoutMs || 180000)
        },
        missing: reportsByKey.globalpayments.missing
      },
      propelrpay: {
        required: ["PROPELRPAY_API_BASE_URL", "PROPELRPAY_BASIC_AUTH or PROPELRPAY_AUTH_USERNAME/PROPELRPAY_AUTH_PASSWORD"],
        recommendedDev: {
          PROPELRPAY_API_BASE_URL: env.providers.propelrpay.baseUrl || "provided by PropelrPay support",
          PROPELRPAY_MERCHANT_ID: env.providers.propelrpay.merchantId ? "configured" : "provided by PropelrPay support",
          PROPELRPAY_BASIC_AUTH: env.providers.propelrpay.basicAuth ? "configured" : "base64 user:password, optional if username/password are set",
          PROPELRPAY_AUTH_HEADER: env.providers.propelrpay.authHeader || "Authorization",
          PROPELRPAY_AUTH_SCHEME: env.providers.propelrpay.authScheme || "Basic",
          PROPELRPAY_SALE_PATH: env.providers.propelrpay.paths.sale || "provider-specific",
          PROPELRPAY_AUTH_PATH: env.providers.propelrpay.paths.authorize || "provider-specific",
          PROPELRPAY_VERIFY_PATH: env.providers.propelrpay.paths.verification || "provider-specific",
          PROPELRPAY_CAPTURE_PATH: env.providers.propelrpay.paths.capture || "provider-specific",
          PROPELRPAY_REFUND_PATH: env.providers.propelrpay.paths.refund || "provider-specific",
          PROPELRPAY_VOID_PATH: env.providers.propelrpay.paths.void || "provider-specific",
          PROPELRPAY_TRANSACTION_PATH: env.providers.propelrpay.paths.transaction || "provider-specific"
        },
        missing: reportsByKey.propelrpay.missing,
        optionalMissing: reportsByKey.propelrpay.optionalMissing
      },
      clover: {
        required: ["CLOVER_MERCHANT_ID", "CLOVER_API_TOKEN or CLOVER_API_KEY"],
        recommendedDev: {
          CLOVER_API_BASE_URL: env.providers.clover.baseUrl || "https://api.clover.com",
          CLOVER_API_TOKEN: "live eCommerce API token"
        },
        missing: reportsByKey.clover.missing
      }
    }
  });
}));

app.get("/api/payment-processors/logs", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const processor = String(req.query.processor || "").trim();
  const attemptType = String(req.query.attemptType || "").trim();
  const status = String(req.query.status || "").trim();
  const createdByUserId = String(req.query.createdByUserId || "").trim();
  const expMonth = String(req.query.expMonth || "").trim();
  const expYear = String(req.query.expYear || "").trim();
  const parseAmountFilter = (value) => value === undefined || value === "" ? null : Number(String(value).replace(/,/g, ""));
  const amountMin = parseAmountFilter(req.query.amountMin);
  const amountMax = parseAmountFilter(req.query.amountMax);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
  const canViewJsonModels = req.user?.role === "admin";
  const database = await db.getDb();
  const catalog = getProviderReportCatalog().filter((item) => item.group === "payment_gateways");
  const processorKeys = new Set(catalog.map((item) => item.key));
  const query = {};

  if (processor) {
    if (processor === "rapidapi_bin_checker") {
      query.provider = "paypal";
      query.attempt_type = "bin_check";
    } else if (processorKeys.has(processor)) {
      query.provider = processor;
    } else {
      query.provider = processor;
    }
  }
  if (attemptType) {
    query.attempt_type = attemptType;
  }
  if (status) {
    query.status = status;
  }
  if (createdByUserId) {
    query.created_by_user_id = createdByUserId;
  }
  if (Number.isFinite(amountMin) || Number.isFinite(amountMax)) {
    query.amount = {};
    if (Number.isFinite(amountMin)) query.amount.$gte = amountMin;
    if (Number.isFinite(amountMax)) query.amount.$lte = amountMax;
  }
  if (expMonth || expYear) {
    const cardQuery = {};
    if (expMonth) cardQuery.exp_month = expMonth.padStart(2, "0");
    if (expYear) cardQuery.exp_year = String(expYear);
    const matchingCards = await database.collection("cards")
      .find(cardQuery, { projection: { _id: 0, id: 1 } })
      .toArray();
    query.card_id = { $in: matchingCards.map((card) => card.id) };
  }

  const logs = await database.collection("verification_attempts")
    .find(query, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();

  const cardIds = [...new Set(logs.map((log) => log.card_id).filter(Boolean))];
  const userIds = [...new Set(logs.map((log) => log.created_by_user_id).filter(Boolean))];
  const [cards, users, allUsers] = await Promise.all([
    cardIds.length
      ? database.collection("cards").find({ id: { $in: cardIds } }, {
          projection: canViewJsonModels
            ? { _id: 0, id: 1, masked_pan: 1, pan_encrypted: 1, first6: 1, last4: 1, brand: 1, exp_month: 1, exp_year: 1, cardholder_name: 1, billing_zip: 1 }
            : { _id: 0, id: 1, masked_pan: 1, first6: 1, last4: 1, exp_month: 1, exp_year: 1 }
        }).toArray()
      : Promise.resolve([]),
    userIds.length
      ? database.collection("users").find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1, display_name: 1 } }).toArray()
      : Promise.resolve([]),
    database.collection("users").find({}, { projection: { _id: 0, id: 1, username: 1, display_name: 1 } }).sort({ username: 1 }).toArray()
  ]);
  const cardsById = Object.fromEntries(cards.map((card) => [card.id, card]));
  const usersById = Object.fromEntries(users.map((user) => [user.id, user]));

  const extractRequestModel = (raw, log, debugCard = null) => {
    const directRequest = raw?.request ||
      raw?.result?.request ||
      raw?.providerResponse?.request ||
      raw?.tokenization?.request ||
      null;
    if (directRequest) {
      return mergeDebugCardIntoModel(directRequest, debugCard);
    }

    const operation = raw?.operation || log.attempt_type || null;
    const card = debugCard || raw?.card || null;
    const result = raw?.result || raw?.providerResponse || null;
    if (operation || card || log.provider || log.amount != null || log.currency || log.provider_reference_id) {
      return {
        provider: log.provider || raw?.provider || null,
        operation,
        attemptType: log.attempt_type || null,
        amount: log.amount ?? result?.amount ?? null,
        currency: log.currency || result?.currency || null,
        transactionId: log.provider_reference_id || result?.transactionId || result?.retref || result?.cloverChargeId || null,
        card
      };
    }

    return null;
  };
  const extractResponseModel = (raw, debugCard = null) => mergeDebugCardIntoModel(raw, debugCard);

  const normalizedLogs = logs.map((log) => {
    const rawOriginal = safeParseJson(log.raw_response);
    const rawForList = canViewJsonModels ? rawOriginal : redactSensitiveReportData(rawOriginal);
    const card = cardsById[log.card_id] || null;
    const debugCard = canViewJsonModels ? buildStoredCardDebugSnapshot(card) : null;
    const user = usersById[log.created_by_user_id] || null;
    const requestModel = canViewJsonModels
      ? extractRequestModel(rawOriginal, log, debugCard)
      : null;
    const responseModel = canViewJsonModels
      ? extractResponseModel(rawOriginal, debugCard)
      : null;
    return {
      ...log,
      processor: classifyAttemptProvider(log),
      transactionId: log.provider_reference_id ||
        rawForList?.result?.transactionId ||
        rawForList?.result?.retref ||
        rawForList?.result?.cloverChargeId ||
        rawForList?.providerResponse?.transactionId ||
        rawForList?.providerResponse?.retref ||
        rawForList?.request?.transactionId ||
        rawForList?.request?.retref ||
        null,
      card: card ? {
        id: card.id,
        maskedPan: card.masked_pan || (card.first6 && card.last4 ? `${card.first6}******${card.last4}` : null),
        first6: card.first6 || null,
        last4: card.last4 || null,
        expMonth: card.exp_month || null,
        expYear: card.exp_year || null
      } : null,
      actor: user ? {
        id: user.id,
        username: user.username,
        displayName: user.display_name
      } : null,
      requestModel,
      responseModel,
      raw_response: rawForList
    };
  });

  const [attemptTypesResult, statusesResult] = await Promise.all([
    database.collection("verification_attempts").aggregate([
      ...(processor ? [{ $match: { provider: processor } }] : []),
      { $group: { _id: "$attempt_type" } }
    ]).toArray(),
    database.collection("verification_attempts").aggregate([
      ...(processor ? [{ $match: { provider: processor } }] : []),
      { $group: { _id: "$status" } }
    ]).toArray()
  ]);

  const attemptTypes = attemptTypesResult.map(r => r._id);
  const statuses = statusesResult.map(r => r._id);

  res.json({
    generatedAt: new Date().toISOString(),
    health: getPaymentProcessorHealthSnapshot(),
    canViewJsonModels,
    filters: {
      processor,
      attemptType,
      status,
      createdByUserId,
      amountMin,
      amountMax,
      expMonth,
      expYear,
      limit
    },
    processors: catalog.map((item) => ({
      key: item.key,
      label: item.label,
      configured: item.configured,
      capabilities: item.capabilities,
      health: paymentProcessorHealth.processors[item.key] || {
        key: item.key,
        label: item.label,
        status: paymentProcessorHealth.running ? "checking" : "unknown",
        healthy: null,
        configured: item.configured,
        checkedAt: null
      }
    })),
    facets: {
      attemptTypes: attemptTypes.filter(Boolean).sort(),
      statuses: statuses.filter(Boolean).sort(),
      users: allUsers.map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.display_name
      }))
    },
    count: normalizedLogs.length,
    logs: normalizedLogs
  });
}));

app.get("/api/payment-processors/health", requireAuth, requirePermission("canListCards"), (_req, res) => {
  res.json(getPaymentProcessorHealthSnapshot());
});

app.post("/api/payment-processors/health/check", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  const result = await runPaymentProcessorHealthChecks("manual");
  res.json(result);
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
    return sendApiError(res, req, 400, "username, password and role are required", "VALIDATION_ERROR");
  }

  if (!["admin", "operator", "customer"].includes(role)) {
    return sendApiError(res, req, 400, "Unsupported role", "UNSUPPORTED_ROLE");
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

app.get("/api/debt-management/summary", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  await recalculateDebtRollups();
  const database = await getDebtDb();
  const [accounts, cards, payments] = await Promise.all([
    database.collection("funding_accounts").find({}, { projection: { _id: 0 } }).toArray(),
    database.collection("debt_cards").find({}, { projection: { _id: 0 } }).toArray(),
    database.collection("debt_payments").find({}, { projection: { _id: 0 } }).toArray()
  ]);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const expectedRepaymentTotal = payments.reduce((sum, payment) => sum + Number(payment.repayment_expected_amount || 0), 0);
  const repaymentPaidTotal = payments.reduce((sum, payment) => sum + Number(payment.repayment_paid_amount || 0), 0);
  res.json({
    generatedAt: nowIso(),
    accounts: accounts.length,
    cards: cards.length,
    payments: payments.length,
    pendingPayments: payments.filter((payment) => payment.payment_status === "pending").length,
    approvedPayments: payments.filter((payment) => payment.payment_status === "approved").length,
    totalPaid,
    expectedRepaymentTotal,
    repaymentPaidTotal,
    repaymentDueTotal: Math.max(0, expectedRepaymentTotal - repaymentPaidTotal)
  });
}));

app.get("/api/debt-management/funding-accounts", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  await recalculateDebtRollups();
  const database = await getDebtDb();
  const rows = await database.collection("funding_accounts")
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray();
  res.json(rows.map(serializeFundingAccount));
}));

app.post("/api/debt-management/funding-accounts", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const accountNumber = digits(req.body.accountNumber);
  const routingNumber = digits(req.body.routingNumber);
  if (!accountNumber || !routingNumber) {
    return sendApiError(res, req, 400, "accountNumber and routingNumber are required", "VALIDATION_ERROR");
  }
  if (!cleanString(req.body.bankName)) {
    return sendApiError(res, req, 400, "bankName is required", "VALIDATION_ERROR");
  }
  const timestamp = nowIso();
  const doc = {
    id: uuidv4(),
    bank_name: cleanString(req.body.bankName),
    account_name: cleanOptional(req.body.accountName),
    account_type: normalizeEnum(req.body.accountType, ["checking", "savings", "money_market", "other"], "checking"),
    ownership_type: normalizeEnum(req.body.ownershipType, ["personal", "business"], "personal"),
    business_name: cleanOptional(req.body.businessName),
    account_number_encrypted: encrypt(accountNumber),
    routing_number_encrypted: encrypt(routingNumber),
    account_last4: last4(accountNumber),
    routing_last4: last4(routingNumber),
    account_masked: maskLast4(accountNumber),
    routing_masked: maskLast4(routingNumber),
    account_fingerprint: fingerprintAccount(routingNumber, accountNumber),
    address_line1: cleanOptional(req.body.addressLine1),
    address_line2: cleanOptional(req.body.addressLine2),
    city: cleanOptional(req.body.city),
    state: cleanOptional(req.body.state),
    zip: cleanOptional(req.body.zip),
    country: cleanOptional(req.body.country) || "US",
    status: normalizeEnum(req.body.status, ["active", "inactive"], "active"),
    notes: cleanOptional(req.body.notes),
    payment_count: 0,
    total_paid: 0,
    created_by_user_id: req.user.id,
    created_at: timestamp,
    updated_at: timestamp
  };
  const database = await getDebtDb();
  try {
    await database.collection("funding_accounts").insertOne(doc);
  } catch (error) {
    if (error?.code === 11000) {
      return sendApiError(res, req, 409, "This funding account already exists", "DUPLICATE_ACCOUNT");
    }
    throw error;
  }
  await writeOperationAuditLog({
    req,
    entityType: "funding_account",
    entityId: doc.id,
    action: "funding_account_created",
    status: "success",
    details: serializeFundingAccount(doc)
  });
  res.status(201).json(serializeFundingAccount(doc));
}));

app.get("/api/debt-management/funding-accounts/:accountId", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const account = await getFundingAccount(req.params.accountId);
  if (!account) return sendApiError(res, req, 404, "Funding account not found", "NOT_FOUND");
  const payments = await buildPaymentRows({ funding_account_id: req.params.accountId });
  res.json({ ...serializeFundingAccount(account), payments });
}));

app.get("/api/debt-management/funding-accounts/:accountId/payments", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const account = await getFundingAccount(req.params.accountId);
  if (!account) return sendApiError(res, req, 404, "Funding account not found", "NOT_FOUND");
  res.json(await buildPaymentRows({ funding_account_id: req.params.accountId }));
}));

app.get("/api/debt-management/cards", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  await recalculateDebtRollups();
  const database = await getDebtDb();
  const rows = await database.collection("debt_cards")
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .toArray();
  res.json(rows.map(serializeDebtCard));
}));

app.post("/api/debt-management/cards", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  if (!cleanString(req.body.ownerName) || !cleanString(req.body.bankName)) {
    return sendApiError(res, req, 400, "ownerName and bankName are required", "VALIDATION_ERROR");
  }
  const timestamp = nowIso();
  const doc = {
    id: uuidv4(),
    owner_name: cleanString(req.body.ownerName),
    cardholder_name: cleanOptional(req.body.cardholderName) || cleanString(req.body.ownerName),
    bank_name: cleanString(req.body.bankName),
    card_network: cleanOptional(req.body.cardNetwork),
    card_last4: last4(req.body.cardLast4 || req.body.cardNumber),
    billing_address_line1: cleanOptional(req.body.billingAddressLine1),
    billing_address_line2: cleanOptional(req.body.billingAddressLine2),
    billing_city: cleanOptional(req.body.billingCity),
    billing_state: cleanOptional(req.body.billingState),
    billing_zip: cleanOptional(req.body.billingZip),
    billing_country: cleanOptional(req.body.billingCountry) || "US",
    login_url: cleanOptional(req.body.loginUrl),
    login_username_encrypted: encrypt(req.body.loginUsername),
    login_password_encrypted: encrypt(req.body.loginPassword),
    credit_limit: req.body.creditLimit ? normalizeMoney(req.body.creditLimit, "creditLimit", { allowZero: true }) : 0,
    current_balance: req.body.currentBalance ? normalizeMoney(req.body.currentBalance, "currentBalance", { allowZero: true }) : 0,
    minimum_payment: req.body.minimumPayment ? normalizeMoney(req.body.minimumPayment, "minimumPayment", { allowZero: true }) : 0,
    due_date: cleanOptional(req.body.dueDate),
    status: normalizeEnum(req.body.status, ["active", "closed", "paused"], "active"),
    notes: cleanOptional(req.body.notes),
    payment_count: 0,
    total_paid: 0,
    expected_repayment_total: 0,
    repayment_paid_total: 0,
    created_by_user_id: req.user.id,
    created_at: timestamp,
    updated_at: timestamp
  };
  const database = await getDebtDb();
  await database.collection("debt_cards").insertOne(doc);
  await writeOperationAuditLog({
    req,
    entityType: "debt_card",
    entityId: doc.id,
    action: "debt_card_created",
    status: "success",
    details: serializeDebtCard(doc)
  });
  res.status(201).json(serializeDebtCard(doc));
}));

app.get("/api/debt-management/cards/:cardId", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const card = await getDebtCard(req.params.cardId);
  if (!card) return sendApiError(res, req, 404, "Debt card not found", "NOT_FOUND");
  const payments = await buildPaymentRows({ debt_card_id: req.params.cardId });
  res.json({ ...serializeDebtCard(card), payments });
}));

app.get("/api/debt-management/cards/:cardId/payments", requireAuth, requirePermission("canListCards"), asyncHandler(async (req, res) => {
  const card = await getDebtCard(req.params.cardId);
  if (!card) return sendApiError(res, req, 404, "Debt card not found", "NOT_FOUND");
  res.json(await buildPaymentRows({ debt_card_id: req.params.cardId }));
}));

app.get("/api/debt-management/payments", requireAuth, requirePermission("canListCards"), asyncHandler(async (_req, res) => {
  res.json(await buildPaymentRows());
}));

app.post("/api/debt-management/payments", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const card = await getDebtCard(req.body.debtCardId);
  if (!card) return sendApiError(res, req, 404, "Debt card not found", "NOT_FOUND");
  const sourceType = normalizeEnum(req.body.sourceType, ["registered", "manual"], "registered");
  let account = null;
  let manualSource = null;
  if (sourceType === "registered") {
    account = await getFundingAccount(req.body.fundingAccountId);
    if (!account) return sendApiError(res, req, 404, "Funding account not found", "NOT_FOUND");
  } else {
    manualSource = {
      bankName: cleanOptional(req.body.manualBankName),
      accountName: cleanOptional(req.body.manualAccountName),
      accountType: normalizeEnum(req.body.manualAccountType, ["checking", "savings", "money_market", "other"], "checking"),
      ownershipType: normalizeEnum(req.body.manualOwnershipType, ["personal", "business"], "personal"),
      accountMasked: maskLast4(req.body.manualAccountNumber || req.body.manualAccountLast4),
      routingMasked: maskLast4(req.body.manualRoutingNumber || req.body.manualRoutingLast4)
    };
  }
  const timestamp = nowIso();
  const doc = {
    id: uuidv4(),
    debt_card_id: card.id,
    payment_type: normalizeEnum(req.body.paymentType, ["ach_invoice", "card_debt"], "card_debt"),
    source_type: sourceType,
    funding_account_id: account?.id || null,
    manual_source: manualSource,
    card_snapshot: {
      id: card.id,
      ownerName: card.owner_name,
      bankName: card.bank_name,
      cardLast4: card.card_last4
    },
    amount: normalizeMoney(req.body.amount, "amount"),
    currency: cleanOptional(req.body.currency) || "USD",
    payment_date: cleanOptional(req.body.paymentDate) || timestamp.slice(0, 10),
    payment_status: normalizeEnum(req.body.paymentStatus, ["pending", "approved", "failed", "cancelled"], "pending"),
    confirmation_number: cleanOptional(req.body.confirmationNumber),
    repayment_expected_amount: req.body.repaymentExpectedAmount ? normalizeMoney(req.body.repaymentExpectedAmount, "repaymentExpectedAmount", { allowZero: true }) : 0,
    repayment_paid_amount: req.body.repaymentPaidAmount ? normalizeMoney(req.body.repaymentPaidAmount, "repaymentPaidAmount", { allowZero: true }) : 0,
    repayment_status: normalizeEnum(req.body.repaymentStatus, ["unpaid", "partial", "paid", "waived"], "unpaid"),
    repayment_date: cleanOptional(req.body.repaymentDate),
    notes: cleanOptional(req.body.notes),
    created_by_user_id: req.user.id,
    created_at: timestamp,
    updated_at: timestamp
  };
  if (doc.repayment_paid_amount >= doc.repayment_expected_amount && doc.repayment_expected_amount > 0) {
    doc.repayment_status = "paid";
  } else if (doc.repayment_paid_amount > 0) {
    doc.repayment_status = "partial";
  }
  const database = await getDebtDb();
  await database.collection("debt_payments").insertOne(doc);
  await recalculateDebtRollups();
  await writeOperationAuditLog({
    req,
    entityType: "debt_payment",
    entityId: doc.id,
    action: "debt_payment_created",
    status: doc.payment_status,
    details: serializeDebtPayment(doc, account, card)
  });
  res.status(201).json(serializeDebtPayment(doc, account, card));
}));

app.patch("/api/debt-management/payments/:paymentId", requireAuth, requirePermission("canCreateCards"), asyncHandler(async (req, res) => {
  const database = await getDebtDb();
  const existing = await database.collection("debt_payments").findOne({ id: req.params.paymentId });
  if (!existing) return sendApiError(res, req, 404, "Payment not found", "NOT_FOUND");
  const update = { updated_at: nowIso() };
  if (req.body.paymentStatus !== undefined) update.payment_status = normalizeEnum(req.body.paymentStatus, ["pending", "approved", "failed", "cancelled"], existing.payment_status);
  if (req.body.confirmationNumber !== undefined) update.confirmation_number = cleanOptional(req.body.confirmationNumber);
  if (req.body.repaymentExpectedAmount !== undefined) update.repayment_expected_amount = normalizeMoney(req.body.repaymentExpectedAmount, "repaymentExpectedAmount", { allowZero: true });
  if (req.body.repaymentPaidAmount !== undefined) update.repayment_paid_amount = normalizeMoney(req.body.repaymentPaidAmount, "repaymentPaidAmount", { allowZero: true });
  if (req.body.repaymentStatus !== undefined) update.repayment_status = normalizeEnum(req.body.repaymentStatus, ["unpaid", "partial", "paid", "waived"], existing.repayment_status);
  if (req.body.repaymentDate !== undefined) update.repayment_date = cleanOptional(req.body.repaymentDate);
  if (req.body.notes !== undefined) update.notes = cleanOptional(req.body.notes);
  const expected = update.repayment_expected_amount ?? existing.repayment_expected_amount ?? 0;
  const paid = update.repayment_paid_amount ?? existing.repayment_paid_amount ?? 0;
  if (req.body.repaymentStatus === undefined) {
    update.repayment_status = expected > 0 && paid >= expected ? "paid" : paid > 0 ? "partial" : existing.repayment_status;
  }
  await database.collection("debt_payments").updateOne({ id: req.params.paymentId }, { $set: update });
  await recalculateDebtRollups();
  const payment = await database.collection("debt_payments").findOne({ id: req.params.paymentId });
  const [account, card] = await Promise.all([
    getFundingAccount(payment.funding_account_id),
    getDebtCard(payment.debt_card_id)
  ]);
  await writeOperationAuditLog({
    req,
    entityType: "debt_payment",
    entityId: payment.id,
    action: "debt_payment_updated",
    status: payment.payment_status,
    details: serializeDebtPayment(payment, account, card)
  });
  res.json(serializeDebtPayment(payment, account, card));
}));

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
  let {
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

  const validation = validateCardInput({
    pan: req.body.pan,
    expMonth,
    expYear,
    cardholderName,
    billingZip
  });

  if (!validation.isValid) {
    return res.status(400).json({
      error: `Invalid card input: ${validation.issues.join(", ")}`,
      issues: validation.issues
    });
  }

  provider = provider || "globalpayments";
  first6 = first6 || validation.first6;
  last4 = last4 || validation.last4;
  brand = brand || validation.brand;
  expMonth = expMonth || req.body.expMonth;
  expYear = expYear || req.body.expYear;
  maskedPan = maskedPan || validation.maskedPan;
  providerPaymentToken = providerPaymentToken || buildManualProviderToken(provider, {
    ...req.body,
    first6,
    last4,
    brand,
    expMonth,
    expYear
  });

  if (!provider || !providerPaymentToken || !last4 || !expMonth || !expYear) {
    return sendApiError(res, req, 400, "provider, providerPaymentToken, last4, expMonth and expYear are required", "VALIDATION_ERROR");
  }

  if (!["clover", "paypal", "fluidpay", "globalpayments", "propelr", "propelrpay", "braintree", "nmi", "zoho"].includes(provider)) {
    return sendApiError(res, req, 400, "provider must be clover, paypal, fluidpay, globalpayments, propelr, propelrpay, braintree, nmi or zoho", "INVALID_PROVIDER");
  }

  let verifyPayload = { ...req.body, provider, amount: req.body.amount || 1, currency: req.body.currency || "USD", ipAddress: req.ip };
  let verificationPromise;
  if (provider === "fluidpay") verificationPromise = fluidpayService.createTransaction(verifyPayload, "verification");
  else if (provider === "braintree") verificationPromise = braintreeService.verifyCard(verifyPayload);
  else if (provider === "nmi") verificationPromise = nmiService.verifyCard(verifyPayload);
  else if (provider === "zoho") verificationPromise = zohoPaymentsService.verifyCard(verifyPayload);
  else if (provider === "propelr" || provider === "propelrpay") verificationPromise = propelrPayService.verifyCard(verifyPayload);
  else if (provider === "paypal") verificationPromise = paypalService.liveCheckCard(verifyPayload);
  else if (provider === "clover") {
    verificationPromise = tokenizeCloverPayload(verifyPayload).then(t => cloverService.verifyCard({ source: t.payload.source }));
  } else {
    verificationPromise = globalPaymentsService.verifyCard(verifyPayload);
  }

  const [verificationResult, binResult] = await Promise.allSettled([
    verificationPromise,
    paypalService.binCheckCard({
      ...req.body,
      bin: first6
    })
  ]);

  const verification = verificationResult.status === "fulfilled"
    ? verificationResult.value
    : {
        status: "failed",
        error: getProviderMessage(verificationResult.reason)
      };
  const binCheck = binResult.status === "fulfilled"
    ? {
        ok: true,
        ...binResult.value
      }
    : {
        ok: false,
        status: "failed",
        error: getProviderMessage(binResult.reason)
      };

  if (binCheck.ok && binCheck.details) {
    brand = brand || binCheck.details["Card Brand"] || validation.brand;
    const binNotes = `Bank: ${binCheck.details["Issuer Name / Bank"] || '-'}, Type: ${binCheck.details["Card Type"] || '-'} ${binCheck.details["Card Level"] || '-'}, Country: ${binCheck.details["ISO Country Code A2"] || '-'}`;
    notes = notes ? `${notes} | ${binNotes}` : binNotes;
  }

  if (!["approved", "verified", "success", "ok"].includes(String(verification.status).toLowerCase())) {
    await writeAuditLog({
      entityType: "card_intake",
      action: "card_rejected_by_provider_verification",
      status: verification.status || "failed",
      actorUserId: req.user.id,
      details: {
        card: buildCardLogSnapshot(req.body),
        verification,
        binCheck
      }
    });
    return res.status(400).json({
      error: "Card verification was not approved; card was not saved",
      verification,
      binCheck
    });
  }

  verificationStatus = "verified";
  avsResult = verification.avsResult || verification.avsZip || verification.avsAddress || avsResult || null;
  authResultCode = verification.cvvResult || verification.cvv2Match || verification.authCode || authResultCode || null;
  providerReferenceId = verification.transactionId || verification.cloverChargeId || verification.pnref || providerReferenceId || null;

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
  const cardId = result.rows[0].id;

  await insertProviderAttempt({
    cardId,
    provider,
    attemptType: "live_check",
    status: verification.status,
    amount: verification.amount || Number(req.body.amount || 1),
    currency: verification.currency || req.body.currency || "USD",
    providerReferenceId: providerReferenceId,
    rawResponse: {
      card: buildCardLogSnapshot(req.body),
      verification
    },
    createdByUserId: req.user.id
  });

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
      binCheck.status,
      serializeRawResponse({
        card: buildCardLogSnapshot(req.body),
        binCheck
      }),
      req.user.id
    ]
  );

  await writeAuditLog({
    entityType: "card",
    entityId: cardId,
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

  res.status(201).json({
    id: cardId,
    verification,
    binCheck
  });
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

  if (!provider || !["clover", "paypal", "fluidpay", "globalpayments", "propelr", "propelrpay", "braintree", "nmi", "zoho"].includes(provider)) {
    return sendApiError(res, req, 400, "provider must be clover, paypal, fluidpay, globalpayments, propelr, propelrpay, braintree, nmi or zoho", "INVALID_PROVIDER");
  }

  if (!verificationStatus || !["pending", "verified", "declined", "review"].includes(verificationStatus)) {
    return sendApiError(res, req, 400, "Unsupported verificationStatus", "UNSUPPORTED_VERIFICATION_STATUS");
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
    return sendApiError(res, req, 400, "Unsupported attemptType", "UNSUPPORTED_ATTEMPT_TYPE");
  }

  if (!req.user.permissions[permission]) {
    return sendApiError(res, req, 403, `Missing permission: ${permission}`, "MISSING_PERMISSION");
  }

  if (!provider || !["clover", "paypal"].includes(provider)) {
    return sendApiError(res, req, 400, "provider must be clover or paypal", "INVALID_PROVIDER");
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
    return sendApiError(res, req, 404, "Enrollment profile not found", "NOT_FOUND");
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
    return sendApiError(res, req, 400, "enrollBankUrl is required", "VALIDATION_ERROR");
  }

  await ensureCardExists(req.params.cardId);

  const existing = await query(
    "select id from enrollment_profiles where card_id = $1",
    [req.params.cardId]
  );

  if (existing.rowCount > 0 && !req.user.permissions.canUpdateEnrollment) {
    return sendApiError(res, req, 403, "Existing enrollment records can only be updated by admin", "MISSING_PERMISSION");
  }

  if (existing.rowCount === 0 && !req.user.permissions.canCreateEnrollment) {
    return sendApiError(res, req, 403, "Missing permission: canCreateEnrollment", "MISSING_PERMISSION");
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
app.use("/api/providers/clover/learning", createCloverLearningRouter({ requireAuth, requirePermission }));
app.use("/api/clover/learning", createCloverLearningRouter({ requireAuth, requirePermission }));

app.use("/api", (req, res) => {
  sendApiError(res, req, 404, `API route not found: ${req.method} ${req.originalUrl}`, "NOT_FOUND");
});

app.use((error, req, res, _next) => {
  console.error(toSafeErrorLog(error));
  if (req.path?.startsWith("/api/")) {
    const response = buildApiErrorResponse(error, req);
    return res.status(response.httpStatus).json(response);
  }

  const { httpStatus, result } = buildExceptionResult(error);
  res.status(httpStatus).json({ error: result.responseMessage });
});

app.get("*", (_req, res) => {
  const reactIndex = path.resolve(process.cwd(), "public", "react", "index.html");
  res.sendFile(reactIndex, (error) => {
    if (error) {
      res.sendFile(path.resolve(process.cwd(), "public", "index.html"));
    }
  });
});

ensureBootstrapAdmin()
  .then(() => {
    app.listen(env.port, () => {
      console.log(`Server listening on port ${env.port}`);
      runPaymentProcessorHealthChecks("startup").catch((error) => {
        paymentProcessorHealth.running = false;
        console.error(toSafeErrorLog(error));
      });
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
