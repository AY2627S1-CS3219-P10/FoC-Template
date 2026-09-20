export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
}
