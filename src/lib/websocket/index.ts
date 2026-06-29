import {FastifyInstance} from "fastify";
import {WebSocket} from "@fastify/websocket";
import {randomUUID} from "node:crypto";

export default class SolTubeWebSocket {
    private static __instance: SolTubeWebSocket | null = null;

    public videoIdWsSubscriptions = new Map<string, Map<string,any>>();

    private constructor(private fastify: FastifyInstance) {}

    public static getInstance(fastifyInstance: FastifyInstance | undefined): SolTubeWebSocket{
        if(SolTubeWebSocket.__instance === null) {
            if(fastifyInstance === undefined) {
                throw new Error("Unable to get instance for SolTubeWebSocket with no FastifyInstance passed.");
            }
            SolTubeWebSocket.__instance = new SolTubeWebSocket(fastifyInstance);
        }

        return SolTubeWebSocket.__instance;
    }

    public async onVideoWebSocketConnected(connection: WebSocket, socket: any, videoId: string) {

        // check that videoId exists
        const pgsql_video_data = await this.fastify.pg.query(`SELECT d.*, ucv.created_at AS ucv_created_at, ucv.updated_at AS ucv_updated_at, ucv.source_tmp_file_id AS tmp_file_id FROM unconverted_videos AS ucv LEFT JOIN unconverted_videos_data AS d ON (d.source_tmp_file_id = ucv.source_tmp_file_id) WHERE ucv.str_id = $1;`, [videoId]);
        if(pgsql_video_data.rows.length === 0) {
            return null; // disconnect socket immediately
        }else{
            const connectionId = randomUUID();

            if (!this.videoIdWsSubscriptions.has(videoId)) {
                this.videoIdWsSubscriptions.set(videoId, new Map());
            }

            this.videoIdWsSubscriptions.get(videoId)!.set(connectionId, [connection,socket]);

            console.log(`videoId ${videoId} connected via WS, connection ID:.`, connectionId);

            return {
                connectionId: connectionId,
            }
        }
    }

    public async onVideoWebSocketClosed(connection: WebSocket, socket: any, onVideoWebSocketConnectedResult: any, videoId: string){
        const _videoIdWsConnections = this.videoIdWsSubscriptions.get(videoId);
        if(_videoIdWsConnections){
            _videoIdWsConnections.delete(onVideoWebSocketConnectedResult.connectionId);

            if(_videoIdWsConnections.size === 0){
                this.videoIdWsSubscriptions.delete(videoId)
            }
        }
        console.log(`videoId ${videoId} disconnected from WS, connection id ${onVideoWebSocketConnectedResult.connectionId}.`);
    }

    public async sendToAll(videoId: string, message: object){
        const list = this.videoIdWsSubscriptions.get(videoId);
        if(list !== undefined){
            for (const i of list){
                console.log(`Sending message to connection ${i[0]} (video: ${videoId})`);
                i[1][1].send(JSON.stringify(message));
            }
        }
    }
}