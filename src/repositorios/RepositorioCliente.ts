import { RepositorioBase } from './RepositorioBase';
import { Client } from '@/tipos/credito';

export class RepositorioCliente extends RepositorioBase {
    private static safeStr(val: any): string {
        return JSON.stringify(val || []);
    }

    static async findAll(): Promise<any[]> {
        return await this.query('SELECT * FROM clients WHERE deletedAt IS NULL');
    }

    static async findDeleted(): Promise<any[]> {
        return await this.query('SELECT * FROM clients WHERE deletedAt IS NOT NULL');
    }

    static async insert(client: Client): Promise<void> {
        const sql = 'INSERT INTO clients (id, name, nif, phone, email, address, creditLimit, usedCredit, availableCredit, monthlyIncome, defaultInterestRate, lateInterestRate, toleranceDays, status, riskLevel, whatsappVerified, documents, bankCoordinates, receiveMethod, lastContacted, createdAt, usuario_id, birthDate, age, issueDate, expiryDate, gender, maritalStatus, fatherName, motherName, workInstitution, socialSecurityNumber, spouseName, spouseBi, spouseNif, spousePhone, spouseEmail, legalRepresentative, legalRepRole) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
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
            client.legalRepRole || null
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
            legalRepRole = COALESCE(?, legalRepRole)
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
            id
        ];
        await this.execute(sql, params);
    }

    static async softDelete(id: string, userId: string, originalState?: string): Promise<void> {
        await this.execute('UPDATE clients SET deletedAt = ?, deletedBy = ?, originalState = ? WHERE id = ?', [new Date().toISOString(), userId, originalState, id]);
    }

    static async restore(id: string): Promise<void> {
        await this.execute('UPDATE clients SET deletedAt = NULL, restoredAt = ? WHERE id = ?', [new Date().toISOString(), id]);
    }

    static async hardDelete(id: string): Promise<void> {
        await this.execute('DELETE FROM clients WHERE id = ?', [id]);
    }
}
