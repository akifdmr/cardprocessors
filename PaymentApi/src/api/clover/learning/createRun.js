const cloverLearningService = require("../../../services/cloverLearningService");

async function createRunHandler(req, res) {
  const result = await cloverLearningService.createRun({ ...(req.body || {}), userId: req.user?.id });
  console.log("[clover-perfect-generator:response]", JSON.stringify({
    runId: result.runId,
    status: result.status,
    input: result.input,
    output: {
      requestedCount: result.output?.requestedCount,
      validCount: result.output?.validCount,
      totalAttempts: result.output?.totalAttempts,
      successRate: result.output?.successRate
    }
  }));
  res.json(result);
}

async function listRunsHandler(_req, res) {
  res.json({
    ok: true,
    runs: cloverLearningService.listRuns()
  });
}

async function getRunHandler(req, res) {
  const run = cloverLearningService.getRun(req.params.runId);
  if (!run) {
    return res.status(404).json({
      ok: false,
      status: "failed",
      responseMessage: "Generator run not found"
    });
  }
  res.json({ ok: true, run });
}

module.exports = {
  createRunHandler,
  getRunHandler,
  listRunsHandler
};
