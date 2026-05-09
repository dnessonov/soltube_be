import { join } from 'node:path'
import AutoLoad, { AutoloadPluginOptions } from '@fastify/autoload'
import { FastifyPluginAsync, FastifyServerOptions } from 'fastify'
import cors from '@fastify/cors'
import formbody from '@fastify/formbody';
import multipart from '@fastify/multipart';

export interface AppOptions extends FastifyServerOptions, Partial<AutoloadPluginOptions> {
}

// Pass --options via CLI arguments in command to enable these options.
const options: AppOptions = {
  bodyLimit: 31 * 1024 * 1024,
}

const app: FastifyPluginAsync<AppOptions> = async (
  fastify,
  opts
): Promise<void> => {
  // Place here your custom code!

  fastify.register(cors, {
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  fastify.register(formbody)
  fastify.register(multipart, {
    limits: {
      fileSize: 30 * 1024 * 1024
    }
  })

  /*fastify.addContentTypeParser(
      // 'application/x-www-form-urlencoded',
      //'multipart/form-data',
      'application/x-www-form-urlencoded',

      { parseAs: 'string' },
      fastify.getDefaultJsonParser('ignore', 'ignore') // or use your formbody logic
  );*/

  // Do not touch the following lines

  // This loads all plugins defined in plugins
  // those should be support plugins that are reused
  // through your application
  // eslint-disable-next-line no-void
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'plugins'),
    options: opts
  })



  // This loads all plugins defined in routes
  // define your routes in one of these
  // eslint-disable-next-line no-void
  void fastify.register(AutoLoad, {
    dir: join(__dirname, 'routes'),
    options: opts
  })

}

export default app
export { app, options }
