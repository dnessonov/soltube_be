import {FastifyInstance} from "fastify";
import crypto from "node:crypto";

//import UnprocessedVideo from "./single-video";
import {MultipartFile} from "@fastify/multipart";
import os from "node:os";
import path from "node:path";
import {promises as fs} from "node:fs";

export interface UnprocessedVideosNewTemporaryFileParams {
    fileExt ?:string;
    fileName :string;
}

export interface UnprocessedVideosNewTemporaryFileResult {
    fullPath: string,
    relPath: string,
    fileName: string,
    fileExt: string,

    pg_record_id: string,
    pg_record_created_timestamp: Date,
}


export default class UnprocessedVideos {

    private static __instance: UnprocessedVideos | null = null;

    public static readonly sizeBytesCeilings = {
        basic:   { size: 50*1024*1024 },
        premium: { size: 70*1024*1024 },
        overall_ceiling: { size: 80*1024*1024 }
    }

    public static readonly allowedExtensions = [
        ".mp4",
        ".mkv",
        ".avi"
    ];

    private constructor(private fastify: FastifyInstance) {}

    public static getInstance(fastifyInstance: FastifyInstance | undefined): UnprocessedVideos{
        if(UnprocessedVideos.__instance === null) {
            if(fastifyInstance === undefined) {
                throw new Error("Unable to get instance for UnprocessedVideos with no FastifyInstance passed.");
            }
            UnprocessedVideos.__instance = new UnprocessedVideos(fastifyInstance);
        }

        return UnprocessedVideos.__instance;
    }

    public generateUniqueId15(): string {
        // Define a secure, clear character set (alphanumeric, no confusing symbols)
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const length = 15;

        // Allocate random buffer bytes
        const bytes = crypto.randomBytes(length);
        let result = '';

        for (let i = 0; i < length; i++) {
            // Map each random byte down to our alphabet size space
            result += alphabet[bytes[i] % alphabet.length];
        }

        return result;
    }

    public getUploadCeilings(params :any){
        // TODO: depending on user level (guest | basic | premium) will set corresponding uploaded file max size limit
        return {
            bodyLimit: 80*1024*1024,
            contentLengthLimit: 50 * 1024 * 1024
        }
    }

    public async getTemporaryFilesDir(){
        return os.tmpdir();
    }


    public async newTemporaryFile(params :UnprocessedVideosNewTemporaryFileParams) : Promise<UnprocessedVideosNewTemporaryFileResult>{
        let fileExt = '';
        if(params?.fileExt){
            fileExt = params.fileExt.toLowerCase();
        }
        const randomName = crypto.randomBytes(16).toString('hex');
        const tmpFilename = `${randomName}${fileExt}`;
        const tmpFileFullPath = path.join(await this.getTemporaryFilesDir(), tmpFilename); // TODO: check uniqueness within filesystem

        // does fileExt matches original_filename_extension
        let originalFileExt = params?.fileName ? path.extname(path.basename(params?.fileName)).toLowerCase() : null;
        if(fileExt.substring(0,1) === ".") { fileExt = fileExt.substring(1); }
        if (originalFileExt && (originalFileExt.substring(0,1) === ".")) { originalFileExt = originalFileExt.substring(1); }

        const pgsql_result = await this.fastify.pg.query(`INSERT INTO tmp_uploaded_file (fileExt, path_relative_to_tmp_folder, original_filename, original_filename_extension) VALUES($1, $2, $3, $4) RETURNING id, created_at;`, [
            (fileExt.substring(0,1) === ".") ? fileExt.substring(1) : "",
            tmpFilename,
            params?.fileName ? params?.fileName : null,
            originalFileExt
        ]);
        this.fastify.log.debug(`Created temporary file at ${tmpFileFullPath}`);


        const pg_new_record_id = pgsql_result.rows[0].id;
        const pg_new_record_ts = pgsql_result.rows[0].created_at;

        return {
            fullPath: tmpFileFullPath,
            relPath: tmpFilename, // TODO: adjust when files will be split by folders
            fileName: tmpFilename,
            fileExt: fileExt,

            pg_record_id: pg_new_record_id,
            pg_record_created_timestamp: pg_new_record_ts,
        }
    }

    public async removeTemporaryFile(fileData : UnprocessedVideosNewTemporaryFileResult | any){
        let fullPath :string;
        if((fileData.fullPath === undefined) && (fileData.relPath)){
            fullPath = path.join(await this.getTemporaryFilesDir(), fileData.relPath);
        }else if(fileData.fullPath !== undefined){
            fullPath = fileData.fullPath;
        }else{
            return;
        }

        try {
            await fs.unlink(fullPath);
        }catch (err: any) {
            if (err.code !== 'ENOENT') {
                this.fastify.log.warn(`Failed to delete temp file ${fullPath} : ${err.message}`);
            }
        }

        if(fileData?.pg_record_id){
            await this.fastify.pg.query(`DELETE FROM tmp_files WHERE id = $1;`, [fileData?.pg_record_id]);
        }

        return;
    }

    public async new(tempFile : UnprocessedVideosNewTemporaryFileResult | any){
        let unique_id = this.generateUniqueId15(); // TODO: ensure it's unique within "unconverted_videos" table

        const pgsql_new_unprocessed_video_result = await this.fastify.pg.query(`INSERT INTO unconverted_videos (str_id, source_tmp_file_id) VALUES($1, $2) RETURNING str_id, created_at;`, [unique_id, tempFile.pg_record_id]);

        return {
            str_id: pgsql_new_unprocessed_video_result.rows[0].str_id,
            created_timestamp: pgsql_new_unprocessed_video_result.rows[0].created_at,
            temp_file: tempFile
        }
    }

    public async startUpload(fileData: MultipartFile, params: any){
        // generate new uploaded file

        fileData?.file

    }




}
