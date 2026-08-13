import {FastifyInstance} from "fastify";

import {handleFFprobeResult} from "./ffprobe-result";
import {handleFFMakeThumbnailResult} from "./ffmpeg-make-thumbnail-result";
import {handleFFMpegConvertToFmp4Result} from "./ffmpeg-convert-add-moov-frames-result";
import {handleMp4BoxMseCodecObtainedResult} from "./mp4box-mse-codec-info-result";
import {handleMoofFramesBuildIndexResult} from "./build-fmp4-moof-frames-index-result";

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

        case 'ffmpeg-convert-add-moov-frames-result':
            handleFFMpegConvertToFmp4Result(fastify, msg.job, msg.result);
            break;

        case 'mp4box-mse-codec-info-result':
            handleMp4BoxMseCodecObtainedResult(fastify, msg.job, msg.result);
            break;

        case 'build-fmp4-moof-frames-index-result':
            handleMoofFramesBuildIndexResult(fastify, msg.job, msg.result);
            break;

        default:
            fastify.log.error(`Unknown message arrived with no type: ${msg}`);
            break;
    }
}

export { handleFfmpegUpdateMsg };
