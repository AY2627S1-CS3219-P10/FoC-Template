import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FindAdministratorAccountsQuery {
  @ApiPropertyOptional({
    description: 'Case-insensitive username or email substring.',
    example: 'arthur',
    maxLength: 254,
  })
  @IsOptional()
  @IsString()
  @MaxLength(254)
  search?: string;
}
