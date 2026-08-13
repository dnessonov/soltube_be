import {type FastifyPluginAsync} from 'fastify'
import { createWriteStream } from 'node:fs';
import path from 'node:path';

import FFmpegProbeTasks from "@/lib/ffmpeg-probe-tasks/index";
import UnprocessedVideos from "@/lib/unprocessed-videos/index";

const example: FastifyPluginAsync = async (fastify, opts): Promise<void> => {

  const uv = UnprocessedVideos.getInstance(fastify);

  fastify.get('/', async function (request, reply) {
    return 'this is upload'
  })

  fastify.post('/', {
    bodyLimit: UnprocessedVideos.sizeBytesCeilings.overall_ceiling.size, // global ceiling for all user levels
    preParsing: async (request, reply, payload) => {
      const isPremium = request.isUserLevelPremium;
      const contentLength = parseInt(request.headers['content-length'] || '0', 10);

      if(!request.isCanUploadFiles) {
          reply.code(403).send({ error: 'User is not permitted to upload files ATM. Attempt the request later.' });
          request.raw.destroy();
          return reply;
      } else if(
        (!isPremium && contentLength > UnprocessedVideos.sizeBytesCeilings.basic.size)
      || (isPremium && contentLength > UnprocessedVideos.sizeBytesCeilings.premium.size) ) {
        reply.code(413).send({ error: `Upgrade to premium for large uploads. Attempted upload exceeds limit of ${UnprocessedVideos.sizeBytesCeilings.basic.size} bytes.` }).then(
            () => {
              console.log('closing connection gracefully. 1');
            },
            (error) => {
              console.log('closing connection gracefully with an error 1', error);
            }
        );

        // TODO: Handle DDoS attacks like sending large payloads when site will be live and accepting requests

        // reply.raw.destroy();
        request.raw.destroy();

        // This stops the body from being parsed further
        return reply;
      }
    },
    onRequest: async (request, reply) => {
      const authHeader = request.headers.authorization;
      if(!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Invalid/Missing authorization header' }).then(
            () => {
              console.log('closing connection gracefully. 1');
              reply.raw.destroy();
            },
            (error) => {
              console.log('closing connection gracefully with an error 1', error);
              reply.raw.destroy();
            }
        );
      }else{
        const authToken = authHeader.split('Bearer ')[1];

        // TODO: determine logic allowing user to upload and implement.
        const isPremium = authToken.includes('premium');
        const hasUploadPrivilege = authToken.includes('can_upload');

        request.isUserLevelPremium = isPremium;
        request.isCanUploadFiles = hasUploadPrivilege;

        // TODO: Handle DDoS attacks like sending large payloads when site will be live and accepting requests
      }
    }
  }, async function (request, reply) {
    console.log("upload post request received.", request.isUserLevelPremium, request.isCanUploadFiles);

    if(!request.isCanUploadFiles){
      return reply.code(403).send({error: 'Forbidden.'}).then(
          () => {
            console.log('closing connection gracefully. 1');
            reply.raw.destroy();
          },
          (error) => {
            console.log('closing connection gracefully with an error 1', error);
            reply.raw.destroy();
          }
      );
    }else{
      const data = await request.file({
          limits: {
              fileSize: UnprocessedVideos.sizeBytesCeilings.overall_ceiling.size, // override global setting set in app.ts
          }
      });

      const ALLOWED_EXTENSIONS = new Set(UnprocessedVideos.allowedExtensions);

      if (data?.file) {
        const fileExt = path.extname(path.basename(data.filename)).toLowerCase();

        if (!ALLOWED_EXTENSIONS.has(fileExt)) {
          data.file.destroy();
          return reply.code(400).send({error: `File extension ${fileExt} is not supported`}).then(
              () => {
                console.log('closing connection gracefully. 1');
                reply.raw.destroy();
              },
              (error) => {
                console.log('closing connection gracefully with an error 1', error);
                reply.raw.destroy();
              }
          );
        }else{
          const tmpFile = await uv.newTemporaryFile({
              fileName: data?.filename, // original filename
              fileExt: fileExt, // temporary file will be created with this extension
          });

          const pg_new_record_id = tmpFile.pg_record_id;
          const pg_new_record_ts = tmpFile.pg_record_created_timestamp;

          console.log('pg_new_record_id and ts:', pg_new_record_id, pg_new_record_ts);

          console.log('saving to ', tmpFile.fullPath);

          const writeFileStream = createWriteStream(tmpFile.fullPath);

          let byteCount = 0;
          let byteLimit = UnprocessedVideos.sizeBytesCeilings.basic.size;
          if(request.isUserLevelPremium) { byteLimit = UnprocessedVideos.sizeBytesCeilings.premium.size; }
          let isAborted = false;

          await new Promise<void>((resolve, reject) => {

              data?.file.on('data', (chunk) => {

                  if (isAborted) return;
                  byteCount += chunk.length;
                  if (byteCount > byteLimit) {
                      data.file.destroy();
                      if(!reply.sent) {
                          reply.code(413).send({error: 'Payload exceeded allowed threshold'}).then(
                              () => {
                                  console.log('closing connection gracefully. 1');
                                  reply.raw.destroy();
                                  reject();
                              },
                              (error) => {
                                  console.log('closing connection gracefully with an error 1', error);
                                  reply.raw.destroy();
                                  reject();
                              }
                          );
                      }else{
                          reject();
                      }
                      return;
                  }

                  writeFileStream.write(chunk);
              });

              data?.file.on('error', (err) => {
                  fastify.log.debug(`Stream severed gracefully: ${err.message}`);
                  // TODO: end writeFileStream gracefully also
                  data.file.destroy();

                  if(!reply.sent) {
                      reply.code(500).send({error: 'Error occured while processing the upload. Please attempt the request later.'}).then(
                          () => {
                              console.log('closing connection gracefully. 3');
                              reply.raw.destroy();
                              err.message += "Reply with 500 HTTP code has been sent.";
                              reject(err);
                          },
                          (error) => {
                              console.log('closing connection gracefully with an error 4', error);
                              reply.raw.destroy();
                              err.message += "Reply with 500 HTTP code was NOT sent.";
                              reject(err);
                          }
                      );
                  }else{
                      reject(err);
                  }
              });

              data?.file.on('end', async () => {
                  if (!isAborted) {
                      writeFileStream.end();
                      console.log("File written to disk completely under the limit.");

                      if(data.file.truncated){
                          reply.code(400).send({error: `Incomplete data received. Please re-attempt the upload.`});
                          request.raw.destroy();
                      }else{
                          const new_unprocessed_video = await uv.new(tmpFile);

                          if (!reply.sent) {
                              reply.code(200).send({status: 'success', not_processed_video: new_unprocessed_video.str_id});

                              const ffmpeg_probe_tasks = FFmpegProbeTasks.getInstance(fastify);

                              // create ffmpeg probe task to determine codec, length and other video file information
                              // video conversion and preparation for onchain placement will be handled after probing and further user decisions

                              /*console.log("ffmpeg job", {
                                  file_full_path: new_unprocessed_video.temp_file.fullPath,
                                  filename: new_unprocessed_video.temp_file.fileName,
                                  pgsql_tmp_file_id: new_unprocessed_video.temp_file.pg_record_id,
                                  pgsql_tmp_file_timestamp: new_unprocessed_video.temp_file.pg_record_created_timestamp,
                                  unique_not_processed_video_id: new_unprocessed_video.str_id
                              });*/

                              await ffmpeg_probe_tasks.new({
                                  file_full_path: new_unprocessed_video.temp_file.fullPath,
                                  filename: new_unprocessed_video.temp_file.fileName,
                                  pgsql_tmp_file_id: new_unprocessed_video.temp_file.pg_record_id,
                                  pgsql_tmp_file_timestamp: new_unprocessed_video.temp_file.pg_record_created_timestamp,
                                  unique_not_processed_video_id: new_unprocessed_video.str_id
                              });

                              resolve();
                          } else {
                              const error = new Error("Unable to send HTTP 200 response, please re-attempt the upload.");
                              reject(error);
                          }
                      }
                  }else{
                      const err = new Error("The request was aborted.");
                      reject(err);
                  }
              });

              data.file.resume(); // wait for the data flow to finish (and be captured into tmpFile)
          });

          return ;

        }
      }else{
        return reply.code(400).send({error: 'File supposed to be passed.'}).then(
            () => {
              console.log('closing connection gracefully. 1');
              reply.raw.destroy();
            },
            (error) => {
              console.log('closing connection gracefully with an error 1', error);
              reply.raw.destroy();
            }
        );
      }
    }
  })
}

export default example
