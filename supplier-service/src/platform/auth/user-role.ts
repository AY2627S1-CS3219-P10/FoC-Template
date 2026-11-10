/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of user role code (UserRole, AuthenticatedUser).
 * Author review: Validated UserRole, AuthenticatedUser existing type members and constant values in supplier-service/user-role.ts; edited naming and formatting for readability.
 */

export enum UserRole {
  Student = 'STUDENT',
  Admin = 'ADMIN',
}

export interface AuthenticatedUser {
  role: UserRole;
  sessionId: string;
  userId: string;
}
