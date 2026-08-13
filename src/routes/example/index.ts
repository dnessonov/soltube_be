import { type FastifyPluginAsync } from 'fastify'
import {generateVideoIndexMap} from "@/lib/files-processing/video-indexing";
import {runMp4boxCli} from "@/plugins/redis-listener/ffmpeg-worker/mp4box-info";
import {convertToFragmentedMp4} from "@/plugins/redis-listener/ffmpeg-worker/ffmpeg-convert-add-moov-frames";
import SolTubeWebSocket from "@/lib/websocket";


const example: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
  fastify.get('/', async function (request, reply) {

    await generateVideoIndexMap(
        "/code1/learn/solana/soltube/next/soltube-www/public/data/temp/output5.mp4"
        //"/code1/learn/solana/soltube/next/soltube-www/public/data/temp/d75056d4780d045379bc63b30c8e1e09.mp4"
    );

    return 'this is an example'
  });

  fastify.get('/ffmpeg1', async function (request, reply) {
    const x = await convertToFragmentedMp4("/code1/learn/solana/soltube/next/soltube-www/public/data/temp/d75056d4780d045379bc63b30c8e1e09.mp4", "/code1/learn/solana/soltube/next/soltube-www/public/data/temp/output5.mp4");
    console.log('x=',x);
    return 'this is an example of conversion into fMP4'
  });



  fastify.get('/mp4box', async function (request, reply) {
    const x = await runMp4boxCli("/code1/learn/solana/soltube/next/soltube-www/public/data/temp/output6.mp4");
    console.log('x=',x);
    return 'this is an example'
  });


  fastify.get('/wstest', async function (request, reply) {
    const soltubeWs = SolTubeWebSocket.getInstance(fastify);
    await soltubeWs.sendToAll("Mtuvt5naduQGSZf", {event: 'duration-updated', duration: 807000});
    return 'ws msg for Mtuvt5naduQGSZf sent.'
  });


}

export default example
