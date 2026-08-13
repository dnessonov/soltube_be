import {FastifyInstance} from "fastify";
import {pushJob} from "@/plugins/redis-listener/ffmpeg-worker";
import SolTubeWebSocket from "@/lib/websocket/index";

const handleFFprobeResult = async (fastify: FastifyInstance, job: any, ffprobeResult: any) => {

    const pgsql_ffmpeg_raw_data_result = await fastify.pg.query(`INSERT INTO unconverted_videos_raw_ffmpeg_probe_data (source_tmp_file_id, ffmpeg_probe_data) VALUES ($1, $2) ON CONFLICT (source_tmp_file_id) DO UPDATE SET ffmpeg_probe_data = EXCLUDED.ffmpeg_probe_data RETURNING source_tmp_file_id;`, [job.tmp_file_pgsql_id, JSON.stringify(ffprobeResult.result)]);
    const pg_new_record_id = pgsql_ffmpeg_raw_data_result.rows[0].source_tmp_file_id;

    const duration_ms :number = Math.floor(ffprobeResult.result?.format?.duration * 1000) || 0;
    const pgsql_not_converted_videos_data_result = await fastify.pg.query(`INSERT INTO unconverted_videos_data (source_tmp_file_id, duration) VALUES ($1, $2) ON CONFLICT (source_tmp_file_id) DO UPDATE SET duration = EXCLUDED.duration RETURNING source_tmp_file_id;`, [job.tmp_file_pgsql_id, duration_ms]);

    const stream_to_get_desc_from = ffprobeResult.result.streams?.[0];
    if(stream_to_get_desc_from){
        console.log('stream_tags', stream_to_get_desc_from?.tags?.handler_name, stream_to_get_desc_from?.tags);

        const soltubeWs = SolTubeWebSocket.getInstance(fastify);

        const _recommended_description = stream_to_get_desc_from?.tags?.handler_name;
        console.log("_recommended_description", _recommended_description);
        if(_recommended_description) {
            await fastify.pg.query(`UPDATE unconverted_videos SET description = $1 WHERE source_tmp_file_id = $2;`,[_recommended_description, job.tmp_file_pgsql_id]);

            await soltubeWs.sendToAll(job.unique_not_processed_video_id, { event: 'recommended-description', value: _recommended_description.trim()});
            console.log("sending via socket", job.unique_not_processed_video_id, { event: 'recommended-description', value: _recommended_description.trim()} );
        }
    }

    if(duration_ms > 0){

        // notify that duration is obtained via connected WS
        const soltubeWs = SolTubeWebSocket.getInstance(fastify);
        await soltubeWs.sendToAll(job?.unique_not_processed_video_id, {event: 'duration-updated', duration: duration_ms});
        console.log('sending duration via ws', job?.unique_not_processed_video_id, {duration: duration_ms});


        // pick audio and video stream from the probed file

        let _default_video_stream_index = null;
        let _default_audio_stream_index = null;

        if(ffprobeResult.result?.streams.length > 0){
            for(const streamElem of ffprobeResult.result.streams){
                switch (streamElem?.codec_type){
                    case "video":
                        if(_default_video_stream_index === null){ _default_video_stream_index = streamElem?.index; }
                        break;
                    case "audio":
                        if(_default_audio_stream_index === null){ _default_audio_stream_index = streamElem?.index; }
                        break;
                    default:
                        break;
                }
                if(_default_video_stream_index && _default_audio_stream_index) { break; }
            }

            await fastify.pg.query(`UPDATE unconverted_videos_data SET video_stream_i = $2, audio_stream_i = $3 WHERE source_tmp_file_id = $1;`, [job.tmp_file_pgsql_id, _default_video_stream_index, _default_audio_stream_index]);
        }

        if(_default_video_stream_index !== null){
            // schedule thumbnail creation (random frame)

            const ffmpeg_job = {
                'type': 'ffmpeg-make-thumbnail',
                'job_type': 'make-thumbnail',
                'tmp_file_full_path': job?.tmp_file_full_path,
                'tmp_filename': job?.tmp_filename,
                'tmp_file_pgsql_id': job.tmp_file_pgsql_id,
                'tmp_file_created_ts': job?.tmp_file_created_ts,
                'unique_not_processed_video_id': job?.unique_not_processed_video_id,
                'take_at': Math.floor(Math.floor(ffprobeResult.result?.format?.duration) * Math.random())
            };

            await pushJob(fastify, ffmpeg_job);
        }else{
            // it's an audio file, it seems
            // TODO: process audio file
        }



        // TODO: schedule video conversion to proper format and splitting into parts of 5Mb

        // TODO: what to display in the UI at Step1? Duration and thumbnail
    }


    if(pg_new_record_id && pgsql_not_converted_videos_data_result){
        // all is ok
    }

}

export { handleFFprobeResult };
