import { Crypto } from "../crypto/Crypto";
import { getSessionManager } from "../session/SessionManager";
import { PaseMessenger } from "./PaseMessenger";
import { ExchangeHandler, MessageExchange } from "../transport/Dispatcher";
import { PbkdfParameters, Spake2p } from "../crypto/Spake2p";

const DEFAULT_PASSCODE_ID = 0;
const SPAKE_CONTEXT = Buffer.from("CHIP PAKE V1 Commissioning");

export class PasePairing implements ExchangeHandler {
    private sessionManager = getSessionManager();

    constructor(
        private readonly setupPinCode: number,
        private readonly pbkdfParameters: PbkdfParameters,
        ) {}

    async onNewExchange(exchange: MessageExchange) {
        const messenger = new PaseMessenger(exchange);
        try {
            await this.handlePairingRequest(messenger);
        } catch (error) {
            console.log("An error occured during the commissioning", error);
            await messenger.sendError();
        }
    }

    private async handlePairingRequest(messenger: PaseMessenger) {
        console.log(`Pase: Received pairing request from ${messenger.getChannelName()}`);
        const sessionId = this.sessionManager.getNextAvailableSessionId();
        const random = Crypto.getRandom();

        // Read pbkdRequest and send pbkdResponse
        const { requestPayload, request: { random: peerRandom, mrpParameters, passcodeId, hasPbkdfParameters, sessionId: peerSessionId } } = await messenger.readPbkdfParamRequest();
        if (passcodeId !== DEFAULT_PASSCODE_ID) throw new Error(`Unsupported passcode ID ${passcodeId}`);
        const responsePayload = await messenger.sendPbkdfParamResponse({ peerRandom, random, sessionId, mrpParameters, pbkdfParameters: hasPbkdfParameters ? undefined : this.pbkdfParameters });

        // Process pake1 and send pake2
        const spake2p = await Spake2p.create(Crypto.hash([ SPAKE_CONTEXT, requestPayload, responsePayload ]), this.pbkdfParameters, this.setupPinCode);
        const { x: X } = await messenger.readPasePake1();
        const Y = spake2p.computeY();
        const { Ke, hAY, hBX } = await spake2p.computeSecretAndVerifiersFromX(X, Y);
        await messenger.sendPasePake2({ y: Y, verifier: hBX });

        // Read and process pake3
        const { verifier } = await messenger.readPasePake3();
        if (!verifier.equals(hAY)) throw new Error("Received incorrect key confirmation from the initiator");

        // All good! Creating secure session
        await this.sessionManager.createSecureSession(sessionId, peerSessionId, Ke, Buffer.alloc(0), false);
        await messenger.sendSuccess();
        console.log(`Pase: Paired succesfully with ${messenger.getChannelName()}`);
    }
}