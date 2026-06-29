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

    return new Promise<any>((resolve, reject) => {
        try {
            const target_filename = generateUniqueFilename() + ".jpg";
            ffmpeg(job.tmp_file_full_path).screenshots({
                count: 1,
                timemarks: [job.take_at],
                folder: fastify.config.VIDEO_THUMBNAILS_FOLDER,
                filename: target_filename,
                size: '?x434'
            })
            .on('end', () => {
                resolve({
                    path: target_filename,
                    taken_at: job.take_at
                });
            })
            .on('error', (err: any) => {

            });
        } catch (error) {
            return reject(error);
        }
    });

}

export { handleFfmpegMakeThumbnailJob };