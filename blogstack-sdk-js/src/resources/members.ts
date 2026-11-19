import type { HttpClient } from "../client.js";
import type {
  ProjectMember,
  ProjectMemberList,
  ProjectRole,
  Invitation,
  PendingInvitation,
  InviteProjectMemberRequest,
  AcceptInvitationResponse,
} from "../types.js";

export class MembersResource {
  constructor(private readonly http: HttpClient) {}

  /** List all members of a project. */
  list(projectId: string): Promise<ProjectMemberList> {
    return this.http.get<ProjectMemberList>(`/projects/${projectId}/members`);
  }

  /** Update a project member's role. */
  update(
    projectId: string,
    memberId: string,
    data: { role: ProjectRole },
  ): Promise<ProjectMember> {
    return this.http.patch<ProjectMember>(
      `/projects/${projectId}/members/${memberId}`,
      data,
    );
  }

  /** Remove a member from a project. */
  remove(projectId: string, memberId: string): Promise<void> {
    return this.http.delete(`/projects/${projectId}/members/${memberId}`);
  }

  /** Invite a new member to a project by email. */
  invite(
    projectId: string,
    data: InviteProjectMemberRequest,
  ): Promise<{ id: string; email: string; role: ProjectRole; token: string }> {
    return this.http.post(`/projects/${projectId}/members`, data);
  }

  /** List pending invitations for a project. */
  listInvitations(projectId: string): Promise<PendingInvitation[]> {
    return this.http.get<PendingInvitation[]>(
      `/projects/${projectId}/invitations`,
    );
  }

  /** Resend a project invitation. */
  resendInvitation(
    projectId: string,
    invitationId: string,
  ): Promise<PendingInvitation> {
    return this.http.post<PendingInvitation>(
      `/projects/${projectId}/invitations/${invitationId}/resend`,
    );
  }

  /** Cancel a pending project invitation. */
  cancelInvitation(projectId: string, invitationId: string): Promise<void> {
    return this.http.delete(
      `/projects/${projectId}/invitations/${invitationId}`,
    );
  }

  // ── Invitations ─────────────────────────────────────────────────────────────

  /** Get invitation details by token (no auth required). */
  getInvitation(token: string): Promise<Invitation> {
    return this.http.get<Invitation>(`/invitations/${token}`);
  }

  /** Accept an invitation (creates account membership). */
  acceptInvitation(token: string): Promise<AcceptInvitationResponse> {
    return this.http.post<AcceptInvitationResponse>(
      `/invitations/${token}/accept`,
    );
  }
}
