/** Session profile from GET /api/auth/me — shared /account page state. */
export type Contributor = {
  id: number;
  email: string;
  displayName: string | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
