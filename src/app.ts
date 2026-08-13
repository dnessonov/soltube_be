import { join } from 'node:path'
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload'
import { FastifyPluginAsync, FastifyServerOptions } from 'fastify'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';
import fastifyPostgres from '@fastify/postgres';
import path from 'path';
import { JSONSchemaType } from 'ajv';
import { EnvConfig } from './types/fastify';
import fastifyEnv from '@fastify/env';
import fastifyRedis from '@fastify/redis';

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {
}

// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {
  bodyLimit: 31 * 1024 * 1024,
}

const args = process.argv.slice(2);
export const is_worker_process = (!!(process.env.IS_WORKER)) || (args.includes('--worker_process'));

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts
): Promise<void> => {
  // Place here your custom code!

  const schema: JSONSchemaType<EnvConfig> = {
    type: 'object',
    required: ['PORT', 'DATABASE_URL', 'NODE_ENV','REDIS_URL', 'VIDEO_THUMBNAILS_FOLDER','VIDEO_CONTENT_FOLDER','TEMPORARY_FOLDER'],
    properties: {
      PORT: { type: 'number', default: is_worker_process ? 3002  : 3000 },
      DATABASE_URL: { type: 'string' },
      NODE_ENV: {
        type: 'string',
        enum: ['local', 'development', 'production'],
        default: 'local'
      },
      CORS_URL: { type: 'string', nullable: true },
      REDIS_URL: { type: 'string' },
      IS_WORKER: { type: 'boolean', default: false },
      VIDEO_THUMBNAILS_FOLDER: { type: 'string' },
      VIDEO_CONTENT_FOLDER: { type: 'string' },
      TEMPORARY_FOLDER: { type: 'string' },
    }
  };


  if(is_worker_process){
    fastify.log.info(`Launching 🚀 Worker process. Worker process doesn't serve as API server, but listens to redis 'ffmpeg-work' channel and is intended to process uploaded videos with ffmpeg library and send notifications of completion back to main API server by sending a message to 'ffmpeg-updates' channel. The process must be wrapped into process manager (such as pm2 or similar) that would automatically relaunch it in case it would crash.`);
  }

  const environment = process.env.NODE_ENV || 'local';

  const options = {
    schema: schema,
    confKey: 'config', // Maps to fastify.config
    dotenv: {
      path: path.resolve(process.cwd(), `.env.${environment}`),
      debug: environment !== 'production'
    }
  };

  await fastify.register(fastifyEnv, options);

  await fastify.register(fastifyRedis, {
    url: fastify.config.REDIS_URL,
    namespace: 'data',
    closeClient: true
  });

  await fastify.register(fastifyRedis, {
    url: fastify.config.REDIS_URL,
    namespace: 'subscriber',
    closeClient: true
  });


  await fastify.register(fastifyPostgres, {
    connectionString: fastify.config.DATABASE_URL
  });

  if(!is_worker_process) {
    if (fastify.config.CORS_URL !== undefined) {
      fastify.log.info(`CORS allowed origin is set to: ${fastify.config.CORS_URL}`);

      fastify.register(cors, {
        origin: fastify.config.CORS_URL,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization'],
      });
    }

    fastify.register(formbody)
    fastify.register(multipart, {
      limits: {
        fileSize: 2 * 1024 * 1024 // general rule, however it's effectively overridden for /upload/ route
      }
    });
  }

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  // eslint-disable-next-line no-void
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts
  })



  if(!is_worker_process) {
    // This loads all plugins defined in routes
    // define your routes in one of these
    // eslint-disable-next-line no-void
    void fastify.register(AutoLoad, {
      dir: join(__dirname, 'routes'),
      options: opts
    })
  }else{

  }

}

export default app
export { app, options }
