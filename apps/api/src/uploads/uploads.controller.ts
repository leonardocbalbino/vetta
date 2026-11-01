import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { AllowAdmin, OptionalTenant } from '../access/decorators';
import {
  CreateUploadDto,
  CreateUploadResponseDto,
  MediaResponseDto,
  UploadStatusResponseDto,
} from '../common/dto';
import { CurrentPrincipal, type AppRequest, type Principal } from '../common/request';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiSecurity('bearer')
@Controller()
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /** Valida papel, plano, cota e regras do purpose e devolve a URL pré-assinada. */
  @Post('uploads')
  @OptionalTenant()
  @AllowAdmin()
  @ApiOkResponse({ type: CreateUploadResponseDto })
  create(@CurrentPrincipal() p: Principal, @Req() req: AppRequest, @Body() dto: CreateUploadDto) {
    return this.uploads.create(p, req.tenantAccess, dto);
  }

  /** Status do upload e URLs para retomar as partes que faltam. */
  @Get('uploads/:id')
  @AllowAdmin()
  @ApiOkResponse({ type: UploadStatusResponseDto })
  status(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.status(p, id);
  }

  @Post('uploads/:id/complete')
  @HttpCode(200)
  @AllowAdmin()
  @ApiOkResponse({ type: UploadStatusResponseDto })
  complete(@CurrentPrincipal() p: Principal, @Param('id', ParseUUIDPipe) id: string) {
    return this.uploads.complete(p, id);
  }

  @Get('media/:id')
  @OptionalTenant()
  @AllowAdmin()
  @ApiOkResponse({ type: MediaResponseDto })
  get(
    @CurrentPrincipal() p: Principal,
    @Req() req: AppRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.uploads.get(p, req.tenantAccess, id);
  }

  @Delete('media/:id')
  @OptionalTenant()
  @AllowAdmin()
  remove(
    @CurrentPrincipal() p: Principal,
    @Req() req: AppRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.uploads.remove(p, req.tenantAccess, id);
  }
}
