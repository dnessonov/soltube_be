import {FastifyInstance} from "fastify";
import { exec } from 'child_process';
import { promisify } from 'util';

const handleMP4BoxInfoJob = async (fastify: FastifyInstance, job: any): Promise<any> => {
    const mp4box_cli_result = await runMp4boxCli(job.input_file_full_path);
    // save mp4box_cli_result to DB (e.g. "avc1.64001E,mp4a.40.2")
    await fastify.pg.query(`INSERT INTO unconverted_videos_convert_to_fragmented_mp4 (source_tmp_file_id, mse_codec, created_at, updated_at) VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (source_tmp_file_id) DO UPDATE SET mse_codec = EXCLUDED.mse_codec, updated_at = EXCLUDED.updated_at;`,[job.video_data.source_tmp_file_id, mp4box_cli_result]);
    return { 'mse_codec': mp4box_cli_result };
}


const runMp4boxCli = async (fileFullPath :string) => {
    const sanitizedPath = JSON.stringify(fileFullPath);

    const command = `MP4Box -info ${sanitizedPath} 2>&1 | grep RFC6381 | awk '{print $4}' | paste -sd , -`;

    const execAsync = promisify(exec);
    const { stdout, stderr } = await execAsync(command);

    if (stderr && stderr.trim().length > 0) {
        // Note: MP4Box pushes info to stderr sometimes, so only throw if the string lookup failed
        if (!stdout.trim()) {
            throw new Error(`MP4Box execution error stream feedback: ${stderr}`);
        }
    }

    return stdout.trim();
}

export {
    handleMP4BoxInfoJob,
    runMp4boxCli // TODO: do not export after testing
};