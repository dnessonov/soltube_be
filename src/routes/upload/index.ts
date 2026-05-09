import { type FastifyPluginAsync } from 'fastify'

const example: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/', async function (request, reply) {
    return 'this is upload'
  })

  fastify.post('/', {
    bodyLimit: 30*1024*1024
  }, async function (request, reply) {
    console.log("upload post request received.");
    return { status: 'success', message: 'this is upload' };
  })

}

export default example
