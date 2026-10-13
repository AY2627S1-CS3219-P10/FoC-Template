import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { CreditService } from '../application/credit.service';
import { BalanceAuthorizationGuard } from './balance-authorization.guard';
import { AdjustReservationDto } from './dto/adjust-reservation.dto';
import { ErrandParamsDto, UserParamsDto } from './dto/errand-params.dto';
import { InitializeAccountDto } from './dto/initialize-account.dto';
import { InternalCallerOnly } from './internal-caller.decorator';
import { ReserveCreditsDto } from './dto/reserve-credits.dto';
import { ReleaseCreditsDto } from './dto/release-credits.dto';
import { SettleCreditsDto } from './dto/settle-credits.dto';
import { TransactionHistoryQueryDto } from './dto/transaction-history-query.dto';
import { InternalServiceAuthGuard } from './internal-service-auth.guard';
import { UserAccessTokenGuard } from './user-access-token.guard';

@ApiTags('credits')
@Controller('v1')
export class CreditController {
  constructor(private readonly creditService: CreditService) {}

  @Post('credit-accounts')
  @UseGuards(InternalServiceAuthGuard)
  @InternalCallerOnly('user-service')
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or malformed',
  })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @ApiOperation({ summary: 'Provision starting credits for a verified user' })
  @ApiCreatedResponse({ description: 'The account was provisioned' })
  @ApiOkResponse({
    description: 'The account already existed; no credits added',
  })
  async initialize(
    @Body() body: InitializeAccountDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.creditService.initializeAccount(
      body.userId,
      String(request.id),
    );
    reply.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return { ...result.data, replayed: result.replayed };
  }

  @Get('credit-accounts/:userId')
  @UseGuards(UserAccessTokenGuard, BalanceAuthorizationGuard)
  @ApiBearerAuth('access-token')
  @ApiUnauthorizedResponse({
    description: 'A valid User Service access token is required',
  })
  @ApiForbiddenResponse({
    description: 'Users may only read their own balance',
  })
  @ApiOperation({ summary: 'Get available and reserved credit balances' })
  @ApiOkResponse({ description: 'Current authoritative balance' })
  @ApiNotFoundResponse({ description: 'Credit account does not exist' })
  getBalance(@Param() params: UserParamsDto) {
    return this.creditService.getBalance(params.userId);
  }

  @Get('credit-accounts/:userId/transactions')
  @UseGuards(UserAccessTokenGuard, BalanceAuthorizationGuard)
  @ApiBearerAuth('access-token')
  @ApiUnauthorizedResponse({
    description: 'A valid User Service access token is required',
  })
  @ApiForbiddenResponse({
    description: 'Users may only read their own transaction history',
  })
  @ApiOperation({ summary: 'Get immutable credit transaction history' })
  @ApiOkResponse({ description: 'Newest-first transaction history page' })
  @ApiNotFoundResponse({ description: 'Credit account does not exist' })
  getTransactionHistory(
    @Param() params: UserParamsDto,
    @Query() query: TransactionHistoryQueryDto,
  ) {
    return this.creditService.getTransactionHistory(
      params.userId,
      query.limit,
      query.offset,
    );
  }

  @Post('credit-reservations')
  @UseGuards(InternalServiceAuthGuard)
  @InternalCallerOnly('order-service')
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or malformed',
  })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @ApiOperation({ summary: 'Reserve requester credits for an errand' })
  @ApiCreatedResponse({ description: 'Credits were reserved' })
  @ApiOkResponse({ description: 'An identical reservation was replayed' })
  @ApiConflictResponse({ description: 'Errand idempotency conflict' })
  @ApiUnprocessableEntityResponse({ description: 'Insufficient credits' })
  async reserve(
    @Body() body: ReserveCreditsDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.creditService.reserve({
      ...body,
      correlationId: String(request.id),
    });
    reply.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    return { ...result.data, replayed: result.replayed };
  }

  @Post('credit-reservations/:errandId/adjustment')
  @UseGuards(InternalServiceAuthGuard)
  @InternalCallerOnly('order-service')
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or malformed',
  })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Adjust the bounty reserved for an open errand' })
  @ApiOkResponse({
    description: 'The reservation amount was adjusted or replayed',
  })
  @ApiConflictResponse({
    description: 'Reservation state or adjustment idempotency conflict',
  })
  @ApiUnprocessableEntityResponse({ description: 'Insufficient credits' })
  adjust(
    @Param() params: ErrandParamsDto,
    @Body() body: AdjustReservationDto,
    @Req() request: FastifyRequest,
  ) {
    return this.creditService
      .adjust({
        errandId: params.errandId,
        ...body,
        correlationId: String(request.id),
      })
      .then((result) => ({ ...result.data, replayed: result.replayed }));
  }

  @Post('credit-reservations/:errandId/settlement')
  @UseGuards(InternalServiceAuthGuard)
  @InternalCallerOnly('order-service')
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or malformed',
  })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Transfer reserved credits to the assigned courier',
  })
  @ApiOkResponse({ description: 'Credits were settled or replayed safely' })
  @ApiConflictResponse({
    description: 'Reservation data conflicts or the reservation was released',
  })
  settle(
    @Param() params: ErrandParamsDto,
    @Body() body: SettleCreditsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.creditService
      .settle({
        errandId: params.errandId,
        ...body,
        correlationId: String(request.id),
      })
      .then((result) => ({ ...result.data, replayed: result.replayed }));
  }

  @Post('credit-reservations/:errandId/release')
  @UseGuards(InternalServiceAuthGuard)
  @InternalCallerOnly('order-service')
  @ApiBearerAuth('internal-service-token')
  @ApiUnauthorizedResponse({
    description: 'Bearer token is missing or malformed',
  })
  @ApiForbiddenResponse({ description: 'Service token is not authorized' })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Return reserved credits after errand cancellation',
  })
  @ApiOkResponse({ description: 'Credits were released or replayed safely' })
  @ApiConflictResponse({
    description: 'Reservation data conflicts or the reservation was settled',
  })
  release(
    @Param() params: ErrandParamsDto,
    @Body() body: ReleaseCreditsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.creditService
      .release({
        errandId: params.errandId,
        ...body,
        correlationId: String(request.id),
      })
      .then((result) => ({
        ...result.data,
        replayed: result.replayed,
      }));
  }
}
