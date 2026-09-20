export interface VerificationCodeHasherPort {
  hash(code: string): string;
}
