import { BadRequestException, Injectable } from '@nestjs/common';
import * as AWS from 'aws-sdk';
import { v4 as uuidV4 } from 'uuid';

@Injectable()
export class UploadService {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucketName: string;

  constructor() {
    this.accessKeyId = process.env.AWS_ACCOUNT_ID || '';
    this.secretAccessKey = process.env.AWS_ACCESS_KEY || '';
    this.bucketName = process.env.S3_BUCKET_NAME || '';
    this.region = process.env.S3_BUCKET_REGION || '';
  }

  async uploadFile(file: any) {
    try {
      AWS.config.update({
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
        region: this.region,
      });

      const s3 = new AWS.S3();
      const tempId = uuidV4();

      const params = {
        Bucket: this.bucketName,
        Key: `generalImg/${tempId}-${
          file.originalname.replace(/ /g, '_') || ''
        }`,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read',
      };

      const uploadPromise = new Promise(async (resolve, reject) => {
        await s3.upload(params, (err, data: any) => {
          if (data) resolve(data);
          else reject(err);
        });
      });
      const uploadDetails = await uploadPromise.then((val) => val);

      return {
        url: uploadDetails['Location'],
        key: uploadDetails['key'],
      };
    } catch (e) {
      console.log(e);
      throw new BadRequestException('Something bad happened');
    }
  }
}
