import type { BrandProfileInput } from '@automarket/shared';
import { CrudController } from '../../core/http/base.controller.js';
import type { Brand } from '../../generated/prisma/client.js';
import { brandService } from './brand.service.js';

class BrandController extends CrudController<
  Brand,
  BrandProfileInput,
  Partial<BrandProfileInput>
> {}

export const brandController = new BrandController(brandService);
