import {FastifyInstance} from "fastify";
import {generateVideoIndexMap} from "@/lib/files-processing/video-indexing";
import path from "path";
import * as fs from "node:fs";

const handleBuildMoofFramesFMp4FileIndex = async (fastify: FastifyInstance, job: any): Promise<any> => {
    const index_map_result = await generateVideoIndexMap(
        job.input_file_full_path
    );

    console.log("index_map_result is", index_map_result);
    const moof_index_filename = job.output_filename_prefix + ".midx";
    const index_file_full_path = path.join(job.output_folder, moof_index_filename);
    const fmp4_tracks_filename = job.output_filename_prefix + ".tracks.json";
    const fmp4_tracks_full_path = path.join(job.output_folder, fmp4_tracks_filename);


    let video_stream_i: number = -1;
    let audio_stream_i: number = -1;

    let video_resolution_h: number = 0;
    let video_resolution_w: number = 0;
    let audio_sample_rate: number = 0;
    let audio_channels: number = 0;
    let bit_rate: number = 0;
    let duration: number = 0;


    const pgsql_result = await fastify.pg.query(`SELECT uvd.duration, uvd.video_resolution_h, uvd.video_resolution_w, uvd.audio_sample_rate, uvd.audio_channels, uvd.bit_rate, uvd.video_stream_i, uvd.audio_stream_i FROM unconverted_videos_data AS uvd WHERE uvd.source_tmp_file_id = $1;`, [job?.video_data?.source_tmp_file_id]);

    if(pgsql_result.rows.length > 0){
        video_resolution_h = pgsql_result.rows[0].video_resolution_h;
        video_resolution_w = pgsql_result.rows[0].video_resolution_w;
        audio_sample_rate = pgsql_result.rows[0].audio_sample_rate;
        audio_channels = pgsql_result.rows[0].audio_channels;
        bit_rate = pgsql_result.rows[0].bit_rate;
        video_stream_i = pgsql_result.rows[0].video_stream_i;
        audio_stream_i = pgsql_result.rows[0].audio_stream_i;
        duration = pgsql_result.rows[0].duration;
    }

    const buffer = Buffer.alloc((index_map_result === undefined ? 0 : index_map_result.moof_index.length * 8) + 19);
    let offset = 0;

    buffer.writeUInt32LE(bit_rate, offset);
    buffer.writeUInt8(video_stream_i, offset + 4);
    buffer.writeUInt8(audio_stream_i, offset + 5);
    buffer.writeUInt8(audio_channels, offset + 6);
    buffer.writeUInt32LE(audio_sample_rate, offset + 7);
    buffer.writeUInt16LE(video_resolution_h, offset + 11);
    buffer.writeUInt16LE(video_resolution_w, offset + 13); // overall header length is 15
    buffer.writeUInt32LE(duration, offset + 15);

    offset += 19;

    if(index_map_result !== undefined) {
        for (const [num1, num2] of index_map_result.moof_index) {
            buffer.writeUInt32LE(num1, offset);     // Write first u32 (Little Endian)
            buffer.writeUInt32LE(num2, offset + 4); // Write second u32
            offset += 8;
        }

        fs.writeFileSync(index_file_full_path, buffer);

        console.log("fmp4_tracks_full_path:", fmp4_tracks_full_path);
        fs.writeFileSync(fmp4_tracks_full_path, JSON.stringify(index_map_result.tracks));
    }

    return { success: true, 'moof_index_filename': moof_index_filename, 'moof_index_filename_fullpath': index_file_full_path, 'tracks_filename': fmp4_tracks_filename, 'tracks_filename_fullpath': fmp4_tracks_full_path };
}


export {
    handleBuildMoofFramesFMp4FileIndex,
};