/** A tool entry in the aggregated, namespaced catalog. */
export interface CatalogTool {
  /** Namespaced name: `<server>.<tool>`. */
  name: string;
  /** Owning backend server name. */
  server: string;
  /** Original tool name on the backend. */
  localName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

/** In-memory tool catalog built at boot from backend discovery. */
export interface ToolCatalog {
  tools: CatalogTool[];
  /** Lookup by namespaced tool name. */
  byName: Map<string, CatalogTool>;
  /** Tools grouped by owning server. */
  byServer: Map<string, CatalogTool[]>;
}

export function createEmptyCatalog(): ToolCatalog {
  return {
    tools: [],
    byName: new Map(),
    byServer: new Map(),
  };
}

export function addToolToCatalog(catalog: ToolCatalog, tool: CatalogTool): void {
  catalog.tools.push(tool);
  catalog.byName.set(tool.name, tool);

  const serverTools = catalog.byServer.get(tool.server) ?? [];
  serverTools.push(tool);
  catalog.byServer.set(tool.server, serverTools);
}

export function namespaceTool(server: string, localName: string): string {
  return `${server}.${localName}`;
}
