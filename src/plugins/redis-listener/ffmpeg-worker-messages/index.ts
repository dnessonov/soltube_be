import {FastifyInstance} from "fastify";

import {handleFFprobeResult} from "./ffprobe-result";
import {handleFFMakeThumbnailResult} from "@/plugins/redis-listener/ffmpeg-worker-messages/ffmpeg-make-thumbnail-result";

const handleFfmpegUpdateMsg = async (fastify: FastifyInstance, msg: any) => {

    switch (msg.type) {
        case 'ffmpeg-probe-result':
            console.log("J'ai reçu un message:", msg);
            await handleFFprobeResult(fastify, msg.job, msg.result);
            // console.dir(msg.result, { depth: null});
            break;

        case 'ffmpeg-make-thumbnail-result':
            handleFFMakeThumbnailResult(fastify, msg.job, msg.result);
            break;

        default:
            fastify.log.error(`Unknown message arrived with no type: ${msg}`);
            break;
    }
}

export { handleFfmpegUpdateMsg };
