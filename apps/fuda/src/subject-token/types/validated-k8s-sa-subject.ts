/** Parsed Kubernetes service-account subject — validator-private. */
export type ValidatedK8sSaSubject = {
  kind: "k8s_service_account";
  namespace: string;
  serviceAccountName: string;
};
