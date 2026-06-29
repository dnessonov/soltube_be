import fp from 'fastify-plugin';
import {FastifyInstance, FastifyPluginAsync} from 'fastify';
// import { videoIdWsSubscriptions } from '../routes/notifications/index';
import { is_worker_process } from '../app';

import { handleFfmpegJob } from './redis-listener/ffmpeg-worker/index';
import { handleFfmpegUpdateMsg } from './redis-listener/ffmpeg-worker-messages/index'

export const mainJobQueue = 'ffmpeg-jobs-list'; // channel, which worker process listens to, has the same name
export const mainJobProcessingQueue = 'ffmpeg-jobs-processing';
export const ffmpegUpdatesQueue = 'ffmpeg-updates-queue';

export const ffmpegNewJobNotificationChannel = 'ffmpeg-new-jobs';
export const ffmpegUpdatesChannel = 'ffmpeg-updates-channel';



const messageReadingLoop = async (
    fastify :FastifyInstance,
    messageReceived :string, // actual message read from redis channel
    channelMessageToExpect :string, // message that signifies that redis queue has something to be processed (if matches to messageReceived). It generally is a static notification message, payload is in the redis queue
    queueName :string, processingQueueName: string | undefined,
    pushResultToQueueWhenProcessed: string | undefined, pushMsgToChannelWhenProcessed: string | undefined, channelToPushSaidMsgTo: string | undefined,
    handleFunc :(fastifyArg: FastifyInstance, jsonMsg :any) => Promise<any>
) => {
    const { data } = fastify.redis;

    let is_continue_processing = (messageReceived === channelMessageToExpect);
    while(is_continue_processing){
        let rawMessage : string | null;
        if(processingQueueName === undefined) {
            rawMessage = await data.rpop(queueName);
        }else{
            rawMessage = await data.lmove(queueName,
                processingQueueName, // move to the queue that holds job, which are being processed currently
                'RIGHT', 'LEFT');
        }

        if(rawMessage){
            fastify.log.debug(`raw ${queueName} message recv: ${rawMessage}`);

            let jsonUpdateMessage = undefined;
            try {
                jsonUpdateMessage = JSON.parse(rawMessage)
            } catch (error) {
                fastify.log.error(`Received malformed message to ${queueName} channel`);
            }

            let handleFuncResult :any = undefined;

            try {
                handleFuncResult = await handleFunc(fastify, jsonUpdateMessage);
            } catch (error) {
                fastify.log.error(`Error while processing ${channelMessageToExpect}: ${error}`);
            }

            if(processingQueueName !== undefined) {
                // await handleFunc(fastify, jsonUpdateMessage);

                // and if processed successfully ...
                await data.lrem(processingQueueName, 0, rawMessage); // remove it from queue that holds jobs, which are being processed currently
            }

            if(pushResultToQueueWhenProcessed !== undefined) {
                await data.rpush(pushResultToQueueWhenProcessed, JSON.stringify({
                    type: `${jsonUpdateMessage.type}-result`,
                    job: jsonUpdateMessage,
                    result: handleFuncResult }));
                if((channelToPushSaidMsgTo !== undefined) && (pushMsgToChannelWhenProcessed !== undefined)) {
                    await data.publish(channelToPushSaidMsgTo, pushMsgToChannelWhenProcessed);
                }
            }

        }else{
            is_continue_processing = false;
        }
    }
    return;
}

const redisListenerPlugin: FastifyPluginAsync = async (fastify) => {
    const { subscriber} = fastify.redis;

    subscriber.on('message', async (channel,message) => {
        switch (channel){
            case ffmpegUpdatesChannel:
                await messageReadingLoop(
                    fastify, message,
                    'new-ffmpeg-update',
                    ffmpegUpdatesQueue,
                    undefined,undefined, undefined, undefined,
                    handleFfmpegUpdateMsg);
                break;

            case ffmpegNewJobNotificationChannel:
                await messageReadingLoop(
                    fastify, message,
                    'new_ffmpeg_work',
                    mainJobQueue,
                    mainJobProcessingQueue,
                    ffmpegUpdatesQueue,
                    'new-ffmpeg-update',
                    ffmpegUpdatesChannel,
                    handleFfmpegJob);
                break;

            default:
                fastify.log.warn(`Unhandled channel ${channel} received ${message}`);
                break;
        }
    })

    fastify.addHook('onReady', async () => {
        try {
            if(is_worker_process){

                await messageReadingLoop(
                    fastify, 'new_ffmpeg_work',
                    'new_ffmpeg_work',
                    mainJobQueue,
                    mainJobProcessingQueue,
                    ffmpegUpdatesQueue,
                    'new-ffmpeg-update',
                    ffmpegUpdatesChannel,
                    handleFfmpegJob);

                await subscriber.subscribe(ffmpegNewJobNotificationChannel);
                fastify.log.info(`Redis '${ffmpegNewJobNotificationChannel}' channel successfully subscribed.`);
            }else {

                await messageReadingLoop(
                    fastify, 'new-ffmpeg-update',
                    'new-ffmpeg-update',
                    ffmpegUpdatesQueue,
                    undefined,undefined, undefined, undefined,
                    handleFfmpegUpdateMsg);

                await subscriber.subscribe(ffmpegUpdatesChannel);
                fastify.log.info(`Redis '${ffmpegUpdatesChannel}' channel successfully subscribed.`);
            }

        } catch (err) {
            // console.log(videoIdWsSubscriptions);
            fastify.log.error({err}, '❌ Failed to subscribe to Redis channel(s):');
            if(is_worker_process){
                fastify.log.error(` - ${ffmpegNewJobNotificationChannel}`);
            }else{
                fastify.log.error(` - ${ffmpegUpdatesChannel}`);
            }
        }
    });

    fastify.addHook('onClose', async () => {
        fastify.log.info('\u{1FAF8} Server closing. Tearing down redis channel listeners...');
        await subscriber.unsubscribe('ffmpeg-updates');
        fastify.log.info('\u{1F44B} Server closing. Successfully Teared down redis channel listeners.');
    });
}


export default fp(redisListenerPlugin, {
    name: 'custom-redisListener-handler',
    dependencies: ['@fastify/redis'] // Prevents plugin from running before Redis is loaded
});
