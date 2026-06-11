const cloverLearningService = require("../../../services/cloverLearningService");

function getStatusHandler(_req, res) {
  res.json(cloverLearningService.getCloverLearningStatus());
}

module.exports = {
  getStatusHandler
};
