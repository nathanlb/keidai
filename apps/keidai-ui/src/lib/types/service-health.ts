export interface ServiceHealth {
  healthy: boolean;
  label: string;
  displayAddress: string;
  version: string;
}

export const initialServiceHealth = (
  label: string,
): ServiceHealth => ({
  healthy: false,
  label,
  displayAddress: "",
  version: "",
});
