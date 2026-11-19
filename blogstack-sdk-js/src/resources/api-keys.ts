import type { HttpClient } from "../client.js";
import type {
  ApiKey,
  ApiKeyList,
  CreateApiKeyRequest,
  CreateApiKeyResponse,
} from "../types.js";

export class ApiKeysResource {
  constructor(private readonly http: HttpClient) {}

  /** List all API keys for a project (keys are masked — only prefix shown). */
  list(projectId: string): Promise<ApiKeyList> {
    return this.http.get<ApiKeyList>(`/projects/${projectId}/api-keys`);
  }

  /**
   * Create a new API key.
   * The full secret key is returned **once** in `CreateApiKeyResponse.key`.
   * Store it immediately — it cannot be retrieved again.
   */
  create(
    projectId: string,
    data: CreateApiKeyRequest,
  ): Promise<CreateApiKeyResponse> {
    return this.http.post<CreateApiKeyResponse>(
      `/projects/${projectId}/api-keys`,
      data,
    );
  }

  /** Revoke (delete) an API key. */
  revoke(projectId: string, keyId: string): Promise<void> {
    return this.http.delete(`/projects/${projectId}/api-keys/${keyId}`);
  }
}

export type { ApiKey, ApiKeyList, CreateApiKeyRequest, CreateApiKeyResponse };
