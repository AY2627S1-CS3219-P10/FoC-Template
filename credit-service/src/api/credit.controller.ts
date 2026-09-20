import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CreditService } from '../application/credit.service';
import { ErrandParamsDto, UserParamsDto } from './dto/errand-params.dto';
import { InitializeAccountDto } from './dto/initialize-account.dto';
import { ReserveCreditsDto } from './dto/reserve-credits.dto';
import { SettleCreditsDto } from './dto/settle-credits.dto';
import { InternalServiceAuthGuard } from './internal-service-auth.guard';

@ApiTags('credits')
@Controller('v1')
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Post('credit-accounts')
  @UseGuards(InternalServiceAuthGuard)
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({ description: 'Bearer token is missing or malformed' })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @ApiOperation({ summary: 'Provision starting credits for a verified user' })
  @ApiCreatedResponse({ description: 'The account was provisioned' })
  @ApiOkResponse({ description: 'The account already existed; no credits added' })
  async initialize(
    @Body() body: InitializeAccountDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.creditService.initializeAccount(body.userId);
    reply.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return { ...result.data, replayed: result.replayed };
  }

  @Get('credit-accounts/:userId')
  @ApiOperation({ summary: 'Get available and reserved credit balances' })
  @ApiOkResponse({ description: 'Current authoritative balance' })
  @ApiNotFoundResponse({ description: 'Credit account does not exist' })
  getBalance(@Param() params: UserParamsDto) {
    return this.creditService.getBalance(params.userId);
  }

  @Post('credit-reservations')
  @UseGuards(InternalServiceAuthGuard)
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({ description: 'Bearer token is missing or malformed' })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @ApiOperation({ summary: 'Reserve requester credits for an errand' })
  @ApiCreatedResponse({ description: 'Credits were reserved' })
  @ApiOkResponse({ description: 'An identical reservation was replayed' })
  @ApiConflictResponse({ description: 'Errand idempotency conflict' })
  @ApiUnprocessableEntityResponse({ description: 'Insufficient credits' })
  async reserve(
    @Body() body: ReserveCreditsDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.creditService.reserve(body);
    reply.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return { ...result.data, replayed: result.replayed };
  }

  @Post('credit-reservations/:errandId/settlement')
  @UseGuards(InternalServiceAuthGuard)
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({ description: 'Bearer token is missing or malformed' })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transfer reserved credits to the assigned courier' })
  @ApiOkResponse({ description: 'Credits were settled or replayed safely' })
  @ApiConflictResponse({ description: 'Reservation is released or courier differs' })
  settle(
    @Param() params: ErrandParamsDto,
    @Body() body: SettleCreditsDto,
  ) {
    return this.creditService
      .settle(params.errandId, body.courierId)
      .then((result) => ({ ...result.data, replayed: result.replayed }));
  }

  @Post('credit-reservations/:errandId/release')
  @UseGuards(InternalServiceAuthGuard)
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({ description: 'Bearer token is missing or malformed' })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Return reserved credits after errand cancellation' })
  @ApiOkResponse({ description: 'Credits were released or replayed safely' })
  @ApiConflictResponse({ description: 'Reservation was already settled' })
  release(@Param() params: ErrandParamsDto) {
    return this.creditService.release(params.errandId).then((result) => ({
      ...result.data,
      replayed: result.replayed,
    }));
  }
}
