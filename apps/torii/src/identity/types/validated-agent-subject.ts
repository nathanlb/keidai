/** Validated workload identity passed from resolver to agent registry — not exposed on the call path. */
export type ValidatedAgentSubject = {
  kind: "k8s_service_account";
  namespace: string;
  serviceAccountName: string;
};
