import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAgentTokenProvider } from "../agent-token-provider.js";
import {
  TokenExchangeError,
  type ExchangedAgentToken,
  type FudaClient,
} from "@keidai/shared/clients";

function scriptedFuda(tokens: ExchangedAgentToken[]): FudaClient & {
  calls: number;
} {
  let index = 0;
  const client = {
    calls: 0,
    async exchangeToken(): Promise<ExchangedAgentToken> {
      client.calls += 1;
      const next = tokens[index];
      if (!next) {
        throw new Error("no more scripted tokens");
      }
      index += 1;
      return next;
    },
  };
  return client;
}

describe("createAgentTokenProvider", () => {
  it("mints on first ensureToken and reuses until near expiry", async () => {
    let clock = 1_000_000;
    const fuda = scriptedFuda([
      { accessToken: "jwt-1", tokenType: "Bearer", expiresIn: 300 },
      { accessToken: "jwt-2", tokenType: "Bearer", expiresIn: 300 },
    ]);
    const provider = createAgentTokenProvider({
      fuda,
      subjectToken: "subject",
      agentId: "agent-1",
      refreshSkewMs: 30_000,
      now: () => clock,
    });

    assert.equal(await provider.ensureToken(), "jwt-1");
    assert.equal(await provider.ensureToken(), "jwt-1");
    assert.equal(fuda.calls, 1);

    clock += 270_000; // inside skew window of 300s TTL
    assert.equal(await provider.ensureToken(), "jwt-2");
    assert.equal(fuda.calls, 2);
  });

  it("force remints even when the cached token is still fresh", async () => {
    const fuda = scriptedFuda([
      { accessToken: "jwt-1", tokenType: "Bearer", expiresIn: 300 },
      { accessToken: "jwt-2", tokenType: "Bearer", expiresIn: 300 },
    ]);
    const provider = createAgentTokenProvider({
      fuda,
      subjectToken: "subject",
      agentId: "agent-1",
    });

    assert.equal(await provider.ensureToken(), "jwt-1");
    assert.equal(await provider.ensureToken({ force: true }), "jwt-2");
    assert.equal(fuda.calls, 2);
  });

  it("keeps a still-valid token when Fuda is unreachable mid-run", async () => {
    let clock = 0;
    let failNext = false;
    const fuda: FudaClient = {
      async exchangeToken() {
        if (failNext) {
          throw new TokenExchangeError("unreachable", "Fuda unreachable");
        }
        return {
          accessToken: "jwt-1",
          tokenType: "Bearer",
          expiresIn: 300,
        };
      },
    };
    const provider = createAgentTokenProvider({
      fuda,
      subjectToken: "subject",
      agentId: "agent-1",
      refreshSkewMs: 30_000,
      now: () => clock,
    });

    assert.equal(await provider.ensureToken(), "jwt-1");
    clock += 270_000;
    failNext = true;
    assert.equal(await provider.ensureToken(), "jwt-1");
    assert.equal(await provider.ensureToken({ force: true }), "jwt-1");
  });

  it("fails when Fuda is unreachable and no usable token is cached", async () => {
    const fuda: FudaClient = {
      async exchangeToken() {
        throw new TokenExchangeError("unreachable", "Fuda unreachable");
      },
    };
    const provider = createAgentTokenProvider({
      fuda,
      subjectToken: "subject",
      agentId: "agent-1",
    });

    await assert.rejects(
      () => provider.ensureToken(),
      (error: unknown) => {
        assert.ok(error instanceof TokenExchangeError);
        assert.equal(error.kind, "unreachable");
        return true;
      },
    );
  });

  it("surfaces grant_denied on force remint (resume after revocation)", async () => {
    const fuda: FudaClient = {
      async exchangeToken() {
        throw new TokenExchangeError(
          "grant_denied",
          "Fuda denied agent grant",
          { status: 403 },
        );
      },
    };
    // Seed a cache via a one-shot success then revoke on force.
    let calls = 0;
    const seeded: FudaClient = {
      async exchangeToken() {
        calls += 1;
        if (calls === 1) {
          return {
            accessToken: "jwt-1",
            tokenType: "Bearer",
            expiresIn: 300,
          };
        }
        return fuda.exchangeToken({ subjectToken: "s", agentId: "a" });
      },
    };
    const provider = createAgentTokenProvider({
      fuda: seeded,
      subjectToken: "subject",
      agentId: "agent-1",
    });

    assert.equal(await provider.ensureToken(), "jwt-1");
    await assert.rejects(
      () => provider.ensureToken({ force: true }),
      (error: unknown) => {
        assert.ok(error instanceof TokenExchangeError);
        assert.equal(error.kind, "grant_denied");
        return true;
      },
    );
  });
});
