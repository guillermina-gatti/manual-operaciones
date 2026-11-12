// HU19: contact lookup with Prisma. Read-only. The procedure owner lives in team B's tables and the
// document owner in ours; both point to users by ID only (no Prisma relations), so the user is read
// in a second query.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactDirectory, type ContactPerson } from '../ports/contact-directory';

@Injectable()
export class PrismaContactDirectory extends ContactDirectory {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async findProcedureOwner(procedureVersionId: string): Promise<ContactPerson | null> {
        const version = await this.prisma.procedureVersion.findUnique({
            where: { id: procedureVersionId },
            select: { procedure: { select: { ownerId: true } } },
        });
        return version ? this.findUser(version.procedure.ownerId) : null;
    }

    async findDocumentOwner(documentId: string): Promise<ContactPerson | null> {
        const document = await this.prisma.document.findUnique({
            where: { id: documentId },
            select: { ownerId: true },
        });
        return document ? this.findUser(document.ownerId) : null;
    }

    // Only active users are suggested: an inactive owner cannot answer.
    private async findUser(userId: string): Promise<ContactPerson | null> {
        const user = await this.prisma.user.findFirst({
            where: { id: userId, isActive: true },
            select: { name: true, email: true },
        });
        return user ? { name: user.name, email: user.email } : null;
    }
}