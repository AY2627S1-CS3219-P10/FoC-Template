export interface RefreshTokenPort {
  generate(): string;
  hash(token: string): string;
}
