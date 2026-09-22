const functions = require("firebase-functions");
const expressApp = require("./server");

// Export Express app as Cloud Function 'grabnow' with 540s timeout and 1GB RAM
exports.grabnow = functions
  .runWith({
    timeoutSeconds: 540,
    memory: "1GB"
  })
  .https.onRequest(expressApp);
