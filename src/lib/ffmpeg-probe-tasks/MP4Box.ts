import {FastifyInstance} from "fastify";
import {pushJob} from "@/plugins/redis-listener/ffmpeg-worker";

export interface NewMP4BoxTaskParams {
    file_full_path ?:string;
    unique_not_processed_video_id :string;
}

export class MP4BoxTasks {
    private static __instance: MP4BoxTasks | null = null;

    private constructor(private fastify: FastifyInstance) {}

    public static getInstance(fastifyInstance: FastifyInstance | undefined): MP4BoxTasks{
        if(MP4BoxTasks.__instance === null) {
            if(fastifyInstance === undefined) {
                throw new Error("Unable to get instance for FFmpegProbeTasks with no FastifyInstance passed.");
            }
            MP4BoxTasks.__instance = new MP4BoxTasks(fastifyInstance);
        }

        return MP4BoxTasks.__instance;
    }

    public async new(params: NewMP4BoxTaskParams) {
        const mp4box_job = {
            'type': 'MP4Box-info',
            'file_full_path': params?.file_full_path,
            'unique_not_processed_video_id': params?.unique_not_processed_video_id
        };

        await pushJob(this.fastify, mp4box_job);
        return true;
    }


}