/*
 * AI Assistance Disclosure:
 * Tool: GPT-6.1 Sol.
 * Scope: AI-assisted implementation of courier ratings controller code (CourierRatingsController).
 * Author review: Validated CourierRatingsController Get handlers, parameter handling, and returned values; edited handler naming and formatting.
 */

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
