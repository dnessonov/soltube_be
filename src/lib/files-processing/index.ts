import {FastifyInstance} from "fastify";
import * as console from "node:console";

export default class FilesProcessing {
    private static __instance: FilesProcessing | null = null;

    private constructor(private fastify: FastifyInstance) {}

    public static getInstance(fastifyInstance: FastifyInstance | undefined): FilesProcessing{
        if(FilesProcessing.__instance === null) {
            if(fastifyInstance === undefined) {
                throw new Error("Unable to get instance for UnprocessedVideos with no FastifyInstance passed.");
            }
            FilesProcessing.__instance = new FilesProcessing(fastifyInstance);
        }

        return FilesProcessing.__instance;
    }

    public async isOkWithoutProcessing(params: any){
        console.log(this.fastify);
    }



}