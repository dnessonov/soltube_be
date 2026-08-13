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

    if(index_map_result !== undefined) {
        const buffer = Buffer.alloc(index_map_result.moof_index.length * 8);

        let offset = 0;
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