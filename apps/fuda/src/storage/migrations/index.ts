import { migration001Baseline } from "./001_baseline.js";
import type { Migration } from "../migrate.js";

export const fudaMigrations: readonly Migration[] = [migration001Baseline];
