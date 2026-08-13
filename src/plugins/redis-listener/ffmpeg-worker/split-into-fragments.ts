import {FastifyInstance} from "fastify";
import UnprocessedVideos from "@/lib/unprocessed-videos";
import path from "node:path";
import * as fs from 'fs';


const handleSplitIntoFragmentsJob = async (fastify: FastifyInstance, job: any): Promise<any> => {

    let source_file_name :string | undefined = undefined;
    let source_file_ext :string | undefined = undefined;
    if (job?.tmp_file_pgsql_id !== undefined) {
        const pgsql_ucvd = await fastify.pg.query(`SELECT t.fileext as tmp_file_ext, t.path_relative_to_tmp_folder AS path_relative_to_tmp_folder, t.original_filename AS original_filename, t.original_filename_extension AS original_filename_extension FROM tmp_uploaded_file AS t LEFT JOIN unconverted_videos_data AS uvd ON (uvd.source_tmp_file_id = t.id) WHERE t.id = $1 LIMIT 1;`, [job.tmp_file_pgsql_id]);
        if((pgsql_ucvd.rows.length !== 0)) {
            const unprocessedVideosInstance = UnprocessedVideos.getInstance(fastify);
            source_file_name = path.join(await unprocessedVideosInstance.getTemporaryFilesDir(), pgsql_ucvd.rows[0].path_relative_to_tmp_folder);
        }
    }else{
        source_file_name = job.src_file_path;
        source_file_ext = job.src_file_ext;
    }

    if (job.output_dir === undefined) {
        return false;
    }

    const out_dir :string = job.output_dir === undefined ? "" : job.output_dir;
    let part_files_prefix :string = job?.part_files_prefix === undefined ? "" : job.part_files_prefix;

    if (( source_file_name !== undefined ) && ( source_file_ext !== undefined )) {
        try {
            /*const splitResult = */await splitFileInNode(source_file_name, out_dir, part_files_prefix, source_file_ext);
        } catch (err) {
            return false;
        }
    }

    return true;
}



function splitFileInNode(inputFilePath: string, outputDir: string, prefix: string, fileExt: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB in bytes

        // Create a stream with a matching highWaterMark buffer constraint
        const readStream = fs.createReadStream(inputFilePath, {
            highWaterMark: CHUNK_SIZE
        });

        let chunkIndex = 0;

        readStream.on('data', (chunk: Buffer) => {
            // Pause reading momentarily while we write this chunk to the disk filesystem
            readStream.pause();

            const chunkFileName = `${prefix}${chunkIndex}${fileExt}`;
            const chunkPath = path.join(outputDir, chunkFileName);

            fs.writeFile(chunkPath, chunk, (err) => {
                if (err) {
                    readStream.destroy();
                    return reject(err);
                }

                chunkIndex++;
                // Resume the stream to fetch the next 5MB block
                readStream.resume();
            });
        });

        readStream.on('end', () => {
            resolve();
        });

        readStream.on('error', (streamErr) => {
            reject(streamErr);
        });
    });
}

export { handleSplitIntoFragmentsJob };