import {FastifyInstance} from "fastify";
import path from "path";
import {pushJob} from "@/plugins/redis-listener/ffmpeg-worker";


const handleMp4BoxMseCodecObtainedResult = async (fastify: FastifyInstance, job: any, getMp4BoxInfoResult: any) => {

    if(!getMp4BoxInfoResult){
        console.log('Fragmented MP4 was not created due to an error:', getMp4BoxInfoResult);
        console.log('Fragmented MP4 was not created due to an error (original job):', job);
    }else{
        const output_video_folder_for_fragments = fastify.config.VIDEO_CONTENT_FOLDER;

        const parsed_filename = path.parse(job.input_filename);
        const filename_wo_ext = parsed_filename.name;
        const filename_ext = parsed_filename.ext;

        const moof_frames_index_task = {
            type: 'build-fmp4-moof-frames-index',
            input_file_full_path: job.input_file_full_path,
            input_filename: job.input_filename,
            output_folder: output_video_folder_for_fragments,

            output_filename_prefix: filename_wo_ext,
            output_filename_postfix: filename_ext,
            video_data: job?.video_data
        }
        await pushJob(fastify, moof_frames_index_task);

        const split_into_fragments_task = {
            type: 'split-into-fragments',
            input_file_full_path: job.fmp4_filename_full_path,
            input_filename: job.fmp4_filename,
            output_folder: output_video_folder_for_fragments,

            output_filename_prefix: filename_wo_ext,
            output_filename_postfix: filename_ext,
            video_data: job?.video_data
        }

        console.log('hurray!', split_into_fragments_task, getMp4BoxInfoResult);

        // await pushJob(fastify, split_into_fragments_task);
    }

}

export { handleMp4BoxMseCodecObtainedResult }