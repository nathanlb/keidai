import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import {
  OperatorsValidationError,
  parseOperatorsDocument,
  type OperatorsFile,
} from "@keidai/shared";
import { ConfigValidationError } from "../../config/utils/loader.js";

export async function loadOperatorsFile(filePath: string): Promise<OperatorsFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    throw new ConfigValidationError([
      `Failed to read operators file at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
  }

  let document: unknown;
  try {
    document = parseYaml(raw);
  } catch (error) {
    throw new ConfigValidationError([
      `Failed to parse operators YAML at ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ]);
  }

  try {
    return parseOperatorsDocument(document);
  } catch (error) {
    if (error instanceof OperatorsValidationError) {
      throw new ConfigValidationError([
        `Invalid operators file ${filePath}: ${error.message}`,
      ]);
    }
    throw error;
  }
}
