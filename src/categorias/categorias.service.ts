import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { PatchCategoriaDto } from './dto/patch-categoria.dto';
import { PutCategoriaDto } from './dto/put-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.categoria.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async findById(id: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id },
    });

    if (!categoria) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    return categoria;
  }

  async create(dto: CreateCategoriaDto) {
    const name = dto.name.trim();

    await this.ensureNameIsAvailable(name);

    return this.prisma.categoria.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: number, dto: PutCategoriaDto) {
    await this.ensureCategoriaExists(id);

    const name = dto.name.trim();

    await this.ensureNameIsAvailable(name, id);

    return this.prisma.categoria.update({
      where: { id },
      data: {
        name,
        description: dto.description?.trim() || null,
        active: dto.active,
      },
    });
  }

  async partialUpdate(id: number, dto: PatchCategoriaDto) {
    await this.ensureCategoriaExists(id);

    const data: {
      name?: string;
      description?: string | null;
      active?: boolean;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();

      await this.ensureNameIsAvailable(name, id);

      data.name = name;
    }

    if (dto.description !== undefined) {
      data.description = dto.description.trim() || null;
    }

    if (dto.active !== undefined) {
      data.active = dto.active;
    }

    return this.prisma.categoria.update({
      where: { id },
      data,
    });
  }

  async delete(id: number) {
    await this.ensureCategoriaExists(id);

    const productsCount = await this.prisma.produto.count({
      where: { categoryId: id },
    });

    if (productsCount > 0) {
      throw new ConflictException(
        'Não é possível excluir uma categoria vinculada a produtos.',
      );
    }

    await this.prisma.categoria.delete({
      where: { id },
    });
  }

  private async ensureCategoriaExists(id: number) {
    const categoria = await this.prisma.categoria.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!categoria) {
      throw new NotFoundException('Categoria não encontrada.');
    }
  }

  private async ensureNameIsAvailable(name: string, ignoreCategoriaId?: number) {
    const categoria = await this.prisma.categoria.findFirst({
      where: {
        name,
        NOT: ignoreCategoriaId ? { id: ignoreCategoriaId } : undefined,
      },
      select: { id: true },
    });

    if (categoria) {
      throw new ConflictException('Já existe uma categoria com esse nome.');
    }
  }
}