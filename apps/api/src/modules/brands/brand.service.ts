import type { BrandProfileInput } from '@automarket/shared';
import { BaseCrudService } from '../../core/service/base.service.js';
import type { WorkspaceContext } from '../../core/http/types.js';
import type { Brand } from '../../generated/prisma/client.js';
import { usageService } from '../usage/usage.service.js';
import { brandRepository, type BrandRepository } from './brand.repository.js';

export class BrandService extends BaseCrudService<
  Brand,
  BrandProfileInput,
  Partial<BrandProfileInput>,
  BrandRepository
> {
  protected override searchFields = ['name', 'niche', 'industry'];

  protected override async beforeCreate(ws: WorkspaceContext) {
    usageService.assertWithinLimit(ws, 'brands', await this.repo.count(ws.id), 1, 'brands');
  }

  protected override toCreateData(input: BrandProfileInput) {
    return { ...input, website: input.website || null };
  }
}

export const brandService = new BrandService(brandRepository);
