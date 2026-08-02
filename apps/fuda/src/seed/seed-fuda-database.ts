import type { AgentRepository } from "../agents/types/agent-repository.js";
import type { BearerRepository } from "../bearers/types/bearer-repository.js";
import { ConfigValidationError } from "../config/runtime-config.js";
import { isSqliteUniqueConstraintError } from "../storage/utils/sqlite-errors.js";
import type { SeedFile } from "./types/seed-file.js";

export interface SeedRepositories {
  agents: AgentRepository;
  bearers: BearerRepository;
}

export interface SeedResult {
  agentsCreated: number;
  agentsUpdated: number;
  agentsUnchanged: number;
  bearersCreated: number;
  bearersUpdated: number;
  bearersUnchanged: number;
  grantsCreated: number;
  grantsUnchanged: number;
  personaVersionsAppended: number;
}

function sameGroups(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function seedAgents(
  agents: AgentRepository,
  seed: SeedFile,
  result: SeedResult,
): void {
  for (const entry of seed.agents) {
    const existing = agents.get(entry.agent_id);
    if (!existing) {
      const bySlug = agents.getBySlug(entry.slug);
      if (bySlug) {
        throw new ConfigValidationError([
          `agent slug "${entry.slug}" already belongs to agent_id "${bySlug.id}"; seeding does not mutate slugs or ids`,
        ]);
      }
      try {
        agents.create({
          id: entry.agent_id,
          slug: entry.slug,
          name: entry.name,
          ownerId: entry.owner_id,
          groups: entry.groups,
          persona: entry.persona,
        });
      } catch (error) {
        if (isSqliteUniqueConstraintError(error, "agents.slug")) {
          throw new ConfigValidationError([
            `agent slug "${entry.slug}" already exists`,
          ]);
        }
        if (isSqliteUniqueConstraintError(error, "agents.id")) {
          throw new ConfigValidationError([
            `agent id "${entry.agent_id}" already exists`,
          ]);
        }
        throw error;
      }
      result.agentsCreated += 1;
      continue;
    }

    if (existing.slug !== entry.slug) {
      throw new ConfigValidationError([
        `agent "${entry.agent_id}" already exists with slug "${existing.slug}"; seeding does not mutate slugs (seed has "${entry.slug}")`,
      ]);
    }
    if (existing.ownerId !== entry.owner_id) {
      throw new ConfigValidationError([
        `agent "${entry.agent_id}" already exists with owner_id "${existing.ownerId}"; owner is fixed at registration (seed has "${entry.owner_id}")`,
      ]);
    }

    let changed = false;
    if (existing.name !== entry.name) {
      agents.updateName(entry.agent_id, { name: entry.name });
      changed = true;
    }
    if (!sameGroups(existing.groups, entry.groups)) {
      agents.updateGroups(entry.agent_id, { groups: entry.groups });
      changed = true;
    }

    const currentPersona = agents.getCurrentPersona(entry.agent_id);
    if (currentPersona === null) {
      throw new ConfigValidationError([
        `agent "${entry.agent_id}" has no current persona version`,
      ]);
    }
    if (currentPersona.content !== entry.persona) {
      agents.appendPersona(entry.agent_id, entry.persona);
      result.personaVersionsAppended += 1;
      changed = true;
    }

    if (changed) {
      result.agentsUpdated += 1;
    } else {
      result.agentsUnchanged += 1;
    }
  }
}

function seedBearers(
  bearers: BearerRepository,
  seed: SeedFile,
  result: SeedResult,
): void {
  for (const entry of seed.bearers) {
    const existing = bearers.get(entry.bearer_id);
    if (!existing) {
      bearers.create({
        bearerId: entry.bearer_id,
        displayName: entry.display_name,
      });
      result.bearersCreated += 1;
      continue;
    }

    if (existing.displayName !== entry.display_name) {
      bearers.updateDisplayName(entry.bearer_id, entry.display_name);
      result.bearersUpdated += 1;
    } else {
      result.bearersUnchanged += 1;
    }
  }
}

function seedGrants(
  bearers: BearerRepository,
  agents: AgentRepository,
  seed: SeedFile,
  result: SeedResult,
): void {
  for (const entry of seed.grants) {
    if (!bearers.get(entry.bearer_id)) {
      throw new ConfigValidationError([
        `grant references unknown bearer_id "${entry.bearer_id}"`,
      ]);
    }
    if (!agents.get(entry.agent_id)) {
      throw new ConfigValidationError([
        `grant references unknown agent_id "${entry.agent_id}"`,
      ]);
    }
    if (bearers.hasGrant(entry.bearer_id, entry.agent_id)) {
      result.grantsUnchanged += 1;
      continue;
    }
    bearers.grant(entry.bearer_id, entry.agent_id);
    result.grantsCreated += 1;
  }
}

/**
 * One-way idempotent seed. Applies agents, bearers, and grants from the file
 * into the DB. Does not delete rows absent from the file. Does not mutate
 * existing agent ids or slugs.
 */
export function seedFudaDatabase(
  repos: SeedRepositories,
  seed: SeedFile,
): SeedResult {
  const result: SeedResult = {
    agentsCreated: 0,
    agentsUpdated: 0,
    agentsUnchanged: 0,
    bearersCreated: 0,
    bearersUpdated: 0,
    bearersUnchanged: 0,
    grantsCreated: 0,
    grantsUnchanged: 0,
    personaVersionsAppended: 0,
  };

  seedAgents(repos.agents, seed, result);
  seedBearers(repos.bearers, seed, result);
  seedGrants(repos.bearers, repos.agents, seed, result);
  return result;
}
