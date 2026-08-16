import {FastifyInstance} from "fastify";
import ffmpeg from "fluent-ffmpeg";

const handleConvertToFragmentedMp4Job = async (fastify: FastifyInstance, job: any): Promise<any> => {

    let downmixToAudioChannels :number | null = null;
    let preferAudioLanguage :string | null | undefined = null;
    console.log('querying db data for ', job?.video_data?.source_tmp_file_id);
    const video_data = await fastify.pg.query(`SELECT uvd.audio_channels AS audio_channels, uvd.audio_stream_i AS audio_stream_i, ffprobe_data.ffmpeg_probe_data AS ffmpeg_probe_data FROM unconverted_videos_data AS uvd LEFT JOIN unconverted_videos_raw_ffmpeg_probe_data AS ffprobe_data ON (ffprobe_data.source_tmp_file_id = uvd.source_tmp_file_id) WHERE uvd.source_tmp_file_id = $1 LIMIT 1;`,[job?.video_data?.source_tmp_file_id]);
    if(video_data.rows.length > 0) {

        console.log('db data for ', job.source_tmp_file_id, video_data.rows);
        if(video_data.rows[0].audio_channels > 2){
            downmixToAudioChannels = 2;
        }

        let _ffmpeg_probe_data :any = null;
        try {
            _ffmpeg_probe_data = JSON.parse(video_data.rows[0].ffmpeg_probe_data);
        } catch (err: any){
            console.log(`Unable to parse ffmpeg_probe_data video stream: ${err}`);
        }

        if(_ffmpeg_probe_data){
            let _audio_channel = _ffmpeg_probe_data?.streams?.[video_data.rows[0].audio_stream_i];
            if(_audio_channel){
                preferAudioLanguage = _audio_channel?.tags?.language;
                if(preferAudioLanguage === undefined) { preferAudioLanguage = null; }
            }
        }
    }

    const mp4box_cli_result = await convertToFragmentedMp4(job.file_full_path, job.output_file_full_path, downmixToAudioChannels, preferAudioLanguage);
    await fastify.pg.query(`INSERT INTO unconverted_videos_convert_to_fragmented_mp4 (source_tmp_file_id, output_file) VALUES ($1, $2);`,[job.video_data.source_tmp_file_id, job.output_filename]);

    return { success: true, cli_result: mp4box_cli_result };
}


export function convertToFragmentedMp4(inputPath: string, outputPath: string, downmixToAudioChannels: number | null, preferAudioLanguage :string | null): Promise<void> {
    return new Promise((resolve, reject) => {

        let ffmpegCommandOptions = [
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
            '-crf', '26', // optimization for quality&size

            // keyframe every 2 seconds (50 frames at 25fps)
            '-g', '500',
            '-keyint_min', '500',
        ];

        if(preferAudioLanguage !== null){
            ffmpegCommandOptions.push('-map');
            ffmpegCommandOptions.push(`0:v:0`); // TODO: this may cause issues if video stream index in original file is other than 0

            ffmpegCommandOptions.push('-map');
            ffmpegCommandOptions.push(`0:a:m:language:${preferAudioLanguage}?`); // prefer english audio track
        }

        let ffmpegCommand = ffmpeg(inputPath)
            .outputOptions(ffmpegCommandOptions)
            // Set the output format explicitly to mp4
            .format('mp4').videoCodec('libx264');

        if(downmixToAudioChannels !== null){
            console.log(`Downmixing to ${downmixToAudioChannels} audio channels.`);
            ffmpegCommand = ffmpegCommand.audioChannels(downmixToAudioChannels);
        }else{
            console.log(`Not downmixing to ${downmixToAudioChannels} audio channels.`);
        }

        ffmpegCommand.output(outputPath)

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