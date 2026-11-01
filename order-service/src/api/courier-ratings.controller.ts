import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
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
import { AuthGuard } from './auth.guard';
import { CourierRatingSummaryResponse } from './dto';

@ApiTags('courier ratings')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('api/couriers')
export class CourierRatingsController {
  constructor(private readonly service: OrderService) {}

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
