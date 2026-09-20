export interface PasswordVerifierPort {
  verify(password: string, passwordHash: string | null): Promise<boolean>;
}
