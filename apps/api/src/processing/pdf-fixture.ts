// Arma un PDF mínimo válido en memoria, con una página por cada texto recibido.
// Solo ASCII: las fuentes estándar no codifican tildes sin configuración extra.

function escapePdfString(text: string): string {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildPdf(pages: string[]): Buffer {
    const objects: string[] = [];
    const pageIds = pages.map((_, i) => 4 + i * 2);

    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';

    pages.forEach((text, i) => {
        const pageId = pageIds[i];
        const contentId = pageId + 1;
        const stream = `BT /F1 24 Tf 72 720 Td (${escapePdfString(text)}) Tj ET`;
        objects[pageId] =
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
            `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
        objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let id = 1; id < objects.length; id++) {
        offsets[id] = pdf.length;
        pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) {
        pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

    return Buffer.from(pdf, 'latin1');
}