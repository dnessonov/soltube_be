import {FastifyInstance} from "fastify";

import { handleFfmpegProbeJob } from "./ffmpeg-probe";
import { handleFfmpegMakeThumbnailJob } from "./ffmpeg-make-thumbnail";

const handleFfmpegJob = async (fastify: FastifyInstance, job: any) => {
    switch (job.type) {
        case 'ffmpeg-probe':
            fastify.log.info(`FFmpeg-Probing ${job.tmp_filename} (${job.tmp_file_pgsql_id})`);
            return await handleFfmpegProbeJob(fastify, job);
            break;

        case 'ffmpeg-make-thumbnail':
            fastify.log.info(`Making thumbnail for ${job.tmp_filename} (${job.tmp_file_pgsql_id})`);
            return await handleFfmpegMakeThumbnailJob(fastify, job);
            break;

        default:
            fastify.log.error(`Unknown job arrived of type ${job.job_type}: ${job}`);
            return ;
            break;
    }
}

export { handleFfmpegJob };