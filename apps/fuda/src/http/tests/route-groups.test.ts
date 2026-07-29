import assert from "node:assert/strict";
import type { FastifyInstance } from "fastify";
import { describe, it } from "node:test";
import type { RouteGroup } from "../types/route-group.js";
import type { FudaRouteControllers } from "../utils/register-route-groups.js";
import {
  ROUTE_GROUP_REGISTRARS,
  registerRouteGroups,
} from "../utils/register-route-groups.js";

const emptyControllers = {} as FudaRouteControllers;

describe("registerRouteGroups", () => {
  it("keeps public, agent, and management registrars as distinct modules", () => {
    assert.notEqual(
      ROUTE_GROUP_REGISTRARS.public,
      ROUTE_GROUP_REGISTRARS.agent,
    );
    assert.notEqual(
      ROUTE_GROUP_REGISTRARS.public,
      ROUTE_GROUP_REGISTRARS.management,
    );
    assert.notEqual(
      ROUTE_GROUP_REGISTRARS.agent,
      ROUTE_GROUP_REGISTRARS.management,
    );
  });

  it("invokes only the selected group registrars", () => {
    const called: RouteGroup[] = [];
    const app = {} as FastifyInstance;
    const registrars = {
      public: () => {
        called.push("public");
      },
      agent: () => {
        called.push("agent");
      },
      management: () => {
        called.push("management");
      },
    };

    registerRouteGroups(app, ["public"], emptyControllers, registrars);
    assert.deepEqual(called, ["public"]);

    called.length = 0;
    registerRouteGroups(
      app,
      ["agent", "management"],
      emptyControllers,
      registrars,
    );
    assert.deepEqual(called, ["agent", "management"]);
  });
});
