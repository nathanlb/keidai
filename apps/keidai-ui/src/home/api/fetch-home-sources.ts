import type { HomeDigestSources } from "../utils/build-home-digest.js";
import { LIST_BUFFER_LIMIT } from "../../lib/constants/list-limits.js";
import { fetchJson } from "../../lib/api/fetch-json.js";

export async function fetchHomeDigestSources(): Promise<HomeDigestSources> {
  return fetchJson<HomeDigestSources>(
    `/api/ui/home/digest?limit=${encodeURIComponent(String(LIST_BUFFER_LIMIT))}`,
  );
}
