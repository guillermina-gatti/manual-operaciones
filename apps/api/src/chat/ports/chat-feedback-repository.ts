// Puerto de valoraciones de respuestas (tabla message_feedback, HU25).
export interface FeedbackInput {
    useful: boolean;
    comment?: string;
}

export abstract class ChatFeedbackRepository {
    // false si el mensaje no existe o no pertenece a una conversación del usuario.
    abstract saveFeedback(userId: string, messageId: string, input: FeedbackInput): Promise<boolean>;
}