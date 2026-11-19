import type { HttpClient } from "../client.js";
import type {
  Account,
  AccountMember,
  MemberList,
  InviteMemberRequest,
  PendingInvitation,
  UpdateAccountRequest,
} from "../types.js";

export class AccountsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<import("../launch-types.js").AccessibleAccount[]> {
    return this.http.get("/accounts");
  }

  /** Get the authenticated user's account. */
  get(): Promise<Account> {
    return this.http.get<Account>("/accounts/me");
  }

  /** Update account settings. */
  update(data: UpdateAccountRequest): Promise<Account> {
    return this.http.patch<Account>("/accounts/me", data);
  }

  /** List all members of the account. */
  listMembers(): Promise<MemberList> {
    return this.http.get<MemberList>("/accounts/members");
  }

  /** Invite a new member to the account. */
  inviteMember(data: InviteMemberRequest): Promise<{
    id: string;
    accountId: string;
    email: string;
    role: AccountMember["role"];
    invitedBy: string;
    token: string;
    expiresAt: number;
    acceptedAt: null;
  }> {
    return this.http.post("/accounts/members", data);
  }

  /** List pending invitations for the account. */
  listInvitations(): Promise<PendingInvitation[]> {
    return this.http.get<PendingInvitation[]>("/accounts/invitations");
  }

  /** Resend an account invitation. */
  resendInvitation(invitationId: string): Promise<PendingInvitation> {
    return this.http.post<PendingInvitation>(
      `/accounts/invitations/${invitationId}/resend`,
    );
  }

  /** Cancel a pending account invitation. */
  cancelInvitation(invitationId: string): Promise<void> {
    return this.http.delete(`/accounts/invitations/${invitationId}`);
  }

  /** Remove a member from the account. */
  removeMember(memberId: string): Promise<void> {
    return this.http.delete(`/accounts/members/${memberId}`);
  }

  /** Update a member's role. */
  updateMember(
    memberId: string,
    data: { role: AccountMember["role"] },
  ): Promise<AccountMember> {
    return this.http.patch<AccountMember>(
      `/accounts/members/${memberId}`,
      data,
    );
  }
}
