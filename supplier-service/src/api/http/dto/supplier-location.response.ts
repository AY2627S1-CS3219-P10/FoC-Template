import { ApiProperty } from '@nestjs/swagger';

export class SupplierLocationResponse {
  @ApiProperty({ example: '20000000-0000-4000-8000-000000000002' })
  id!: string;

  @ApiProperty({ example: 'NUS Co-op@Central Library' })
  supplierAtLocation!: string;

  @ApiProperty({ example: 'Central Library' })
  building!: string;

  @ApiProperty({ example: 1 })
  floor!: number;

  @ApiProperty({ example: 'Inside the library on the right side' })
  locationDescription!: string;

  @ApiProperty({ example: 1.2967866 })
  latitude!: number;

  @ApiProperty({ example: 103.7732677 })
  longitude!: number;

  @ApiProperty({ example: '09:00' })
  opensAt!: string;

  @ApiProperty({ example: '16:00' })
  closesAt!: string;

  @ApiProperty({ example: false })
  isOpenOvernight!: boolean;

  @ApiProperty({
    example:
      'https://github.com/CS3219-AY2627S1/FoC-Template/blob/main/data/images/NUS_COOP.jpeg',
    nullable: true,
  })
  imageUrl!: string | null;
}
