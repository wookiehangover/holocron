// oxlint-disable-next-line triple-slash-reference
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "holocron",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    await import("./infra/storage");
    await import("./infra/database");
    const { api } = await import("./infra/api");
    await import("./infra/processing");

    return {
      apiUrl: api.url,
    };
  },
});

