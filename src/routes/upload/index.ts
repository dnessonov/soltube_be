import {type FastifyPluginAsync} from 'fastify'
import { createWriteStream } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

import FFmpegProbeTasks from "@/lib/ffmpeg-probe-tasks/index";
import UnprocessedVideos from "@/lib/unprocessed-videos/index";

// used to generate unique id for a not converted yet video
function generateUniqueId15(): string {
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

      if(!isPremium && contentLength > UnprocessedVideos.sizeBytesCeilings.basic.size) {
        console.log("preParsing condition occured.");
        reply.code(413).send({ error: `Upgrade to premium for large uploads. Attempted upload exceeds limit of ${UnprocessedVideos.sizeBytesCeilings.basic.size} bytes.` }).then(
            () => {
              console.log('closing connection gracefully. 1');
              reply.raw.destroy();
            },
            (error) => {
              console.log('closing connection gracefully with an error 1', error);
              reply.raw.destroy();
            }
        );
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
          let isSuccessfullyPipelined = false;

          const tmpFile = await uv.newTemporaryFile({
              fileName: data?.filename, // original filename
              fileExt: fileExt, // temporary file will be created with this extension
          });

          const pg_new_record_id = tmpFile.pg_record_id;
          const pg_new_record_ts = tmpFile.pg_record_created_timestamp;

          console.log('pg_new_record_id and ts:', pg_new_record_id, pg_new_record_ts);

          try {
            console.log('saving to ', tmpFile.fullPath);
            // await pipeline(data.file, );

              const writeFileStream = createWriteStream(tmpFile.fullPath);

              let byteCount = 0;
              const byteLimit = UnprocessedVideos.sizeBytesCeilings.basic.size; // TODO: using basic ceiling, could also use premium under corresponding circumstances
              let isAborted = false;

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
                              },
                              (error) => {
                                  console.log('closing connection gracefully with an error 1', error);
                                  reply.raw.destroy();
                              }
                          );
                      }
                      return;
                  }

                  writeFileStream.write(chunk);
              });

              data?.file.on('error', (err) => {
                  fastify.log.debug(`Stream severed gracefully: ${err.message}`);
                  // TODO: end writeFileStream gracefully also
              });

              data?.file.on('end', () => {
                  if (!isAborted) {
                      writeFileStream.end();
                      console.log("File written to disk completely under the limit.");
                  }
              });

            isSuccessfullyPipelined = true;
          } catch (err) {
            let finalReply: any = undefined;
            if (!reply.sent) {
              console.log("function body condition occured.");
              data.file.destroy();

              finalReply = reply.code(413).send({error: 'Error occured while processing the upload. Payload likely exceeded allowed threshold.'}).then(
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
            await uv.removeTemporaryFile(tmpFile);
            return finalReply;
          }

          if(!isSuccessfullyPipelined){
            await uv.removeTemporaryFile(tmpFile);

            if(!reply.sent) {
              return reply.code(500).send({error: 'Error occured while processing the upload. Payload likely exceeded allowed threshold.'}).then(
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
          }else{

            await data.file.resume(); // TODO: what's the effect? However it works with this line.

            // add to list of non-processed videos, generate unique id for that
            const unique_not_processed_video_id = generateUniqueId15();
            let pgsql_new_not_processed_video_result: any = undefined;
            try {
                pgsql_new_not_processed_video_result = await fastify.pg.query(`INSERT INTO not_converted_videos (str_id, source_tmp_file_id) VALUES($1, $2) RETURNING str_id, created_at;`, [unique_not_processed_video_id, pg_new_record_id]);
            } catch (err: any) {
                pgsql_new_not_processed_video_result = null;
            }

            if (!pgsql_new_not_processed_video_result) {
                await uv.removeTemporaryFile(tmpFile);
                if(!reply.sent) {
                    return reply.code(500).send({error: 'Internal error occured while processing the upload: Unable to generate unique ID for the not processed upload.'});
                }
            }else{

                const ffmpeg_probe_tasks = FFmpegProbeTasks.getInstance(fastify);

                // create ffmpeg probe task to determine codec, length and other video file information
                // video conversion and preparation for onchain placement will be handled after probing and further user decisions
                await ffmpeg_probe_tasks.new({
                    file_full_path: tmpFile.fullPath,
                    filename: tmpFile.fileName,
                    pgsql_tmp_file_id: tmpFile.pg_record_id,
                    pgsql_tmp_file_timestamp: tmpFile.pg_record_created_timestamp,
                    unique_not_processed_video_id: unique_not_processed_video_id
                });

                return {status: 'success', not_processed_video: unique_not_processed_video_id};
            }
          }
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
