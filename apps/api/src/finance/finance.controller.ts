import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ConsultingPlanInputSchema,
  FinanceSettingsSchema,
  KycDocumentInputSchema,
  ManualEntryInputSchema,
  MonthQuerySchema,
  PayInvoiceSchema,
  PaymentAccountInputSchema,
  SellPlanSchema,
  WithdrawalInputSchema,
} from '@vetta/contracts';
import type { Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { AllowBlocked, Can, RequireFeature, Roles } from '../access/decorators';
import {
  CurrentTenant,
  CurrentUser,
  Meta,
  type RequestMeta,
  type TenantAccess,
  type UserPrincipal,
} from '../common/request';
import { FinanceService } from './finance.service';

class AccountDto extends createZodDto(PaymentAccountInputSchema) {}
class KycDto extends createZodDto(KycDocumentInputSchema) {}
class PlanDto extends createZodDto(ConsultingPlanInputSchema) {}
class SellDto extends createZodDto(SellPlanSchema) {}
class PayDto extends createZodDto(PayInvoiceSchema) {}
class WithdrawDto extends createZodDto(WithdrawalInputSchema) {}
class EntryDto extends createZodDto(ManualEntryInputSchema) {}
class SettingsDto extends createZodDto(FinanceSettingsSchema) {}
class MonthDto extends createZodDto(MonthQuerySchema) {}
class InvoicesQueryDto extends createZodDto(
  MonthQuerySchema.extend({
    status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELED', 'REFUNDED']).optional(),
    studentLinkId: z.uuid().optional(),
  }),
) {}
class SubsQueryDto extends createZodDto(
  z.object({
    status: z.enum(['PENDING', 'ACTIVE', 'PAUSED', 'OVERDUE', 'CANCELED', 'ENDED']).optional(),
    studentLinkId: z.uuid().optional(),
  }),
) {}

/** Financeiro do personal (M11): carteira, planos de consultoria, cobranças e painel. */
@ApiTags('finance')
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('account')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  account(@CurrentTenant() t: TenantAccess) {
    return this.finance.account(t.tenantId);
  }

  @Put('account')
  @Can('manage', 'finance')
  @RequireFeature('finance.student_billing')
  createAccount(@CurrentTenant() t: TenantAccess, @Body() dto: AccountDto) {
    return this.finance.createAccount(t, dto);
  }

  @Post('account/documents')
  @Can('manage', 'finance')
  @RequireFeature('finance.student_billing')
  addDocument(
    @CurrentTenant() t: TenantAccess,
    @CurrentUser() u: UserPrincipal,
    @Body() dto: KycDto,
  ) {
    return this.finance.addKycDocument(t, u.userId, dto);
  }

  @Get('account/requirements')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  requirements(@CurrentTenant() t: TenantAccess) {
    return this.finance.requirements(t.tenantId);
  }

  @Get('plans')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  plans(@CurrentTenant() t: TenantAccess) {
    return this.finance.plans(t.tenantId);
  }

  @Post('plans')
  @Can('create', 'finance')
  @RequireFeature('finance.student_billing')
  createPlan(@CurrentTenant() t: TenantAccess, @Body() dto: PlanDto) {
    return this.finance.createPlan(t.tenantId, dto);
  }

  @Patch('plans/:id')
  @Can('update', 'finance')
  @RequireFeature('finance.student_billing')
  updatePlan(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlanDto,
  ) {
    return this.finance.updatePlan(t.tenantId, id, dto);
  }

  @Delete('plans/:id')
  @Can('delete', 'finance')
  @RequireFeature('finance.student_billing')
  deletePlan(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.deletePlan(t.tenantId, id);
  }

  @Post('subscriptions')
  @Can('create', 'finance')
  @RequireFeature('finance.student_billing')
  sell(@CurrentTenant() t: TenantAccess, @Body() dto: SellDto, @Meta() meta: RequestMeta) {
    return this.finance.sell(t, dto, meta);
  }

  @Get('subscriptions')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  subscriptions(@CurrentTenant() t: TenantAccess, @Query() q: SubsQueryDto) {
    return this.finance.subscriptions(t.tenantId, q);
  }

  @Post('subscriptions/:id/cancel')
  @HttpCode(200)
  @Can('update', 'finance')
  @RequireFeature('finance.student_billing')
  cancel(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.cancelSubscription(t.tenantId, id);
  }

  @Get('invoices')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  invoices(@CurrentTenant() t: TenantAccess, @Query() q: InvoicesQueryDto) {
    return this.finance.invoices(t.tenantId, q);
  }

  @Get('invoices/:id')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  invoice(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.invoice(t.tenantId, id);
  }

  @Get('summary')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  summary(@CurrentTenant() t: TenantAccess, @Query() q: MonthDto) {
    return this.finance.summary(t.tenantId, q.month);
  }

  @Get('statement')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  statement(@CurrentTenant() t: TenantAccess, @Query() q: MonthDto) {
    return this.finance.statement(t.tenantId, q.month);
  }

  @Get('report')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  async report(@CurrentTenant() t: TenantAccess, @Query() q: MonthDto, @Res() res: Response) {
    const r = await this.finance.report(t.tenantId, q.month);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    res.send(r.csv);
  }

  @Post('withdrawals')
  @Can('manage', 'finance')
  @RequireFeature('finance.student_billing')
  withdraw(@CurrentTenant() t: TenantAccess, @Body() dto: WithdrawDto) {
    return this.finance.withdraw(t.tenantId, dto.amountCents);
  }

  @Get('withdrawals')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  withdrawals(@CurrentTenant() t: TenantAccess) {
    return this.finance.withdrawals(t.tenantId);
  }

  @Get('entries')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  entries(@CurrentTenant() t: TenantAccess, @Query() q: MonthDto) {
    return this.finance.entries(t.tenantId, q.month);
  }

  @Post('entries')
  @Can('create', 'finance')
  @RequireFeature('finance.student_billing')
  createEntry(@CurrentTenant() t: TenantAccess, @Body() dto: EntryDto) {
    return this.finance.createEntry(t.tenantId, dto);
  }

  @Delete('entries/:id')
  @Can('delete', 'finance')
  @RequireFeature('finance.student_billing')
  deleteEntry(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.deleteEntry(t.tenantId, id);
  }

  @Get('settings')
  @Can('read', 'finance')
  @RequireFeature('finance.student_billing')
  getSettings(@CurrentTenant() t: TenantAccess) {
    return this.finance.getSettings(t.tenantId);
  }

  @Put('settings')
  @Can('manage', 'finance')
  @RequireFeature('finance.student_billing')
  settings(@CurrentTenant() t: TenantAccess, @Body() dto: SettingsDto) {
    return this.finance.settings(t.tenantId, dto);
  }
}

/** Lado do aluno: planos, cobranças e pagamento (liberado mesmo com acesso bloqueado). */
@ApiTags('finance')
@Controller('me/finance')
@Roles('ALUNO')
export class MyFinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @Can('read', 'finance')
  @AllowBlocked()
  mine(@CurrentTenant() t: TenantAccess) {
    return this.finance.mine(t);
  }

  @Get('invoices/:id')
  @Can('read', 'finance')
  @AllowBlocked()
  invoice(@CurrentTenant() t: TenantAccess, @Param('id', ParseUUIDPipe) id: string) {
    return this.finance.invoice(
      t.tenantId,
      id,
      t.studentLinkId ?? '00000000-0000-0000-0000-000000000000',
    );
  }

  @Post('invoices/:id/pay-card')
  @HttpCode(200)
  @Can('update', 'finance')
  @AllowBlocked()
  pay(
    @CurrentTenant() t: TenantAccess,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayDto,
    @Meta() meta: RequestMeta,
  ) {
    return this.finance.payWithCard(t, id, dto, meta);
  }
}
