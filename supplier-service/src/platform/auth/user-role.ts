export enum UserRole {
  Student = 'STUDENT',
  Admin = 'ADMIN',
}

export interface AuthenticatedUser {
  role: UserRole;
  sessionId: string;
  userId: string;
}
