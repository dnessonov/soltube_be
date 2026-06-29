import { type FastifyPluginAsync } from 'fastify'
import { VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';


const signinroute: FastifyPluginAsync = async (fastify, opts): Promise<void> => {
    fastify.get('/', async function (request, reply) {
        return 'this is signin'
    })

    fastify.post('/', async function (request, reply) {

        if(!request.isMultipart()){
            return reply.code(400).send({ error: 'invalid request. expected Multipart/FormData.' });
        }else{
            const requestParts = request.parts();

            let transactionStrValue = '';

            for await (const part of requestParts) {
                if (part.type === 'field' && part.fieldname === 'signedTransaction') {
                    transactionStrValue = part.value as string;
                    break; // We found our target base64 payload, stop looping
                }
            }

            console.log("received transaction payload: ", transactionStrValue);


            // Deserialize the raw payload
            const transactionBytes = Buffer.from(transactionStrValue, 'base64');
            const versionedTx = VersionedTransaction.deserialize(transactionBytes);

            // Extract signed elements
            const messageBytes = versionedTx.message.serialize();
            const signatures = versionedTx.signatures;
            const accountKeys = versionedTx.message.staticAccountKeys;


            const TARGET_PROGRAM_ID = "FviQDovpzu6wRh9xeZESmVbMkNH6f6Tpn8QbAkLGw1um";

            let extractedMessage = null;
            for (const compiledIx of versionedTx.message.compiledInstructions) {
                // Look up the program's public key using its index point
                const programIdIndex = compiledIx.programIdIndex;
                const programPublicKey = accountKeys[programIdIndex].toBase58();

                // Verify if this specific instruction targets your custom program
                if (programPublicKey === TARGET_PROGRAM_ID) {
                    // compiledIx.data is a Uint8Array containing precisely your instruction bytes
                    const rawInstructionData = compiledIx.data;

                    // If you sent an Anchor program instruction, the first 8 bytes are the function discriminator hash.
                    // If you sent a plain string encoder without a function discriminator, slice from 0.
                    const IS_ANCHOR = false; // Set to true if you added an 8-byte function hash earlier
                    const dataOffset = IS_ANCHOR ? 8 : 0;

                    const messageBytes = rawInstructionData.slice(dataOffset);

                    // Convert the clean sliced byte subarray into your human-readable string
                    extractedMessage = Buffer.from(messageBytes).toString('utf8');
                    break;
                }
            }

            // Loop and verify the first signature (the fee-payer / main signer)
            const isValid = nacl.sign.detached.verify(
                messageBytes,
                signatures[0],
                accountKeys[0].toBytes()
            );

            console.log("Account[0]", accountKeys[0].toString());
            console.log("Signature[0]", signatures[0]);
            console.log('extracted message:', extractedMessage);

            console.log('accounts size', accountKeys.length);
            console.log('signatures size', signatures.length);

            console.log("Account[1]", accountKeys[1].toString());
            console.log("Account[2]", accountKeys[2].toString());

            if (!isValid) {
                return reply.code(400).send({ error: "Cryptographic signature validation failed." });
            }

            const rows = await fastify.pg.query('SELECT * FROM accounts LIMIT 1;');
            console.log(rows);

            return reply.code(200).send({ success: true });
        }





        return 'this is signin2'
    })

}

export default signinroute
