import { db } from '@/bibliotecas/bd';

export abstract class RepositorioBase<T = any> {
    protected tableName: string;

    constructor(tableName: string) {
        this.tableName = tableName;
    }

    protected static async query<T>(sql: string, params: any[] = []): Promise<T[]> {
        return await db.all<T>(sql, params);
    }

    protected static async get<T>(sql: string, params: any[] = []): Promise<T | null> {
        return await db.get<T>(sql, params);
    }

    protected static async execute(sql: string, params: any[] = []): Promise<void> {
        await db.run(sql, params);
    }

    // Instance methods for non-static usage
    protected async queryInstance<R = T>(sql: string, params: any[] = []): Promise<R[]> {
        return await db.all<R>(sql, params);
    }

    protected async getInstance<R = T>(sql: string, params: any[] = []): Promise<R | undefined> {
        return await db.get<R>(sql, params);
    }

    protected async executeInstance(sql: string, params: any[] = []): Promise<void> {
        await db.run(sql, params);
    }
}




