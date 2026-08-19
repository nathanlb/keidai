import type { Migration } from "@keidai/postgres";
import { migration001Baseline } from "./001_baseline.js";

export const fudaMigrations: readonly Migration[] = [migration001Baseline];
