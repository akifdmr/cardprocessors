const express = require("express");
const { createRunHandler, getRunHandler, listRunsHandler } = require("./createRun");
const { getStatusHandler } = require("./getStatus");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function createCloverLearningRouter({ requireAuth, requirePermission }) {
  const router = express.Router();

  router.get(
    "/status",
    requireAuth,
    requirePermission("canListCards"),
    getStatusHandler
  );

  router.post(
    ["/runs", "/createRun"],
    requireAuth,
    requirePermission("canRunAuthCheck"),
    asyncHandler(createRunHandler)
  );

  router.get(
    "/runs",
    requireAuth,
    requirePermission("canListCards"),
    asyncHandler(listRunsHandler)
  );

  router.get(
    "/runs/:runId",
    requireAuth,
    requirePermission("canListCards"),
    asyncHandler(getRunHandler)
  );

  return router;
}

module.exports = {
  createCloverLearningRouter
};
