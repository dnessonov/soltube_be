import {FastifyInstance} from "fastify";
import SolTubeWebSocket from "@/lib/websocket";
// import {ffmpegNewJobNotificationChannel, mainJobQueue} from "@/plugins/redis-listener";

const handleFFMakeThumbnailResult = async (fastify: FastifyInstance, job: any, videoThumbResult: any) => {

    const soltubeWs = SolTubeWebSocket.getInstance(fastify);

    //const pgsql_ffmpeg_raw_data_result = await fastify.pg.query(`INSERT INTO unconverted_videos_raw_ffmpeg_probe_data (source_tmp_file_id, ffmpeg_probe_data) VALUES ($1, $2) ON CONFLICT (source_tmp_file_id) DO UPDATE SET ffmpeg_probe_data = EXCLUDED.ffmpeg_probe_data RETURNING source_tmp_file_id;`, [job.tmp_file_pgsql_id, JSON.stringify(ffprobeResult.result)]);
    //const pg_new_record_id = pgsql_ffmpeg_raw_data_result.rows[0].source_tmp_file_id;

    //const duration_ms :number = Math.floor(ffprobeResult.result?.format?.duration * 1000) || 0;
    // const pgsql_not_converted_videos_data_result = await fastify.pg.query(`INSERT INTO unconverted_videos_data (source_tmp_file_id, duration) VALUES ($1, $2) ON CONFLICT (source_tmp_file_id) DO UPDATE SET duration = EXCLUDED.duration RETURNING source_tmp_file_id;`, [job.tmp_file_pgsql_id, duration_ms]);

    soltubeWs.sendToAll(job.unique_not_processed_video_id, {event: 'thumbnail-taken', videoThumbResult});
    console.log('made thumbnail result', videoThumbResult);
}

export { handleFFMakeThumbnailResult };
