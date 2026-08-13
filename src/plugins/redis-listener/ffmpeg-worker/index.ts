import {FastifyInstance} from "fastify";

import { handleFfmpegProbeJob } from "./ffmpeg-probe";
import { handleFfmpegMakeThumbnailJob } from "./ffmpeg-make-thumbnail";
import {handleSplitIntoFragmentsJob} from "./split-into-fragments";
import {handleMP4BoxInfoJob} from "./mp4box-info";
import {handleConvertToFragmentedMp4Job} from "./ffmpeg-convert-add-moov-frames";

import {ffmpegNewJobNotificationChannel, mainJobQueue} from "@/plugins/redis-listener";
import {handleBuildMoofFramesFMp4FileIndex} from "./build-fmp4-moof-frames-index";


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

        case 'ffmpeg-convert-add-moov-frames':
            fastify.log.info(`Running ffmpeg -movflags frag_keyframe+empty_moov+default_base_moof on ${job.file_full_path} (unprocessed video ${job.unique_not_processed_video_id})`);
            return await handleConvertToFragmentedMp4Job(fastify, job);
            break;

        case 'mp4box-mse-codec-info':
            fastify.log.info(`Running MP4Box to get the MSE codec string for ${job.input_filename} (unprocessed video ${job?.video_data?.unique_not_processed_video_id})`);
            return await handleMP4BoxInfoJob(fastify, job);
            break;

        case 'build-fmp4-moof-frames-index':
            fastify.log.info(`Building moof frames index for ${job.input_filename} (unprocessed video ${job?.video_data?.unique_not_processed_video_id})`);
            return await handleBuildMoofFramesFMp4FileIndex(fastify, job);
            break;

        case 'split-into-fragments':
            fastify.log.info(`Splitting into parts ${job.tmp_filename} (${job.tmp_file_pgsql_id})`);
            return await handleSplitIntoFragmentsJob(fastify, job);
            break;

        default:
            fastify.log.error(`Unknown job arrived of type ${job.job_type}: ${job}`);
            return ;
            break;
    }
}

const pushJob = async (fastify: FastifyInstance, job: any) => {
    await fastify.redis.data.rpush(mainJobQueue, JSON.stringify(job));
    await fastify.redis.data.publish(ffmpegNewJobNotificationChannel, 'new_ffmpeg_work'); // redis channel named the same as queue. ok...
}

export { handleFfmpegJob, pushJob };