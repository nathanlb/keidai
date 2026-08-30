import { formatEcosystemVersion } from "../utils/service-status.js";
import { useFudaStatus } from "./use-fuda-status.js";
import { useShaidenStatus } from "./use-shaiden-status.js";
import { useToriiStatus } from "./use-torii-status.js";

export function useEcosystemHealth() {
  const { status: torii } = useToriiStatus();
  const { status: fuda } = useFudaStatus();
  const { status: shaiden } = useShaidenStatus();

  return {
    torii,
    fuda,
    shaiden,
    version: formatEcosystemVersion([torii, fuda, shaiden]),
  };
}
