import { PartialType } from '@nestjs/mapped-types';
import { CreateCookieDto } from './create-cookie.dto';

export class UpdateCookieDto extends PartialType(CreateCookieDto) {}
