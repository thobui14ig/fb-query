import { PartialType } from '@nestjs/mapped-types';
import { CreateVpsDto } from './create-page.dto';

export class UpdateVpsDto extends PartialType(CreateVpsDto) { }
