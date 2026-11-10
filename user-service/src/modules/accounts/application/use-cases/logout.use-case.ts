/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of logout code (LogoutInput, LogoutDependencies, LogoutUseCase).
 * Author review: Validated LogoutInput, LogoutDependencies input handling, dependency calls, and success/error return paths; clarified local naming and control-flow formatting.
 */

import type { AuthenticationRepositoryPort } from '../ports/authentication-repository.port.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { RefreshTokenPort } from '../ports/refresh-token.port.js';

export interface LogoutInput {
  refreshToken: string;
}

export interface LogoutDependencies {
  clock: ClockPort;
  refreshTokens: RefreshTokenPort;
  repository: Pick<AuthenticationRepositoryPort, 'revokeSession'>;
}

export class LogoutUseCase {
  constructor(private readonly dependencies: LogoutDependencies) {}

  async execute(input: LogoutInput): Promise<void> {
    await this.dependencies.repository.revokeSession({
      now: this.dependencies.clock.now(),
      refreshTokenHash: this.dependencies.refreshTokens.hash(
        input.refreshToken,
      ),
    });
  }
}
