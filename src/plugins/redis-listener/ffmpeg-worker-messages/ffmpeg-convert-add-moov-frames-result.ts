import {FastifyInstance} from "fastify";
//import path from "path";
import {pushJob} from "@/plugins/redis-listener/ffmpeg-worker";

const handleFFMpegConvertToFmp4Result = async (fastify: FastifyInstance, job: any, createFMp4Result: any) => {

    if(!createFMp4Result){
        console.log('Fragmented MP4 was not created due to an error:', createFMp4Result);
        console.log('Fragmented MP4 was not created due to an error (original job):', job);
    }else{
        const mp4box_info_task = {
            type: 'mp4box-mse-codec-info',
            input_file_full_path: job.output_file_full_path,
            input_filename: job.output_filename,

            fmp4_filename: job.output_filename,
            fmp4_filename_full_path: job.output_file_full_path,

            video_data: job?.video_data
        }

        await pushJob(fastify, mp4box_info_task);

/*
        const output_video_folder_for_fragments = fastify.config.VIDEO_CONTENT_FOLDER;

        const parsed_filename = path.parse(job.output_filename);
        const filename_wo_ext = parsed_filename.name;
        const filename_ext = parsed_filename.ext;


        const split_into_fragments_task = {
            type: 'split-into-fragments',
            input_file_full_path: job.output_file_full_path,
            input_filename: job.output_filename,
            output_folder: output_video_folder_for_fragments,

            output_filename_prefix: filename_wo_ext,
            output_filename_postfix: filename_ext,
        }

        await pushJob(fastify, split_into_fragments_task); */
    }

}

export { handleFFMpegConvertToFmp4Result }