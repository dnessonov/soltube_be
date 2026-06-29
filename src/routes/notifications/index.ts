import { type FastifyPluginAsync } from 'fastify'
import websocket from "@fastify/websocket";
import {deriveWebSocketForFastifyConnection} from "@/lib/fastify-ws-patch";
import SolTubeWebSocket from "@/lib/websocket/index";

const notificationsRoutes: FastifyPluginAsync = async(fastify): Promise<void> => {
    await fastify.register(websocket, {});

    const soltubeWs = SolTubeWebSocket.getInstance(fastify);

    fastify.get('/ws/:videoId', { websocket: true }, (connection, req) => {
        const { videoId } = req.params as { videoId: string };


        const socket = deriveWebSocketForFastifyConnection(connection, fastify);
        soltubeWs.onVideoWebSocketConnected(connection, socket, videoId).then(( connectedSocketData :any ) => {

            if(connectedSocketData === null){
                console.log("Closing socket...");
                socket.close();
            }else{
                connection.on('close', () => {
                    soltubeWs.onVideoWebSocketClosed(connection, socket, connectedSocketData, videoId);
                });
            }
        });


        // socket.send(JSON.stringify({'test': 'yomama'}));



    });
}

export default notificationsRoutes;