// HU19: port used to suggest who to ask when the assistant has no information. It only reads the
// owner (name and email) of a procedure or of a document; it never writes anything.
export interface ContactPerson {
    name: string;
    email: string;
}

export abstract class ContactDirectory {
    // Owner of the procedure that a procedure version belongs to, or null if it cannot be found.
    abstract findProcedureOwner(procedureVersionId: string): Promise<ContactPerson | null>;

    // Owner ("responsable") of a document, or null if it cannot be found.
    abstract findDocumentOwner(documentId: string): Promise<ContactPerson | null>;
}