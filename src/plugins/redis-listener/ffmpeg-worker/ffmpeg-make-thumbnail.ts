import {FastifyInstance} from "fastify";
import ffmpeg from "fluent-ffmpeg";
import crypto from "node:crypto";

function generateUniqueFilename(): string {
    // Define a secure, clear character set (alphanumeric, no confusing symbols)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const length = 23;

    // Allocate random buffer bytes
    const bytes = crypto.randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
        // Map each random byte down to our alphabet size space
        result += alphabet[bytes[i] % alphabet.length];
    }

    return result;
}

const handleFfmpegMakeThumbnailJob = async (fastify: FastifyInstance, job: any): Promise<any> => {
    let target_filename :string;

    const pgsql_ucvd = await fastify.pg.query(`SELECT uvd.thumb_img AS thumb_img, uvd.duration AS duration, uv.str_id AS std_id, uv.source_tmp_file_id AS source_tmp_file_id FROM unconverted_videos_data AS uvd INNER JOIN unconverted_videos AS uv ON (uv.source_tmp_file_id = uvd.source_tmp_file_id) WHERE uvd.source_tmp_file_id = $1 LIMIT 1;`, [job.tmp_file_pgsql_id]);
    if((pgsql_ucvd.rows.length === 0) || (pgsql_ucvd.rows[0].thumb_img === null)) {
        target_filename = generateUniqueFilename() + ".jpg";
    }else{
        target_filename = pgsql_ucvd.rows[0].thumb_img;
    }

    return new Promise<any>((resolve, reject) => {
        try {
            ffmpeg(job.tmp_file_full_path).screenshots({
                count: 1,
                timemarks: [job.take_at],
                folder: fastify.config.VIDEO_THUMBNAILS_FOLDER,
                filename: target_filename,
                size: '?x434'
            })
            .on('end', () => {

                const resolve_params = {
                    path: target_filename,
                    taken_at: job.take_at,
                    video_data: { source_tmp_file_id: job.tmp_file_pgsql_id, unique_not_processed_video_id: job?.unique_not_processed_video_id, tmp_filename: job?.tmp_filename, tmp_file_full_path: job?.tmp_file_full_path }
                };

                if((pgsql_ucvd.rows.length === 0) || (pgsql_ucvd.rows[0].thumb_img === null)) {
                    fastify.pg.query(`INSERT INTO unconverted_videos_data (source_tmp_file_id, thumb_img) VALUES ($1, $2) ON CONFLICT (source_tmp_file_id) DO UPDATE SET thumb_img = EXCLUDED.thumb_img;`, [job.tmp_file_pgsql_id, target_filename]).then((result :any) => {
                        resolve(resolve_params);
                    });
                }else{
                    resolve(resolve_params);
                }
            })
            .on('error', (err: any) => {

            });
        } catch (error) {
            return reject(error);
        }
    });
}

export { handleFfmpegMakeThumbnailJob };