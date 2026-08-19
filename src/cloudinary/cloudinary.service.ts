import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import type { Express } from 'express';

@Injectable()
export class CloudinaryService {
  constructor(private readonly configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.getOrThrow<string>(
        'CLOUDINARY_CLOUD_NAME',
      ),
      api_key: this.configService.getOrThrow<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.getOrThrow<string>(
        'CLOUDINARY_API_SECRET',
      ),
      secure: true,
    });
  }

  uploadImage(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'mel-api/produtos',
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            reject(
              new InternalServerErrorException(
                'Não foi possível enviar a imagem.',
              ),
            );

            return;
          }

          if (!result) {
            reject(
              new InternalServerErrorException(
                'A Cloudinary não retornou os dados da imagem.',
              ),
            );

            return;
          }

          resolve(result);
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
      });
    } catch {
      throw new InternalServerErrorException(
        'Não foi possível remover a imagem.',
      );
    }
  }
}
