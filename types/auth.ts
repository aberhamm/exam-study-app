// Shared application-specific user claims used across client and server code.
export type AppUser = {
  id: string;
  email: string;
  role: string;
  tier: string;
  hasAccess: boolean;
  isAdmin: boolean;
  permissions: string[];
};
