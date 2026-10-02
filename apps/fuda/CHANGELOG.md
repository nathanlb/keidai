# @keidai/fuda

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

### Minor Changes

- - Connector configuration is now persisted in the database, replacing file-based storage for connector settings.
  - Updated k3s installation guide: Helm chart and container images are publicly accessible, so GitHub PAT and pull secret are no longer required.

### Patch Changes

- Updated dependencies []:
  - @keidai/shared@0.3.0
  - @keidai/postgres@0.3.0

## 0.2.0

### Minor Changes

- - Updated the release pipeline to use `execFileSync` for git commands in the `prepare-release-changeset` script, improving stability and error handling during release preparation.

### Patch Changes

- Updated dependencies []:
  - @keidai/shared@0.2.0
  - @keidai/postgres@0.2.0

## 0.1.0

### Minor Changes

- Initial platform release versioning (0.1.0).

### Patch Changes

- Updated dependencies []:
  - @keidai/shared@0.1.0
  - @keidai/postgres@0.1.0
