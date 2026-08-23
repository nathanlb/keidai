/** Per-server policy on a group. Tool names are bare, not `server.tool`. */
export interface GroupServerPolicyView {
  server: string;
  default: "allow" | "deny";
  allow: string[];
  deny: string[];
  gated: string[];
}

/** Group definition for authoring. `name` is the Fuda join key. */
export interface GroupView {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  servers: GroupServerPolicyView[];
}

/** Response body for `GET /api/groups`. */
export interface GroupsResponse {
  groups: GroupView[];
}

/** Response body for `GET /api/groups/:id`, `POST /api/groups`, `PATCH /api/groups/:id`. */
export interface GroupResponse {
  group: GroupView;
}

/** Request body for `POST /api/groups`. */
export interface CreateGroupRequest {
  name: string;
  description?: string;
  servers?: GroupServerPolicyView[];
}

/** Request body for `PATCH /api/groups/:id`. `name` is rejected — it is immutable. */
export interface UpdateGroupRequest {
  description?: string;
  servers?: GroupServerPolicyView[];
}
