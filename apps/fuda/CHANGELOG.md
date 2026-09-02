# @keidai/fuda

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
