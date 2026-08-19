import type { Migration } from "@keidai/postgres";

/**
 * Greenfield Torii schema: OAuth, approvals, MCP tasks, partitioned traces.
 */
export const migration001Baseline: Migration = {
  id: "001_baseline",
  async up(queryable) {
    await queryable.query(`
      CREATE TABLE oauth_tokens (
        owner_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMPTZ,
        PRIMARY KEY (owner_id, provider)
      );

      CREATE TABLE oauth_provider_clients (
        provider TEXT NOT NULL PRIMARY KEY,
        client_id TEXT NOT NULL,
        client_secret TEXT,
        redirect_uri TEXT
      );

      CREATE TABLE pending_oauth_links (
        link_id TEXT NOT NULL PRIMARY KEY,
        owner_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        code_verifier TEXT,
        redirect_uri TEXT NOT NULL,
        ui_origin TEXT,
        status TEXT NOT NULL,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL
      );
      CREATE INDEX idx_pending_oauth_links_owner_provider_created
        ON pending_oauth_links(owner_id, provider, created_at DESC);

      CREATE TABLE approvals (
        id TEXT NOT NULL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        params JSONB NOT NULL,
        params_hash TEXT NOT NULL,
        run_id TEXT,
        step_id TEXT,
        task_id TEXT,
        status TEXT NOT NULL,
        rejection_reason TEXT,
        created_at BIGINT NOT NULL,
        expires_at BIGINT NOT NULL,
        decided_at BIGINT,
        used_at BIGINT
      );
      CREATE INDEX idx_approvals_status_created ON approvals(status, created_at DESC);
      CREATE UNIQUE INDEX idx_approvals_task_id ON approvals(task_id) WHERE task_id IS NOT NULL;

      CREATE TABLE approval_rejections (
        agent_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        params_hash TEXT NOT NULL,
        rejection_reason TEXT,
        rejected_at BIGINT NOT NULL,
        PRIMARY KEY (agent_id, tool_name, params_hash)
      );
      CREATE INDEX idx_approval_rejections_rejected_at ON approval_rejections(rejected_at);

      CREATE TABLE mcp_tasks (
        task_id TEXT NOT NULL PRIMARY KEY,
        agent_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        request_method TEXT NOT NULL,
        status TEXT NOT NULL,
        status_message TEXT,
        created_at BIGINT NOT NULL,
        last_updated_at BIGINT NOT NULL,
        ttl_ms INTEGER,
        poll_interval_ms INTEGER,
        input_requests JSONB,
        satisfied_input_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
        result JSONB,
        error JSONB,
        backend_server TEXT,
        backend_task_id TEXT
      );
      CREATE INDEX idx_mcp_tasks_agent_created ON mcp_tasks(agent_id, created_at DESC);

      CREATE TABLE call_traces (
        trace_id TEXT NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        server TEXT NOT NULL,
        tool TEXT NOT NULL,
        agent_id TEXT,
        owner_id TEXT,
        credential_ref TEXT,
        policy_decision TEXT NOT NULL,
        duration_ms INTEGER,
        error TEXT,
        run_id TEXT,
        step_id TEXT,
        task_id TEXT,
        backend_task_id TEXT,
        PRIMARY KEY (timestamp, trace_id)
      ) PARTITION BY RANGE (timestamp);
      CREATE INDEX idx_call_traces_timestamp ON call_traces(timestamp DESC, trace_id DESC);
      CREATE INDEX idx_call_traces_server ON call_traces(server);
    `);
  },
};
