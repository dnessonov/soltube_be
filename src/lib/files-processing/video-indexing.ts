// import path from "node:path";
import {promises as fs} from "node:fs";

class Mp4VideoParser {

    public debug_level = 0;

    private frameBuf :Buffer<ArrayBuffer>;
    private frameByteIndex :number;

    private currentFrameType :string;
    private currentFrameSize :number;

    private currentFrameFileOffset :number | undefined;

    private currentFrameIsSkipping: boolean;
    private currentFrameHeaderSize :number;

    public maxAllowedFrameSize :number = /*32767*/ 4096*4096;

    public totalFramesSize :number; // for debugging

    public frameTypes = ["moof","moov"];

    public detectedValues :any;
    public detectedTracks :any[];

    public detectedMoofs :any[];

    private binaryBytesProcessed :number = 0;

    constructor() {
        this.frameBuf = Buffer.allocUnsafe(64*1024);
        this.frameByteIndex = 0;

        this.currentFrameType = "";
        this.currentFrameSize = 0;
        this.currentFrameFileOffset = undefined;
        this.currentFrameHeaderSize = 8;
        this.totalFramesSize = 0;
        this.currentFrameIsSkipping = false;

        this.detectedValues = {};
        this.detectedTracks = [];

        this.detectedMoofs = [];
        this.binaryBytesProcessed = 0;
    }

    public async processFrame(frameType:string, frameBuf :Buffer<ArrayBuffer>, frameBufDataLength :number){
        switch (frameType) {
            case "moof":
                await this.processMoofFrame(frameBuf, frameBufDataLength);
                break;

            case "moov":
                await this.processMoovFrame(frameBuf, frameBufDataLength);
                break;
        }
        if(this.debug_level > 2){console.log(`Received frame of type ${frameType} of size ${frameBufDataLength} bytes. Processing...`);}
    }

    private getFrameTypeString(buf :Buffer<ArrayBuffer>, offset:number) :string {
        return buf.toString('ascii', offset, offset+4);
    }

    public async processMoofFrame(frameBuf :Buffer<ArrayBuffer>, frameBufDataLength :number){
        await this.processFrameSubs(frameBuf,frameBufDataLength, async (subType, subData) => {
            const subSize = subData.length;
            switch(subType){
                case 'traf':
                    const thisMoofBox :any = {};
                    await this.processFrameSubs(subData,subData.length, async (trafSubType, trafSubData) => {
                        switch(trafSubType){
                            case 'tfdt':
                                const version = trafSubData.readUInt8(0);
                                let baseMediaDecodeTime = 0;

                                if(version === 1){
                                    // Read 64-bit integer timestamp
                                    const high = trafSubData.readUint32BE(4);
                                    const low = trafSubData.readUint32BE(8);
                                    baseMediaDecodeTime = (high * 0x100000000) + low;
                                }else{
                                    baseMediaDecodeTime = trafSubData.readUint32BE(4);
                                }
                                if(this.debug_level > 1){console.log("Length/Version/Ticks:", trafSubData.length, version, baseMediaDecodeTime);}
                                thisMoofBox.ticks = baseMediaDecodeTime;
                                break;

                            case 'tfhd':
                                const tfhdVersion = trafSubData.readUInt8(0);
                                if(tfhdVersion === 0){
                                    const tfhdTrackId = trafSubData.readUint32BE(4);
                                    if(this.debug_level > 2){ console.log("Track #:", tfhdTrackId); }
                                    thisMoofBox.trackId = tfhdTrackId;
                                }else{
                                    console.log(`     tfhd version ${tfhdVersion} is not supported. Panic!`);
                                }
                                break;
                            default:
                                if(this.debug_level > 1){console.log(`  Got moof/traf sub "${trafSubType}" of size ${trafSubData.length} bytes.`);}
                                break;
                        }
                    });
                    await this.ingestMoofIndex(thisMoofBox);
                    break;

                default:
                    if(this.debug_level > 1){console.log(`  Got moof sub "${subType}" of size ${subSize}.`);}
                    break;

            }
        });

    }

    private async ingestMoofIndex(moofBoxInfo :any){
        if((moofBoxInfo.trackId !== undefined) && (moofBoxInfo.ticks !== undefined)){
            // find corresponding trackId
            this.detectedTracks.forEach((trackInfo : any) => {
                if((trackInfo.trackId === moofBoxInfo.trackId) && (trackInfo.timescale !== undefined) && (trackInfo.handlerType === 'vide')){
                    const startPositionInSecondsDiv2 = Math.floor(moofBoxInfo.ticks / (trackInfo.timescale / 2) );
                    this.detectedMoofs.push([startPositionInSecondsDiv2,this.currentFrameFileOffset])
                }
            })
        }
    }

    public async processMoovFrame(frameBuf :Buffer<ArrayBuffer>, frameBufDataLength :number){
        await this.processFrameSubs(frameBuf,frameBufDataLength, async (subType, subData) => {
            const subSize = subData.length;
            switch(subType){
                case 'mvhd':
                    const version = subData.readUInt8(0);
                    const timescaleOffset :number = version === 1 ? 20 : 12;
                    const videoScale = subData.readUInt32BE(timescaleOffset);
                    this.detectedValues.videoScale = videoScale;
                    if(this.debug_level > 2){console.log("Read videoScale from mvhd frame:", videoScale, version);}
                    break;

                case 'trak':
                    console.log(` Got moov/trak of size ${subSize}. Parsing:`);
                    let thisTrackInfo :any = {};
                    await this.processFrameSubs(subData,subSize, async (subTrakType, subTrakData) => {
                        switch(subTrakType){
                            case 'mdia':
                                await this.processFrameSubs(subTrakData,subTrakData.length, async (subTrakMdiaType, subTrakMdiaData) => {
                                    switch(subTrakMdiaType){
                                        case 'mdhd':
                                            const mdhdVersion = subTrakMdiaData.readUInt8(0);
                                            let trackTimescale : number | undefined = undefined;
                                            let trackLengthInTimescaleUnits : number | undefined = undefined;
                                            if(mdhdVersion === 0){
                                                trackTimescale = subTrakMdiaData.readUInt32BE(12);
                                                trackLengthInTimescaleUnits = subTrakMdiaData.readUInt32BE(16); // equals to zero if length is undefined
                                            }

                                            thisTrackInfo.timescale = trackTimescale;
                                            thisTrackInfo.lengthInTimescaleUnits = trackLengthInTimescaleUnits;

                                            if(this.debug_level > 2){console.log(`    Got moov/trak/mdia/mdhd version (${mdhdVersion}), timescale ${trackTimescale}, tlen ${trackLengthInTimescaleUnits}, size ${subTrakMdiaData.length}.`);}
                                            break;

                                        case 'minf':
                                            if(this.debug_level > 2){console.log(`    Got moov/trak/mdia/minf of size ${subTrakMdiaData.length}.`);}
                                            await this.processFrameSubs(subTrakMdiaData,subTrakMdiaData.length, async (subTrakMdiaMinfType, subTrakMdiaMinfData) => {
                                                /*switch (subTrakMdiaMinfType){

                                                }*/
                                                if(this.debug_level > 2){console.log(`      Got moov/trak/mdia/minf sub "${subTrakMdiaMinfType}" of size ${subTrakMdiaMinfData.length}.`);}
                                            });
                                            break;

                                        case 'hdlr':
                                            const hdlrVersion = subTrakMdiaData.readUInt8(0);
                                            let hdlrType :string = "";
                                            let hdlrTrackLabel :string = "";
                                            if(hdlrVersion === 0){
                                                hdlrType = subTrakMdiaData.toString('ascii', 8, 12);
                                                hdlrTrackLabel = subTrakMdiaData.toString('ascii', 24, subTrakMdiaData.length-1);
                                                if(this.debug_level > 1){console.log(`      Got moov/trak/mdia/hdlr type "${hdlrType}" Label "${hdlrTrackLabel}"`);}

                                                thisTrackInfo.handlerType = hdlrType;
                                                thisTrackInfo.label = hdlrTrackLabel;
                                            }else{
                                                console.log(`      hdlr version ${hdlrVersion} is not supported. Panic!`);
                                            }
                                            break;
                                        default:
                                            if(this.debug_level > 2){console.log(`    Got moov/trak/mdia sub "${subTrakMdiaType}" of size ${subTrakMdiaData.length}.`);}
                                            break;
                                    }
                                });
                                break;


                            case 'trak':
                                if(this.debug_level > 2){console.log(`   Got moov/trak/trak of size ${subTrakData.length}. Parsing:`);}
                                await this.processFrameSubs(subTrakData,subTrakData.length, async (subTrakTrakType, subTrakTrakData) => {
                                    switch(subTrakTrakType){
                                        case 'mdia':
                                            await this.processFrameSubs(subTrakTrakData,subTrakTrakData.length, async (subTrakTrakMdiaType, subTrakTrakMdiaData) => {
                                                switch(subTrakTrakMdiaType){
                                                    case 'mdhd':
                                                        const mdhdVersion = subTrakTrakMdiaData.readUInt8(0);
                                                        let trackTimeScale :number | undefined = undefined;
                                                        if(mdhdVersion === 0){
                                                            trackTimeScale = subTrakTrakMdiaData.readUInt32BE(12);
                                                            if(this.debug_level > 2){console.log(`     Got moov/trak/trak/mdia/mdhd timescale is ${trackTimeScale}`);}
                                                            thisTrackInfo.timescale = trackTimeScale;
                                                        }else{
                                                            console.log(`     mdhd version ${mdhdVersion} is not supported. Panic!`);
                                                            trackTimeScale = undefined;
                                                        }

                                                        break;

                                                    case 'hdlr':
                                                        const hdlrVersion = subTrakTrakMdiaData.readUInt8(0);
                                                        let trackHandlerType :string | undefined = undefined;
                                                        if(hdlrVersion === 0){
                                                            trackHandlerType = subTrakTrakMdiaData.toString('ascii', 8, 12);
                                                            if(this.debug_level > 1){console.log(`     Got moov/trak/trak/mdia/hdlr (audio/video) is ${trackHandlerType}`);}
                                                            thisTrackInfo.handlerType = trackHandlerType;
                                                        }else{
                                                            console.log(`     hdlr version ${hdlrVersion} is not supported. Panic!`);
                                                            trackTimeScale = undefined;
                                                        }

                                                        break;


                                                    case 'minf':
                                                        if(this.debug_level > 2){console.log(`    Got moov/trak/trak/mdia/minf of size ${subTrakTrakMdiaData.length}.`);}
                                                        await this.processFrameSubs(subTrakTrakMdiaData,subTrakTrakMdiaData.length, async (subTrakTrakMdiaMinfType, subTrakTrakMdiaMinfData) => {
                                                            /*switch (subTrakMdiaMinfType){

                                                            }*/
                                                            if(this.debug_level > 2){console.log(`      Got moov/trak/mdia/minf sub "${subTrakTrakMdiaMinfType}" of size ${subTrakTrakMdiaMinfData.length}.`);}
                                                        });
                                                        break;

                                                    default:
                                                        if(this.debug_level > 2){console.log(`    Got moov/trak/trak/mdia sub "${subTrakTrakMdiaType}" of size ${subTrakTrakMdiaData.length}.`);}
                                                        break;
                                                }
                                            });
                                            break;

                                        default:
                                            if(this.debug_level > 2){console.log(`   Got moov/trak/trak sub "${subTrakTrakType}" of size ${subTrakTrakData.length}.`);}
                                            break;
                                    }
                                });
                                break;


                            case 'tkhd':
                                const tkhdVersion = subTrakData.readUInt8(0);
                                let tkhdTrackId :number | undefined = undefined;
                                switch (tkhdVersion){
                                    case 0:
                                        tkhdTrackId = subTrakData.readUInt32BE(12);
                                        break;
                                    case 1:
                                        tkhdTrackId = subTrakData.readUInt32BE(20);
                                        break;

                                    default:
                                        console.log(`     trak/tkhd version ${tkhdVersion} is not supported. Panic!`);
                                        break;
                                }

                                thisTrackInfo.trackId = tkhdTrackId;
                                if(this.debug_level > 2){console.log(`   Moov/trak TrackID: ${tkhdTrackId}`);}
                                break;

                            default:
                                if(this.debug_level > 1){console.log(`  Got moov/trak sub "${subTrakType}" of size ${subTrakData.length}.`);}
                                break;
                        }
                    });

                    if(thisTrackInfo){
                        this.detectedTracks.push(thisTrackInfo);
                    }

                    break;

                default:
                    if(this.debug_level > 2){console.log(`  Got moov sub "${subType}" of size ${subSize}.`);}
                    break;

            }
            return;
        });
    }

    public async processFrameSubs(frameBuf :Buffer<ArrayBuffer>, frameBufDataLength :number, processBufFunc :(subType :string, subData :Buffer<ArrayBuffer>) => Promise<void>){
        let subOffset = 0;
        while(subOffset<frameBufDataLength){
            const subSize = frameBuf.readUInt32BE(subOffset);
            const subType = this.getFrameTypeString(frameBuf,subOffset+4);
            await processBufFunc(subType,frameBuf.subarray(subOffset+8, subOffset+subSize));
            subOffset+=subSize;
        }
    }

    public async ingestBinaryData(binaryData :Buffer<ArrayBuffer>, bufLength :number) {
        let binaryDataBytesProcessed = 0;
        let numRemainingFrameBytes = 0;

        const binaryDataBytesToProcess = Math.min(binaryData.length, bufLength);
        while (binaryDataBytesProcessed < binaryDataBytesToProcess) {

            if (this.frameByteIndex < 8) {
                const numBytes = Math.min(8 - this.frameByteIndex, binaryDataBytesToProcess - binaryDataBytesProcessed);
                binaryData.copy(this.frameBuf, this.frameByteIndex, binaryDataBytesProcessed, binaryDataBytesProcessed + numBytes);
                this.frameByteIndex += numBytes;
                binaryDataBytesProcessed += numBytes; this.binaryBytesProcessed += numBytes;
            }
            if ((this.frameByteIndex === 8) && (binaryDataBytesProcessed > 0)) {
                this.currentFrameSize = this.frameBuf.readUInt32BE(0); // size includes header (8 bytes)
                this.currentFrameType = this.frameBuf.toString('ascii', 4, 8);
                this.currentFrameFileOffset = this.binaryBytesProcessed - 8;

                if (this.currentFrameSize === 1) {
                    this.currentFrameHeaderSize = 16;
                    // TODO: In this specific scenario, an extra 8 bytes will immediately follow the type string, containing a true 64-bit size integer.
                    console.log("Received large frame (8-byte Uint represent size). Processing not implemented (is a TODO). Panic!");
                    return;
                }else{
                    this.currentFrameHeaderSize = 8;
                    this.currentFrameIsSkipping = (this.frameTypes.indexOf(this.currentFrameType) === -1);

                    if (!this.currentFrameIsSkipping && (this.currentFrameSize > this.frameBuf.length)) {
                        // enlarge this.frameBuf
                        if(this.currentFrameSize > this.maxAllowedFrameSize) {
                            if(this.debug_level > 1){console.log(`Enlarging buffer to ${this.currentFrameSize} exceeds maximum allowed ${this.maxAllowedFrameSize}. Skipping the frame...`, );}
                            this.currentFrameIsSkipping = true;
                        }else{
                            if(this.debug_level > 1){console.log("Enlarging buffer to ", this.currentFrameSize);}
                            this.frameBuf = Buffer.allocUnsafe(this.currentFrameSize + 15);
                        }
                    }
                }
            }


            if (this.frameByteIndex >= this.currentFrameHeaderSize) {
                numRemainingFrameBytes = Math.min(binaryDataBytesToProcess - binaryDataBytesProcessed, this.currentFrameSize - this.frameByteIndex);

                if(!this.currentFrameIsSkipping){
                    binaryData.copy(this.frameBuf, this.frameByteIndex - this.currentFrameHeaderSize, binaryDataBytesProcessed, numRemainingFrameBytes + binaryDataBytesProcessed);
                }

                this.frameByteIndex += numRemainingFrameBytes;
                binaryDataBytesProcessed += numRemainingFrameBytes; this.binaryBytesProcessed += numRemainingFrameBytes;

                if ((this.frameByteIndex === this.currentFrameSize) && (this.currentFrameSize > 0)) {

                    if(!this.currentFrameIsSkipping){
                        // process current  frame
                        await this.processFrame(this.currentFrameType, this.frameBuf, this.currentFrameSize - this.currentFrameHeaderSize);
                    }else {
                        if(this.debug_level > 2){console.log(`Received frame of type ${this.currentFrameType} of size ${this.currentFrameSize} bytes. Skipping...`);}
                    }
                    this.totalFramesSize += this.currentFrameSize;

                    // reset current frame
                    this.currentFrameSize = 0;
                    this.currentFrameType = "";
                    this.frameByteIndex = 0;
                }
            }
        }
    }

    public async ingestEos(){
        if(this.frameByteIndex < 8){
            // TODO: error
        }
    }

}

/*const sleep = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
};*/

export async function generateVideoIndexMap(inFileFullPath :string) {
    const fileHandle = await fs.open(inFileFullPath, 'r');

    try {
        const buf= Buffer.allocUnsafe(128*1024);

        let isEof = false;
        const parser: Mp4VideoParser = new Mp4VideoParser();

        let offset = 0;

        while(!isEof) {
            const { bytesRead } = await fileHandle.read({
                buffer: buf,
                offset: 0,
                length: buf.length,
                position: offset
            });

            // console.log(`Read ${bytesRead} bytes. Ingesting them to parser.`);
            if(bytesRead === 0){
                isEof = true;
            }else{
                offset += bytesRead;
                await parser.ingestBinaryData(buf, bytesRead);
            }
        }
        //console.log(`Finished at offset ${offset} bytes. Total frames size ${parser.totalFramesSize} bytes.`);

        //console.log("Tracks:", parser.detectedTracks);
        if(parser.debug_level > 1){console.log("Index: ", JSON.stringify(parser.detectedMoofs));}
        await fileHandle.close();

        return {
            tracks: parser.detectedTracks,
            moof_index: parser.detectedMoofs
        }

    } catch (err: any) {
        await fileHandle.close();
    }
}
