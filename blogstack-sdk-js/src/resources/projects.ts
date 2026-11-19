import type { HttpClient } from "../client.js";
import type {
  Project,
  ProjectList,
  ProjectStats,
  CreateProjectRequest,
  UpdateProjectRequest,
} from "../types.js";

export class ProjectsResource {
  constructor(private readonly http: HttpClient) {}

  export(
    projectId: string,
  ): Promise<import("../launch-types.js").ProjectExport> {
    return this.http.get(
      "/projects/" + encodeURIComponent(projectId) + "/export",
    );
  }

  /** List all projects for the account. */
  list(params?: { page?: number; limit?: number }): Promise<ProjectList> {
    return this.http.get<ProjectList>("/projects", params);
  }

  /** Create a new project. */
  create(data: CreateProjectRequest): Promise<Project> {
    return this.http.post<Project>("/projects", data);
  }

  /** Get a project by ID. */
  get(projectId: string): Promise<Project> {
    return this.http.get<Project>(`/projects/${projectId}`);
  }

  /** Update a project. */
  update(projectId: string, data: UpdateProjectRequest): Promise<Project> {
    return this.http.patch<Project>(`/projects/${projectId}`, data);
  }

  /** Delete a project. */
  delete(projectId: string): Promise<void> {
    return this.http.delete(`/projects/${projectId}`);
  }

  /** Get project statistics (post counts, views). */
  stats(projectId: string): Promise<ProjectStats> {
    return this.http.get<ProjectStats>(`/projects/${projectId}/stats`);
  }
}
