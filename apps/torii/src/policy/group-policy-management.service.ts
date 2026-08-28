import { inject, injectable } from "tsyringe";
import { isUniqueViolation } from "@keidai/postgres";
import type { GroupView } from "@keidai/shared";
import { ToriiConfigService } from "../config/torii-config.service.js";
import { GroupPolicyCache } from "./group-policy-cache.service.js";
import type { CreateGroupBody, UpdateGroupBody } from "./types/group-api.js";
import {
  GROUP_POLICY_REPOSITORY,
  type GroupPolicyRepository,
} from "./types/group-policy-repository.js";
import { GroupPolicyWriteError } from "./types/group-policy-write.js";
import { assertValidGroupServers } from "./utils/assert-valid-group-servers.js";
import { toGroupView } from "./utils/project-group-api.js";

@injectable()
export class GroupPolicyManagementService {
  constructor(
    @inject(GROUP_POLICY_REPOSITORY)
    private readonly repository: GroupPolicyRepository,
    @inject(GroupPolicyCache)
    private readonly cache: GroupPolicyCache,
    @inject(ToriiConfigService)
    private readonly configService: ToriiConfigService,
  ) {}

  async list(): Promise<GroupView[]> {
    return (await this.repository.list()).map(toGroupView);
  }

  async get(id: string): Promise<GroupView | null> {
    const group = await this.repository.get(id);
    return group ? toGroupView(group) : null;
  }

  async create(input: CreateGroupBody): Promise<GroupView> {
    this.assertValidServers(input.servers);
    try {
      const created = await this.repository.create(input);
      await this.refreshCache();
      return toGroupView(created);
    } catch (error) {
      if (isUniqueViolation(error, "name")) {
        throw new GroupPolicyWriteError(
          "group name already exists",
          409,
        );
      }
      throw error;
    }
  }

  async update(id: string, input: UpdateGroupBody): Promise<GroupView | null> {
    if (input.servers !== undefined) {
      this.assertValidServers(input.servers);
    }
    const updated = await this.repository.update(id, {
      description: input.description,
      servers: input.servers,
    });
    if (!updated) {
      return null;
    }
    await this.refreshCache();
    return toGroupView(updated);
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.repository.delete(id);
    if (deleted) {
      await this.refreshCache();
    }
    return deleted;
  }

  private assertValidServers(
    servers: CreateGroupBody["servers"],
  ): void {
    const knownServers = new Set(
      this.configService.getRegistry().listEnabled().map((connector) => connector.slug),
    );
    assertValidGroupServers(servers, knownServers);
  }

  private async refreshCache(): Promise<void> {
    this.cache.replace(await this.repository.list());
  }
}
