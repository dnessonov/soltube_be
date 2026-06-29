import {FastifyInstance} from "fastify";
import ffmpeg, {FfprobeData} from "fluent-ffmpeg";
import FFmpegProbeTasks from "@/lib/ffmpeg-probe-tasks/index";

const handleFfmpegProbeJob = async (fastify: FastifyInstance, job: any): Promise<any> => {

    const ffmpeg_probe_tasks = FFmpegProbeTasks.getInstance(fastify);

    let [resultCode, realJob] = await ffmpeg_probe_tasks.readCompleteJobInformationFromDb(job);

    if(resultCode === FFmpegProbeTasks.RESULT_SUCCESS) {
        return new Promise<any>((resolve, reject) => {
            try {
                ffmpeg.ffprobe(realJob.tmp_file_full_path, (err: any, data: FfprobeData) => {
                    if (err) {
                        console.error('ffprobe error', err);
                        return reject(err);
                    }
                    const result = {
                        'type': 'ffprobe',
                        'job': realJob,
                        'result': data
                    }
                    return resolve(result);
                });
            } catch (error) {
                return reject(error);
            }
        });
    }else{
        fastify.log.warn(`Unable to determine source file for ffprobing. Job data: ${job}, whereas resolved from DB ${realJob}.`);
        return null; // unable to determine which file to ffprobe
    }
}

export { handleFfmpegProbeJob };