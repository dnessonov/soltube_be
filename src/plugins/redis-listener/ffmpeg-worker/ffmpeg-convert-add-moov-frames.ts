import {FastifyInstance} from "fastify";
import ffmpeg from "fluent-ffmpeg";

const handleConvertToFragmentedMp4Job = async (fastify: FastifyInstance, job: any): Promise<any> => {
    const mp4box_cli_result = await convertToFragmentedMp4(job.file_full_path, job.output_file_full_path);
    await fastify.pg.query(`INSERT INTO unconverted_videos_convert_to_fragmented_mp4 (source_tmp_file_id, output_file) VALUES ($1, $2);`,[job.video_data.source_tmp_file_id, job.output_filename]);

    return { success: true, cli_result: mp4box_cli_result };
}


export function convertToFragmentedMp4(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .outputOptions([
                '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
                '-crf', '26', // optimization for quality&size

                // keyframe every 2 seconds (50 frames at 25fps)
                '-g', '500',
                '-keyint_min', '500',
            ])
            // Set the output format explicitly to mp4
            .format('mp4').videoCodec('libx264')
            .output(outputPath)

            // Handle completion events
            .on('start', (commandLine) => {
                console.log('Spawned FFmpeg with command: ' + commandLine);
            })
            .on('progress', (progress) => {
                if (progress.percent) {
                    console.log(`Processing: ${Math.round(progress.percent)}% done`);
                }
            })
            .on('end', () => {
                console.log('Fragmented MP4 processing complete!');
                resolve();
            })
            .on('error', (err, stdout, stderr) => {
                console.error('FFmpeg processing crash event:', err.message);
                console.error('FFmpeg stderr output:', stderr);
                reject(err);
            })
            // Start the execution loop
            .run();
    });
}

export {
    handleConvertToFragmentedMp4Job,
};