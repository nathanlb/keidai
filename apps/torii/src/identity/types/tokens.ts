export const AGENT_IDENTITY_RESOLVER = Symbol("AGENT_IDENTITY_RESOLVER");
export const FUDA_JWT_CONFIG = Symbol("FUDA_JWT_CONFIG");
/** Test override for JWKS verification; production resolves from {@link FUDA_JWT_CONFIG}. */
export const JWT_VERIFY_KEY = Symbol("JWT_VERIFY_KEY");
