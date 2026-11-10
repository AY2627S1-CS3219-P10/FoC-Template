// AI-assisted portions: courier review guidance (OpenAI Codex, GPT-6.1). Human review confirmed by the team, 2026-11-10. See /ai/usage-log.md.
import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrderService } from '../application/order.service';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import {
  CourierRatingSummaryResponse,
  CourierReviewOverviewResponse,
} from './dto';

@ApiTags('courier ratings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/couriers')
export class CourierRatingsController {
  constructor(private readonly service: OrderService) {}

  @Get('me/review-overview')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Your courier average rating and three newest written comments',
  })
  @ApiOkResponse({ type: CourierReviewOverviewResponse })
  @ApiUnauthorizedResponse()
  reviewOverview(@Req() request: AuthenticatedRequest) {
    return this.service.reviewOverview(request.userId);
  }

  @Get(':courierId/rating-summary')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Get a courier’s average stars and review count',
  })
  @ApiOkResponse({ type: CourierRatingSummaryResponse })
  @ApiBadRequestResponse({
    description: 'Courier ID must be a UUID v4',
  })
  @ApiUnauthorizedResponse()
  ratingSummary(
    @Param('courierId', new ParseUUIDPipe({ version: '4' }))
    courierId: string,
  ) {
    return this.service.ratingSummary(courierId);
  }
}
