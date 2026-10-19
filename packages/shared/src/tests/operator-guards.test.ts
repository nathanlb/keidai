import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATOR_OWNER_HEADER,
  OPERATOR_ROLE_HEADER,
} from "../operator-context.js";
import { AdminOnly, UseGuards } from "../operator-guards.js";

function fakeReply() {
  const sent: { status: number; body: unknown }[] = [];
  return {
    sent,
    reply: {
      code(status: number) {
        return {
          send(body: unknown) {
            sent.push({ status, body });
          },
        };
      },
    },
  };
}

class AdminRoute {
  calls = 0;

  @AdminOnly()
  async handle(
    _request: {
      headers: Record<string, string | undefined>;
    },
    reply: ReturnType<typeof fakeReply>["reply"],
  ) {
    this.calls += 1;
    reply.code(200).send({ ok: true });
  }
}

describe("AdminOnly", () => {
  it("rejects a signed-in member before the method runs", async () => {
    const route = new AdminRoute();
    const { reply, sent } = fakeReply();
    await route.handle(
      {
        headers: {
          [OPERATOR_OWNER_HEADER]: "ada",
          [OPERATOR_ROLE_HEADER]: "member",
        },
      },
      reply,
    );
    assert.equal(route.calls, 0);
    assert.deepEqual(sent, [{ status: 403, body: { error: "Forbidden" } }]);
  });

  it("allows an admin and a caller with no operator context", async () => {
    const admin = new AdminRoute();
    const { reply: adminReply, sent: adminSent } = fakeReply();
    await admin.handle(
      {
        headers: {
          [OPERATOR_OWNER_HEADER]: "ada",
          [OPERATOR_ROLE_HEADER]: "admin",
        },
      },
      adminReply,
    );
    assert.equal(admin.calls, 1);
    assert.deepEqual(adminSent, [{ status: 200, body: { ok: true } }]);

    const internal = new AdminRoute();
    const { reply, sent } = fakeReply();
    await internal.handle({ headers: {} }, reply);
    assert.equal(internal.calls, 1);
    assert.deepEqual(sent, [{ status: 200, body: { ok: true } }]);
  });
});

describe("UseGuards", () => {
  it("stops at the first guard that denies the call", async () => {
    const calls: string[] = [];
    class Gated {
      @UseGuards(
        () => {
          calls.push("first");
          return false;
        },
        () => {
          calls.push("second");
          return true;
        },
      )
      run() {
        calls.push("method");
      }
    }

    await new Gated().run();
    assert.deepEqual(calls, ["first"]);
  });
});
