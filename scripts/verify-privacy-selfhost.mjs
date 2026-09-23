import assert from "node:assert/strict";
import {
  ZCODE_TELEMETRY_ENABLED,
  ZCODE_TELEMETRY_REPORT_ENDPOINT,
  ZCODE_ARMS_RUM_ENDPOINT,
} from "../packages/shared/dist/env.js";
import {
  createModelTelemetry,
  prepareModelTelemetryEnv,
} from "../apps/zcode-cli/packages/telemetry/dist/bootstrap.js";
import {
  createHostApiNetworkTransport,
  isBlockedZCodeServiceUrl,
} from "../packages/services/dist/providers/api/nodeApiNetwork.js";

assert.equal(ZCODE_TELEMETRY_ENABLED, false);
assert.equal(ZCODE_TELEMETRY_REPORT_ENDPOINT, "");
assert.equal(ZCODE_ARMS_RUM_ENDPOINT, "");

const injectedEnv = {
  OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:9/v1/traces",
  ZCODE_MODEL_TELEMETRY_ENABLED: "true",
};
assert.equal(await prepareModelTelemetryEnv(injectedEnv), injectedEnv);
assert.equal(createModelTelemetry().enabled, false);

assert.equal(isBlockedZCodeServiceUrl("https://zcode.z.ai/api/v1/test"), true);
assert.equal(isBlockedZCodeServiceUrl("https://cdn-zcode.z.ai/file"), true);
assert.equal(isBlockedZCodeServiceUrl("http://127.0.0.1:8888/v1/chat/completions"), false);

let requests = 0;
const transport = createHostApiNetworkTransport(async () => ({}), {
  fetchWithDispatcher: async () => {
    requests += 1;
    throw new Error("unexpected request");
  },
});
await assert.rejects(
  transport.fetch("https://zcode.z.ai/api/v1/test"),
  /Official ZCode service access is disabled/,
);
assert.equal(requests, 0);
transport.dispose();

console.log("privacy self-host gates: passed");
