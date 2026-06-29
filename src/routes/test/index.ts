import { type FastifyPluginAsync } from 'fastify'
import FFmpegProbeTasks from "@/lib/ffmpeg-probe-tasks/index";
import { mainJobQueue, ffmpegNewJobNotificationChannel } from "@/plugins/redis-listener";

const example: FastifyPluginAsync = async (fastify, opts): Promise<void> => {

    const ffmpeg_probe_tasks = FFmpegProbeTasks.getInstance(fastify);

    fastify.get('/case1', async function (request, reply) {

        const job_data = await ffmpeg_probe_tasks.readCompleteJobInformationFromDb({tmp_file_pgsql_id: 19});

        const ffmpeg_job = { ... job_data[1] };

        ffmpeg_job.type = 'ffmpeg-make-thumbnail';
        ffmpeg_job.job_type = 'make-thumbnail';
        ffmpeg_job.take_at = 3; // 00:03 second

        await fastify.redis.data.rpush(mainJobQueue, JSON.stringify(ffmpeg_job));
        await fastify.redis.data.publish(ffmpegNewJobNotificationChannel, 'new_ffmpeg_work'); // redis channel named the same as queue. ok...

        console.log(ffmpeg_job);


        return 'this is an case1'
    })
}

export default example
