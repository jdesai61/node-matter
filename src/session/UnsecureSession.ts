import { Packet, Message, MessageCodec } from "../codec/MessageCodec";
import { Session } from "./SessionManager";

export class UnsecureSession implements Session {
    decode(packet: Packet): Message {
        return MessageCodec.decodePayload(packet);
    }

    encode(message: Message): Packet {
        return MessageCodec.encodePayload(message);
    }

    getAttestationChallengeKey(): Buffer {
        throw new Error("Not supported on an unsecure session");
    }

    setFabricIndex(index: number): void {
        throw new Error("Not supported on an unsecure session");
    }
}
