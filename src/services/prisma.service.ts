import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      // Add connection timeout
      const connectionPromise = this.$connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database connection timeout')), 10000)
      );
      
      await Promise.race([connectionPromise, timeoutPromise]);
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to database:', error.message);
      this.logger.error('Please check your DATABASE_URL environment variable');
      // Don't throw - let the app start but log the error
      // The connection will be retried on first query
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}