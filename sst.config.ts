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
    // Infrastructure is defined in infra/ and imported here
    // await import("./infra/storage");
    // await import("./infra/api");
    // await import("./infra/processing");
    // await import("./infra/database");
  },
});

