import {FastifyInstance} from "fastify";
import path from 'node:path';
import UnprocessedVideos from "@/lib/unprocessed-videos/index";
import {pushJob} from "@/plugins/redis-listener/ffmpeg-worker";

export default class FFmpegProbeTasks {

    public static readonly ERROR_NOT_FINDABLE = 2;
    public static readonly ERROR_NOT_FOUND = 3;
    public static readonly RESULT_OK = 1;
    public static readonly RESULT_SUCCESS = FFmpegProbeTasks.RESULT_OK;

    private static __instance: FFmpegProbeTasks | null = null;

    private constructor(private fastify: FastifyInstance) {}

    public static getInstance(fastifyInstance: FastifyInstance | undefined): FFmpegProbeTasks{
        if(FFmpegProbeTasks.__instance === null) {
            if(fastifyInstance === undefined) {
                throw new Error("Unable to get instance for FFmpegProbeTasks with no FastifyInstance passed.");
            }
            FFmpegProbeTasks.__instance = new FFmpegProbeTasks(fastifyInstance);
        }

        return FFmpegProbeTasks.__instance;
    }

    public async new(params: any = {}) {
        const ffmpeg_job = {
            'type': 'ffmpeg-probe',
            'job_type': 'probe',
            'tmp_file_full_path': params?.file_full_path,
            'tmp_filename': params?.filename,
            'tmp_file_pgsql_id': params?.pgsql_tmp_file_id,
            'tmp_file_created_ts': params?.pgsql_tmp_file_timestamp,
            'unique_not_processed_video_id': params?.unique_not_processed_video_id
        };

        await pushJob(this.fastify, ffmpeg_job);
        return true;
    }

    public async readCompleteJobInformationFromDb(knownParams: any): Promise<[number, any]> {
        let derivedParams = { ...knownParams };

        const uv = UnprocessedVideos.getInstance(this.fastify);

        const sql_part1 = "SELECT t.id AS tmp_file_pgsql_id, t.path_relative_to_tmp_folder AS path_relative_to_tmp_folder, t.fileExt AS fileExt, t.original_filename AS original_filename, t.original_filename_extension AS original_file_ext, t.created_at AS tmp_file_created_ts, uv.str_id AS not_processed_video_id FROM tmp_uploaded_file AS t INNER JOIN unconverted_videos AS uv ON (uv.source_tmp_file_id = t.id) WHERE ";

        if(knownParams.tmp_file_full_path === undefined){

            let pgsql_result = undefined;

            if(knownParams.tmp_file_pgsql_id === undefined){
                if(knownParams.unique_not_processed_video_id === undefined){
                    // no input file specified and can't be derived
                    return [FFmpegProbeTasks.ERROR_NOT_FINDABLE, {}];
                }else{
                    pgsql_result = await this.fastify.pg.query(`${sql_part1} uv.str_id = $1 LIMIT 1;`, [knownParams.unique_not_processed_video_id]);
                }
            }else{
                pgsql_result = await this.fastify.pg.query(`${sql_part1} t.id = $1 LIMIT 1;`, [knownParams.tmp_file_pgsql_id]);
            }

            if(pgsql_result.rows.length > 0){
                if(derivedParams.job_type === undefined) { derivedParams.job_type = 'probe'; }
                derivedParams.tmp_file_rel_path = pgsql_result.rows[0].path_relative_to_tmp_folder;
                derivedParams.tmp_filename = path.basename(derivedParams.tmp_file_rel_path);
                derivedParams.tmp_file_full_path = path.join(await uv.getTemporaryFilesDir(), derivedParams.tmp_file_rel_path);
                derivedParams.tmp_file_pgsql_id = pgsql_result.rows[0].tmp_file_pgsql_id;
                derivedParams.tmp_file_created_ts = pgsql_result.rows[0].tmp_file_created_ts;
                derivedParams.unique_not_processed_video_id = pgsql_result.rows[0].not_processed_video_id;
                derivedParams.original_filename = pgsql_result.rows[0].original_filename;

                return [FFmpegProbeTasks.RESULT_SUCCESS, derivedParams];
            }else{
                return [FFmpegProbeTasks.ERROR_NOT_FOUND, {}];
            }
        }else{
            return [FFmpegProbeTasks.RESULT_OK, derivedParams];
        }
    }
}
