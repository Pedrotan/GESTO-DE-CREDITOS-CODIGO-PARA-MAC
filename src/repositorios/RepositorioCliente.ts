import { RepositorioBase } from './RepositorioBase';
import { db } from '@/bibliotecas/bd';
import { Client } from '@/tipos/credito';

export class RepositorioCliente extends RepositorioBase {
    private static safeStr(val: any): string {
        return JSON.stringify(val || []);
    }

    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM clients WHERE deletedAt IS NULL');
    }

    static async findDeleted(): Promise<any[]> {
        // Os purgados («apagar definitivamente») já não aparecem na lixeira nem podem ser restaurados.
        return await this.query("SELECT * FROM clients WHERE deletedAt IS NOT NULL AND COALESCE(deletedBy, '') NOT LIKE 'purged:%'");
    }

    static async insert(client: Client): Promise<void> {
        const sql = 'INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber, spouseName, spouseBi, spouseNif, spousePhone, spouseEmail, legalRepresentative, legalRepRole, spouseBirthDate, spouseOccupation, spouseIncome, spouseDataRefused, spouseDataRefusedAt, spouseDataRefusedBy, spouseConsentAt, spouseConsentBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        const params = [
            client.id, client.name, client.nif, client.phone, client.email, client.address,
            client.creditLimit, client.usedCredit, client.availableCredit, client.monthlyIncome || 0,
            client.defaultInterestRate, client.lateInterestRate, client.toleranceDays,
            client.status, client.riskLevel, client.whatsappVerified ? 1 : 0,
            this.safeStr(client.documents), this.safeStr(client.bankCoordinates),
            client.receiveMethod, (client.lastContacted && !isNaN(client.lastContacted.getTime())) ? client.lastContacted.toISOString() : null,
            (client.createdAt && !isNaN(client.createdAt.getTime())) ? client.createdAt.toISOString() : new Date().toISOString(),
            client.usuario_id,
            client.birthDate || null,
            client.age ?? null,
            client.issueDate || null,
            client.expiryDate || null,
            client.gender || null,
            client.maritalStatus || null,
            client.fatherName || null,
            client.motherName || null,
            client.workInstitution || null,
            client.socialSecurityNumber || null,
            client.spouseName || null,
            client.spouseBi || null,
            client.spouseNif || null,
            client.spousePhone || null,
            client.spouseEmail || null,
            client.legalRepresentative || null,
            client.legalRepRole || null,
            client.spouseBirthDate || null,
            client.spouseOccupation || null,
            client.spouseIncome ?? null,
            client.spouseDataRefused ? 1 : 0,
            client.spouseDataRefusedAt || null,
            client.spouseDataRefusedBy || null,
            client.spouseConsentAt || null,
            client.spouseConsentBy || null
        ];
        await this.execute(sql, params);
    }

    static async update(id: string, updates: Partial<Client>): Promise<void> {
        const jsonOrNull = (val: any) => val === undefined ? null : this.safeStr(val);
        const sql = `UPDATE clients SET
            name = COALESCE(?, name),
            nif = COALESCE(?, nif),
            phone = COALESCE(?, phone),
            email = COALESCE(?, email),
            address = COALESCE(?, address),
            creditLimit = COALESCE(?, creditLimit),
            usedCredit = COALESCE(?, usedCredit),
            availableCredit = COALESCE(?, availableCredit),
            monthlyIncome = COALESCE(?, monthlyIncome),
            defaultInterestRate = COALESCE(?, defaultInterestRate),
            lateInterestRate = COALESCE(?, lateInterestRate),
            toleranceDays = COALESCE(?, toleranceDays),
            status = COALESCE(?, status),
            riskLevel = COALESCE(?, riskLevel),
            whatsappVerified = COALESCE(?, whatsappVerified),
            documents = COALESCE(?, documents),
            bankCoordinates = COALESCE(?, bankCoordinates),
            receiveMethod = COALESCE(?, receiveMethod),
            lastContacted = COALESCE(?, lastContacted),
            usuario_id = COALESCE(?, usuario_id),
            birthDate = COALESCE(?, birthDate),
            age = COALESCE(?, age),
            issueDate = COALESCE(?, issueDate),
            expiryDate = COALESCE(?, expiryDate),
            gender = COALESCE(?, gender),
            maritalStatus = COALESCE(?, maritalStatus),
            fatherName = COALESCE(?, fatherName),
            motherName = COALESCE(?, motherName),
            workInstitution = COALESCE(?, workInstitution),
            socialSecurityNumber = COALESCE(?, socialSecurityNumber),
            spouseName = COALESCE(?, spouseName),
            spouseBi = COALESCE(?, spouseBi),
            spouseNif = COALESCE(?, spouseNif),
            spousePhone = COALESCE(?, spousePhone),
            spouseEmail = COALESCE(?, spouseEmail),
            legalRepresentative = COALESCE(?, legalRepresentative),
            legalRepRole = COALESCE(?, legalRepRole),
            spouseBirthDate = COALESCE(?, spouseBirthDate),
            spouseOccupation = COALESCE(?, spouseOccupation),
            spouseIncome = COALESCE(?, spouseIncome),
            spouseDataRefused = COALESCE(?, spouseDataRefused),
            spouseDataRefusedAt = COALESCE(?, spouseDataRefusedAt),
            spouseDataRefusedBy = COALESCE(?, spouseDataRefusedBy),
            spouseConsentAt = COALESCE(?, spouseConsentAt),
            spouseConsentBy = COALESCE(?, spouseConsentBy)
            WHERE id = ?`;
        const params = [
            updates.name, updates.nif, updates.phone, updates.email, updates.address,
            updates.creditLimit, updates.usedCredit, updates.availableCredit, updates.monthlyIncome ?? null,
            updates.defaultInterestRate, updates.lateInterestRate, updates.toleranceDays,
            updates.status, updates.riskLevel, updates.whatsappVerified === undefined ? null : (updates.whatsappVerified ? 1 : 0),
            jsonOrNull(updates.documents), jsonOrNull(updates.bankCoordinates),
            updates.receiveMethod, (updates.lastContacted && !isNaN(updates.lastContacted.getTime())) ? updates.lastContacted.toISOString() : null,
            updates.usuario_id,
            updates.birthDate ?? null,
            updates.age ?? null,
            updates.issueDate ?? null,
            updates.expiryDate ?? null,
            updates.gender ?? null,
            updates.maritalStatus ?? null,
            updates.fatherName ?? null,
            updates.motherName ?? null,
            updates.workInstitution ?? null,
            updates.socialSecurityNumber ?? null,
            updates.spouseName ?? null,
            updates.spouseBi ?? null,
            updates.spouseNif ?? null,
            updates.spousePhone ?? null,
            updates.spouseEmail ?? null,
            updates.legalRepresentative ?? null,
            updates.legalRepRole ?? null,
            updates.spouseBirthDate ?? null,
            updates.spouseOccupation ?? null,
            updates.spouseIncome ?? null,
            updates.spouseDataRefused === undefined ? null : (updates.spouseDataRefused ? 1 : 0),
            updates.spouseDataRefusedAt ?? null,
            updates.spouseDataRefusedBy ?? null,
            updates.spouseConsentAt ?? null,
            updates.spouseConsentBy ?? null,
            id
        ];
        await this.execute(sql, params);
    }

    /** Envia o cliente e todos os créditos dele para a lixeira (os pagamentos desses créditos deixam de aparecer). */
    static async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        const now = new Date().toISOString();
        await db.transaction([
            { sql: 'UPDATE clients SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', params: [now, userId, originalState, id] },
            { sql: 'UPDATE credits SET deletedAt = ?, deletedBy = ? WHERE clientId = ? AND deletedAt IS NULL', params: [now, userId, id] },
        ]);
    }

    /** Restaura o cliente e os créditos que foram para a lixeira com ele (mesma data de eliminação). */
    static async restore(id: string): Promise<void> {
        const now = new Date().toISOString();
        await db.transaction([
            { sql: 'UPDATE credits SET deletedAt = NULL, restoredAt = ? WHERE clientId = ? AND deletedAt = (SELECT deletedAt FROM clients WHERE id = ?)', params: [now, id, id] },
            { sql: 'UPDATE clients SET deletedAt = NULL, restoredAt = ? WHERE id = ?', params: [now, id] },
        ]);
    }

    /**
     * «Apagar definitivamente»: o cliente e os créditos dele saem da lixeira e de todo o sistema, sem restauro. Os
     * lançamentos contabilísticos e a auditoria são imutáveis (lei e cadeia de hashes) e ficam como histórico;
     * apagar as linhas deixava a contabilidade com lançamentos órfãos e criava divergências em todos os computadores.
     */
    static async purge(id: string, userId: string): Promise<void> {
        const marker = `purged:${userId}`;
        await db.transaction([
            { sql: 'UPDATE credits SET deletedAt = COALESCE(deletedAt, ?), deletedBy = ?, originalState = NULL WHERE clientId = ?', params: [new Date().toISOString(), marker, id] },
            { sql: 'UPDATE clients SET deletedBy = ?, originalState = NULL WHERE id = ? AND deletedAt IS NOT NULL', params: [marker, id], expectChanges: 1 },
        ]);
    }
}
