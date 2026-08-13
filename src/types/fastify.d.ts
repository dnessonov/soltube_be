import 'fastify';
import '@fastify/env'
import '@fastify/redis'

export interface EnvConfig {
    PORT: number;
    DATABASE_URL: string;
    NODE_ENV: 'local' | 'development' | 'production';
    CORS_URL?: string;
    REDIS_URL: string;
    IS_WORKER: boolean;
    VIDEO_THUMBNAILS_FOLDER: string;
    VIDEO_CONTENT_FOLDER: string;
    TEMPORARY_FOLDER: string;
}

declare module 'fastify' {
    interface FastifyRequest {
        isUserLevelPremium: boolean;
        isCanUploadFiles: boolean;
    }

    interface FastifyInstance {
        config: EnvConfig;
        redis: {
            data: Redis,
            subscriber: Redis
        }
    }
}
