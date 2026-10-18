import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { OrderService } from '../application/order.service';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import {
  CreateErrandDto,
  EditErrandDto,
  ErrandResponse,
  ListErrandsDto,
  ManageErrandsDto,
  OperationResponse,
} from './dto';

@ApiTags('errands')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/errands')
export class OrderController {
  constructor(private readonly service: OrderService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Browse published OPEN and unassigned errands sorted by time or credits',
  })
  @ApiOkResponse({ type: [ErrandResponse] })
  @ApiUnauthorizedResponse()
  list(@Query() query: ListErrandsDto) {
    return this.service.list(query.limit ?? 50, query.offset ?? 0, query.sort);
  }
  @Get('manage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      "List your requests, or all requests (or one requester's via requesterId) for administrators",
  })
  @ApiOkResponse({ type: [ErrandResponse] })
  managed(
    @Query() query: ManageErrandsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.managed(
      request.userId,
      request.accessToken,
      query.limit ?? 50,
      query.offset ?? 0,
      query.sort,
      query.requesterId,
    );
  }
  @Get('assigned')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'List errands you accepted as courier, in any status',
  })
  @ApiOkResponse({ type: [ErrandResponse] })
  assigned(
    @Query() query: ListErrandsDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.assigned(
      request.userId,
      query.limit ?? 50,
      query.offset ?? 0,
      query.sort,
    );
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: ErrandResponse })
  find(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.find(id, request.userId, request.accessToken);
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOperation({ summary: 'Reserve credits before creating an OPEN errand' })
  @ApiCreatedResponse({ type: OperationResponse })
  @ApiAcceptedResponse({
    type: OperationResponse,
    description:
      'Processing continues durably; poll the operation or retry with the same key.',
  })
  @ApiBadRequestResponse({
    description: 'Invalid mandatory fields or unavailable pickup location',
  })
  @ApiConflictResponse({
    description: 'Idempotency key reused with different input',
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') key: string,
    @Body() body: CreateErrandDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!isUUID(key, '4'))
      throw new BadRequestException('Idempotency-Key must be a UUID v4.');
    const result = await this.service.create(
      request.userId,
      request.accessToken,
      key,
      body,
    );
    reply.status(result.status === 'SUCCEEDED' ? 201 : 202);
    return result;
  }
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOperation({
    summary:
      'Edit an OPEN, unassigned errand and atomically adjust its reserved bounty',
  })
  @ApiOkResponse({ type: OperationResponse })
  @ApiAcceptedResponse({ type: OperationResponse })
  @ApiConflictResponse({
    description:
      'Assigned/closed/stale errand, pending operation, or reused key',
  })
  async edit(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') key: string,
    @Body() body: EditErrandDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!isUUID(key, '4'))
      throw new BadRequestException('Idempotency-Key must be a UUID v4.');
    const result = await this.service.edit(request.userId, id, key, body);
    reply.status(result.status === 'SUCCEEDED' ? 200 : 202);
    return result;
  }
  @Post(':id/accept')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Accept an OPEN, unassigned errand as its courier; one winner under concurrency',
  })
  @ApiOkResponse({ type: ErrandResponse })
  @ApiForbiddenResponse({
    description:
      'Requesters cannot accept their own errand; ERRAND_COURIER_EXCLUDED after a courier cancel or missed pickup',
  })
  @ApiNotFoundResponse({ description: 'Missing or deleted errand' })
  @ApiConflictResponse({
    description:
      'Already accepted by someone else, not OPEN, or a change is pending',
  })
  accept(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.accept(id, request.userId, request.accessToken);
  }
  @Post(':id/pickup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Assigned courier: mark an ACCEPTED errand as PICKED_UP',
  })
  @ApiOkResponse({ type: ErrandResponse })
  @ApiForbiddenResponse({ description: 'Not the assigned courier' })
  @ApiConflictResponse({ description: 'Errand is not ACCEPTED' })
  pickup(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.pickup(id, request.userId, request.accessToken);
  }
  @Post(':id/deliver')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Assigned courier: mark a PICKED_UP errand as DELIVERED',
  })
  @ApiOkResponse({ type: ErrandResponse })
  @ApiForbiddenResponse({ description: 'Not the assigned courier' })
  @ApiConflictResponse({ description: 'Errand is not PICKED_UP' })
  deliver(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.deliver(id, request.userId, request.accessToken);
  }
  @Post(':id/dispute')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Requester: dispute a DELIVERED errand; credits stay reserved until resolved',
  })
  @ApiOkResponse({ type: ErrandResponse })
  @ApiForbiddenResponse({ description: 'Not the requester' })
  @ApiConflictResponse({ description: 'Errand is not DELIVERED' })
  dispute(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.dispute(id, request.userId, request.accessToken);
  }
  @Post(':id/confirm')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Requester: confirm a DELIVERED (or early, PICKED_UP) errand; pays the courier via errand.completed.v1',
  })
  @ApiOkResponse({ type: ErrandResponse })
  @ApiForbiddenResponse({ description: 'Not the requester' })
  @ApiConflictResponse({ description: 'Errand is not PICKED_UP or DELIVERED' })
  confirm(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.confirm(id, request.userId, request.accessToken);
  }
  @Post(':id/courier-cancel')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Assigned courier: give an ACCEPTED errand back; it reopens and you cannot accept it again',
  })
  @ApiOkResponse({ type: ErrandResponse })
  @ApiForbiddenResponse({ description: 'Not the assigned courier' })
  @ApiConflictResponse({
    description: 'Errand is not ACCEPTED (after pickup: Q-020)',
  })
  courierCancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.courierCancel(id, request.userId, request.accessToken);
  }
  @Post(':id/cancel')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Requester: cancel an OPEN or ACCEPTED errand and release the reserved credits',
  })
  @ApiOkResponse({ type: OperationResponse })
  @ApiAcceptedResponse({
    type: OperationResponse,
    description: 'The release continues durably; poll the operation.',
  })
  @ApiForbiddenResponse({ description: 'Not the requester' })
  @ApiConflictResponse({
    description: 'Picked up or later, or another change is pending',
  })
  async cancel(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.cancel(request.userId, id);
    reply.status(result.status === 'SUCCEEDED' ? 200 : 202);
    return result;
  }
  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOperation({
    summary:
      'Cancel your OPEN or ACCEPTED request (same as POST …/cancel), or delete any request as administrator; release reserved credits',
  })
  @ApiOkResponse({ type: OperationResponse })
  @ApiAcceptedResponse({ type: OperationResponse })
  async remove(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') key: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    if (!isUUID(key, '4'))
      throw new BadRequestException('Idempotency-Key must be a UUID v4.');
    const result = await this.service.remove(
      request.userId,
      request.accessToken,
      id,
      key,
    );
    reply.status(result.status === 'SUCCEEDED' ? 200 : 202);
    return result;
  }
}
@ApiTags('errand operations')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/errand-operations')
export class OperationController {
  constructor(private readonly service: OrderService) {}
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ type: OperationResponse })
  @ApiOperation({
    summary: 'Read the status of your own durable errand operation',
  })
  find(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.service.operation(id, request.userId);
  }
}
