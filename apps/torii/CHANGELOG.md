# @keidai/torii

## 0.9.0

### Minor Changes

- Fix log retention and duration time formatting ([#173](https://github.com/nathanlb/keidai/pull/173))

### Patch Changes

- Updated dependencies:
  - @keidai/shared@0.9.0
  - @keidai/postgres@0.9.0

## 0.8.0

### Minor Changes

- Editable task limits including no limits ([#170](https://github.com/nathanlb/keidai/pull/170))
- Enhance UI components with new status tones and update styling conventions ([#168](https://github.com/nathanlb/keidai/pull/168))
- Operator rbac adminmember user scoped resource authorization ([#167](https://github.com/nathanlb/keidai/pull/167))
- Scope Connections and OAuth Providers views to signed-in operator (NAT-208) ([#165](https://github.com/nathanlb/keidai/pull/165))
- Preserve user_oauth tool schemas in ToolCatalogService across unlinked refreshes (NAT-207) ([#164](https://github.com/nathanlb/keidai/pull/164))
- Isolate user_oauth MCP client sessions and state by owner (NAT-205) ([#163](https://github.com/nathanlb/keidai/pull/163))
- Enforce session owner on BFF OAuth/connection routes and block grant wipe (NAT-206) ([#162](https://github.com/nathanlb/keidai/pull/162))
- Implement owners management API for OIDC SSO support ([#160](https://github.com/nathanlb/keidai/pull/160))

### Patch Changes

- Updated dependencies:
  - @keidai/shared@0.8.0
  - @keidai/postgres@0.8.0

## 0.7.2

### Patch Changes

- Add tests for OpenRouter model ID handling and update validation schema ([#156](https://github.com/nathanlb/keidai/pull/156))
- Updated dependencies:
  - @keidai/shared@0.7.2
  - @keidai/postgres@0.7.2

## 0.7.1

### Patch Changes

- Update shaiden-sandbox to version 0.7.0 and add it to changeset config ([#154](https://github.com/nathanlb/keidai/pull/154))
- Updated dependencies:
  - @keidai/shared@0.7.1
  - @keidai/postgres@0.7.1

## 0.7.0

### Minor Changes

- Add emoji avatar to agents and deps upgrade ([#152](https://github.com/nathanlb/keidai/pull/152))
- Ui improvements, openrouter config and model selection ([#149](https://github.com/nathanlb/keidai/pull/149))
- Add agent hibernation and python execution sandbox ([#146](https://github.com/nathanlb/keidai/pull/146))

### Patch Changes

- Updated dependencies:
  - @keidai/shared@0.7.0
  - @keidai/postgres@0.7.0

## 0.6.0

### Minor Changes

- Implement Mcp-Param header handling for backend tool calls and enhance tests for header mirroring ([#143](https://github.com/nathanlb/keidai/pull/143))

### Patch Changes

- Updated dependencies:
  - @keidai/shared@0.6.0
  - @keidai/postgres@0.6.0

## 0.5.0

### Minor Changes

- Enhance SSE event handling and introduce PgChannelListener for connector notifications ([#139](https://github.com/nathanlb/keidai/pull/139))

### Patch Changes

- Updated dependencies:
  - @keidai/shared@0.5.0
  - @keidai/postgres@0.5.0

## 0.4.0

### Minor Changes

**Features**

- Refactor task authoring and introducing scheduled tasks ([#135](https://github.com/nathanlb/keidai/pull/135))
- Enhance system map functionality and UI components ([#133](https://github.com/nathanlb/keidai/pull/133))

**Refactors**

- Update navigation and routing for groups, replacing configure path with direct access to policy groups ([#132](https://github.com/nathanlb/keidai/pull/132))

### Patch Changes

- Updated dependencies:
  - @keidai/shared@0.4.0
  - @keidai/postgres@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies []:
  - @keidai/shared@0.3.0
  - @keidai/postgres@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies []:
  - @keidai/shared@0.2.0
  - @keidai/postgres@0.2.0

## 0.1.0

### Patch Changes

- Updated dependencies []:
  - @keidai/shared@0.1.0
  - @keidai/postgres@0.1.0
